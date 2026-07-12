import { google } from '@ai-sdk/google'
import { streamText, generateText, tool, convertToModelMessages, LanguageModel } from 'ai'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateOrderShortId } from '@/lib/utils'

export const maxDuration = 60

// Models to try in order — fastest/cheapest first, most capable last
// We test all and use the first that doesn't throw a quota/auth error
const GEMINI_MODEL_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

function isQuotaOrRateError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('RATE_LIMIT_EXCEEDED')
  )
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await request.json()

  // ai v7: useChat sends UIMessages (with parts arrays). Convert to model messages.
  const modelMessages = await convertToModelMessages(messages)

  // Token Optimization: Keep only the last 6 messages, but avoid breaking tool-call sequences
  const sliceMessages = (msgs: any[], maxLimit = 6) => {
    if (msgs.length <= maxLimit) return msgs
    let startIndex = msgs.length - maxLimit
    while (startIndex > 0) {
      const msg = msgs[startIndex]
      const isTool = msg.role === 'tool'
      const hasToolPart = msg.parts?.some((p: any) => p.type === 'tool-result')
      if (!isTool && !hasToolPart) break
      startIndex--
    }
    return msgs.slice(startIndex)
  }

  const optimizedMessages = sliceMessages(modelMessages)

  const systemPrompt = `You are the DeliveryTracker assistant. User is ${session.user.name} (${session.user.role}).
Help with: order status, timelines, rescheduling, charge breakdowns.
Rules: Be concise and professional. Use ₹ and Indian dates. Use tools for all order queries.`

  const tools = {
    getOrderStatus: tool({
      description: 'Get the current status and full tracking timeline of a delivery order',
      inputSchema: z.object({
        orderId: z.string().describe('Order ID or last 8 characters of order ID'),
      }),
      execute: async ({ orderId }) => {
        const order = await prisma.order.findFirst({
          where: {
            OR: [
              { id: orderId },
              { id: { endsWith: orderId.toLowerCase() } },
            ],
            ...(session.user.role === 'CUSTOMER' ? { customerId: session.user.id } : {}),
          },
          include: {
            trackingEvents: { orderBy: { timestamp: 'asc' } },
            agent: { select: { name: true, phone: true } },
            pickupZone: { select: { name: true } },
            dropZone: { select: { name: true } },
          },
        })
        if (!order) return { error: 'Order not found or access denied' }
        return {
          shortId: generateOrderShortId(order.id),
          status: order.status,
          pickupAddress: order.pickupAddress,
          dropAddress: order.dropAddress,
          totalCharge: order.totalCharge,
          paymentType: order.paymentType,
          agentName: order.agent?.name || 'Not yet assigned',
          agentPhone: order.agent?.phone || 'N/A',
          pickupZone: order.pickupZone?.name,
          dropZone: order.dropZone?.name,
          scheduledDate: order.scheduledDate,
          canReschedule: order.status === 'FAILED',
          trackingTimeline: order.trackingEvents.map((e) => ({
            status: e.status,
            notes: e.notes,
            timestamp: new Date(e.timestamp).toLocaleString('en-IN'),
          })),
        }
      },
    }),
    getChargeBreakdown: tool({
      description: 'Get detailed pricing breakdown for an order including volumetric weight and COD charges',
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        const order = await prisma.order.findFirst({
          where: {
            OR: [{ id: orderId }, { id: { endsWith: orderId.toLowerCase() } }],
            ...(session.user.role === 'CUSTOMER' ? { customerId: session.user.id } : {}),
          },
          select: {
            actualWeight: true,
            volumetricWeight: true,
            billedWeight: true,
            packageLength: true,
            packageBreadth: true,
            packageHeight: true,
            baseCharge: true,
            codSurcharge: true,
            totalCharge: true,
            orderType: true,
            paymentType: true,
          },
        })
        if (!order) return { error: 'Order not found' }
        return {
          ...order,
          formula: `Volumetric Weight = (${order.packageLength} × ${order.packageBreadth} × ${order.packageHeight}) ÷ 5000 = ${order.volumetricWeight} kg`,
          billedWeightReason:
            order.billedWeight === order.actualWeight
              ? 'Billed on actual weight (heavier than volumetric)'
              : 'Billed on volumetric weight (heavier than actual)',
        }
      },
    }),
    getMyOrders: tool({
      description: 'Get a list of recent orders for the current customer',
      inputSchema: z.object({
        limit: z.number().optional().default(5),
      }),
      execute: async ({ limit }) => {
        if (session.user.role !== 'CUSTOMER') return { error: 'This tool is for customers only' }
        const orders = await prisma.order.findMany({
          where: { customerId: session.user.id },
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: { id: true, status: true, totalCharge: true, createdAt: true, dropAddress: true },
        })
        return orders.map((o) => ({
          shortId: generateOrderShortId(o.id),
          id: o.id,
          status: o.status,
          totalCharge: o.totalCharge,
          dropAddress: o.dropAddress,
          createdAt: new Date(o.createdAt).toLocaleDateString('en-IN'),
        }))
      },
    }),
  }

  // Try each model in sequence — verify availability synchronously, skip on all errors
  let lastError: unknown = null

  for (const modelId of GEMINI_MODEL_FALLBACKS) {
    try {
      console.log(`[chat] Testing model availability: ${modelId}`)
      const model = google(modelId) as LanguageModel
      
      // Perform a minimal synchronous verification call to ensure quota exists and model is supported
      await generateText({
        model,
        prompt: '.',
        maxTokens: 1,
      })

      console.log(`[chat] Model ${modelId} is available, starting streamText...`)
      const result = streamText({ model, system: systemPrompt, messages: optimizedMessages, tools, maxSteps: 5 })
      return result.toUIMessageStreamResponse()
    } catch (err) {
      lastError = err
      console.warn(`[chat] Error on model ${modelId}:`, err)
      continue // Try the next model in the fallback list regardless of the error type
    }
  }

  // All models exhausted
  const msg = lastError instanceof Error ? lastError.message : 'AI unavailable'
  const isQuota = isQuotaOrRateError(lastError)
  console.error('[chat] All models failed. Last error:', lastError)

  return new Response(
    JSON.stringify({
      error: isQuota
        ? '⚠️ All Gemini models are quota-limited right now. Please wait 1 minute and try again.'
        : `AI error: ${msg}`,
    }),
    { status: isQuota ? 429 : 500, headers: { 'Content-Type': 'application/json' } }
  )
}
