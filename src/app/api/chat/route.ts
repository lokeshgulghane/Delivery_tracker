import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, tool, convertToModelMessages } from 'ai'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateOrderShortId } from '@/lib/utils'

export const maxDuration = 60

// ── Models to try in order ────────────────────────────────────────────────────
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']

function isQuotaError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err)
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate limit') ||
    msg.includes('Too Many Requests')
  )
}

/**
 * Return a plain-text error stream that the client will display as an AI message.
 * This way the user always sees feedback — even on failures.
 */
function errorTextStream(message: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // AI SDK v7 UI message stream format: each chunk is a JSON line
      // We emit a single text-delta chunk then close
      const textChunk = JSON.stringify({ type: 'text-delta', textDelta: message }) + '\n'
      controller.enqueue(encoder.encode(textChunk))
      // finish chunk
      const finishChunk = JSON.stringify({ type: 'finish', finishReason: 'error', usage: { promptTokens: 0, completionTokens: 0 } }) + '\n'
      controller.enqueue(encoder.encode(finishChunk))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  })
}

// ── Keep last N messages, never split a tool-call/result pair ─────────────────
function trimHistory(msgs: any[], max = 12): any[] {
  if (msgs.length <= max) return msgs
  let i = msgs.length - max
  // Advance past any dangling tool-result messages at the cut point
  while (
    i < msgs.length &&
    (msgs[i].role === 'tool' ||
      (Array.isArray(msgs[i]?.content) && msgs[i].content[0]?.type === 'tool-result'))
  ) {
    i++
  }
  return msgs.slice(i)
}

export async function POST(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ── API key guard — surfaces as a visible bot message, not a silent failure ─
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    console.error('[chat] GOOGLE_GENERATIVE_AI_API_KEY is not set in environment')
    return errorTextStream(
      '⚠️ The AI assistant is not configured on this server. ' +
        'Please ask the administrator to add GOOGLE_GENERATIVE_AI_API_KEY to the environment variables.'
    )
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let messages: any[]
  try {
    const body = await request.json()
    messages = body.messages ?? []
  } catch {
    return errorTextStream('⚠️ Invalid request. Please try again.')
  }

  // Convert UI messages → model messages (AI SDK v7)
  let modelMessages: any[]
  try {
    modelMessages = await convertToModelMessages(messages)
  } catch (e) {
    console.error('[chat] convertToModelMessages failed:', e)
    return errorTextStream('⚠️ Could not process your message. Please clear the chat and try again.')
  }

  const history = trimHistory(modelMessages)

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `You are DeliveryBot, AI support for DeliveryTracker (India last-mile delivery).
Helping: ${session.user.name || 'user'} (role: ${session.user.role}).

WHAT YOU CAN DO:
- Track orders: status, timeline, agent details
- Explain charges: volumetric weight, COD surcharge
- List recent orders
- Answer FAQs about delivery, rescheduling, failed deliveries

STRICT RULES — FOLLOW EVERY TIME:
1. You MUST always end your response with visible text. Never finish after a tool call with no text.
2. When user mentions an order: call getOrderStatus tool, THEN write a summary of the result.
3. After EVERY tool call, write at least 2 sentences summarising what you found.
4. If a tool returns an error, explain it in plain language.
5. Use ₹ for rupees. Use Indian date format (DD/MM/YYYY).
6. Be concise (under 120 words per reply). Use bullet points for timelines.
7. If you don't know or can't help: say "Please email support@deliverytracker.app".

REMEMBER: An empty reply is a failure. Always write text.`

  // ── Tools ─────────────────────────────────────────────────────────────────
  const tools = {
    getOrderStatus: tool({
      description:
        'Get the current delivery status and full tracking timeline for an order. ALWAYS call this when the user asks about any order or tracking.',
      inputSchema: z.object({
        orderId: z.string().describe('Order ID — full UUID or last 8 characters'),
      }),
      execute: async ({ orderId }) => {
        try {
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

          if (!order) {
            return {
              found: false,
              error: `No order found with ID "${orderId}". Please double-check the order ID shown in your dashboard.`,
            }
          }

          return {
            found: true,
            shortId: generateOrderShortId(order.id),
            status: order.status,
            pickupAddress: order.pickupAddress,
            dropAddress: order.dropAddress,
            totalCharge: order.totalCharge,
            paymentType: order.paymentType,
            agentName: order.agent?.name ?? 'Not yet assigned',
            agentPhone: order.agent?.phone ?? 'N/A',
            pickupZone: order.pickupZone?.name ?? 'N/A',
            dropZone: order.dropZone?.name ?? 'N/A',
            scheduledDate: order.scheduledDate
              ? new Date(order.scheduledDate).toLocaleDateString('en-IN')
              : null,
            canReschedule: order.status === 'FAILED',
            trackingTimeline: order.trackingEvents.map((e) => ({
              status: e.status,
              notes: e.notes ?? '',
              time: new Date(e.timestamp).toLocaleString('en-IN'),
            })),
          }
        } catch (e) {
          console.error('[getOrderStatus]', e)
          return { found: false, error: 'Database error while fetching order. Please try again.' }
        }
      },
    }),

    getChargeBreakdown: tool({
      description: 'Get detailed pricing breakdown: volumetric weight, billed weight, base charge, COD surcharge.',
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        try {
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
          if (!order) return { found: false, error: 'Order not found.' }
          return {
            found: true,
            actualWeight: `${order.actualWeight} kg`,
            volumetricWeight: `${order.volumetricWeight} kg`,
            billedWeight: `${order.billedWeight} kg`,
            formula: `(${order.packageLength}×${order.packageBreadth}×${order.packageHeight}) ÷ 5000 = ${order.volumetricWeight} kg`,
            billingBasis:
              order.billedWeight === order.actualWeight
                ? 'Actual weight (heavier than volumetric)'
                : 'Volumetric weight (heavier than actual)',
            baseCharge: `₹${order.baseCharge}`,
            codSurcharge: `₹${order.codSurcharge ?? 0}`,
            totalCharge: `₹${order.totalCharge}`,
            orderType: order.orderType,
            paymentType: order.paymentType,
          }
        } catch (e) {
          return { found: false, error: 'Error fetching charge details.' }
        }
      },
    }),

    getMyOrders: tool({
      description: "List the customer's recent orders with status and delivery address.",
      inputSchema: z.object({
        limit: z.number().optional().default(5).describe('Max number of orders to return'),
      }),
      execute: async ({ limit }) => {
        try {
          if (session.user.role !== 'CUSTOMER') {
            return { found: false, error: 'This tool is for customers only.' }
          }
          const orders = await prisma.order.findMany({
            where: { customerId: session.user.id },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              status: true,
              totalCharge: true,
              createdAt: true,
              dropAddress: true,
            },
          })
          if (orders.length === 0) {
            return { found: true, orders: [], message: "You don't have any orders yet." }
          }
          return {
            found: true,
            orders: orders.map((o) => ({
              shortId: generateOrderShortId(o.id),
              id: o.id,
              status: o.status,
              charge: `₹${o.totalCharge}`,
              deliveryTo: o.dropAddress,
              date: new Date(o.createdAt).toLocaleDateString('en-IN'),
            })),
          }
        } catch (e) {
          return { found: false, error: 'Error fetching your orders.' }
        }
      },
    }),
  }

  // ── Try each model, errors surface as visible bot messages ────────────────
  const google = createGoogleGenerativeAI({ apiKey })

  for (const modelId of MODELS) {
    try {
      console.log(`[chat] Using model: ${modelId}`)

      const result = streamText({
        model: google(modelId),
        system: systemPrompt,
        messages: history,
        tools,
        maxSteps: 5,
        temperature: 0.2,
        onError: ({ error }) => {
          console.error(`[chat] Stream error on ${modelId}:`, error)
        },
      })

      // toUIMessageStreamResponse() is the correct v7 method — returns a streaming Response
      return result.toUIMessageStreamResponse({
        onError: (error) => {
          // This message is sent as a stream error chunk to the client
          if (isQuotaError(error)) {
            return '⚠️ AI quota limit reached. Please wait 1 minute and try again.'
          }
          return `⚠️ AI error: ${error instanceof Error ? error.message : 'Unknown error'}`
        },
      })
    } catch (err) {
      console.warn(`[chat] Failed to start stream on ${modelId}:`, (err as Error)?.message)
      // Continue to next model
    }
  }

  // All models failed at startup (e.g. bad API key, network)
  return errorTextStream(
    '⚠️ All AI models are unavailable. ' +
      (isQuotaError(null)
        ? 'Quota exceeded — please wait 1 minute.'
        : 'Please check server configuration and try again.')
  )
}
