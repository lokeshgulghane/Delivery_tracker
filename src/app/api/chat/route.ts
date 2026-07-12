import { createGroq } from '@ai-sdk/groq'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, tool, convertToModelMessages, LanguageModel } from 'ai'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateOrderShortId } from '@/lib/utils'
import { geocodeAddress } from '@/lib/geocoder'
import { detectZone } from '@/lib/zone-detector'
import { calculateCharge } from '@/lib/rate-engine'
import { notifyOrderStatusChange } from '@/lib/notifications'
import { OrderStatus, OrderType, PaymentType, Role } from '@prisma/client'

export const maxDuration = 60

// ── Model roster ──────────────────────────────────────────────────────────────
// Groq: free tier — 14,400 req/day, ~500 tok/s, excellent tool-calling
// Gemini: fallback in case Groq is down
function buildModels(): LanguageModel[] {
  const models: LanguageModel[] = []

  if (process.env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
    // llama-3.3-70b-versatile: best quality + tool calling on Groq free tier
    models.push(groq('llama-3.3-70b-versatile'))
    // Smaller fast fallback
    models.push(groq('llama-3.1-8b-instant'))
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
    models.push(google('gemini-2.5-flash'))
    models.push(google('gemini-2.5-flash-lite'))
  }

  return models
}

/**
 * Safely extract a human-readable string from ANY error type.
 * Handles: Error | { message } | { error } | { statusText } | plain objects | strings.
 */
function extractErrorMessage(err: unknown): string {
  if (err == null) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.message === 'string') return e.message
    if (typeof e.error === 'string') return e.error
    if (typeof e.statusText === 'string') return e.statusText
    if (typeof e.cause === 'string') return e.cause
    // Last resort: JSON so we at least see something useful
    try { return JSON.stringify(e) } catch { /* ignore */ }
  }
  return String(err)
}

function isQuotaError(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('tokens per minute') ||
    msg.includes('requests per minute')
  )
}

/** Errors injected as a visible assistant message in the chat stream */
function errorStream(message: string): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(JSON.stringify({ type: 'text-delta', textDelta: message }) + '\n'))
      c.enqueue(enc.encode(JSON.stringify({ type: 'finish', finishReason: 'error', usage: { promptTokens: 0, completionTokens: 0 } }) + '\n'))
      c.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Vercel-AI-Data-Stream': 'v1' } })
}

function trimHistory(msgs: any[], max = 16): any[] {
  if (msgs.length <= max) return msgs
  let i = msgs.length - max
  while (i < msgs.length && (msgs[i].role === 'tool' || (Array.isArray(msgs[i]?.content) && msgs[i].content[0]?.type === 'tool-result'))) i++
  return msgs.slice(i)
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const models = buildModels()
  if (models.length === 0) {
    return errorStream('⚠️ No AI provider is configured. Please set GROQ_API_KEY in environment variables.')
  }

  let messages: any[]
  try {
    const body = await request.json()
    messages = body.messages ?? []
  } catch {
    return errorStream('⚠️ Invalid request. Please try again.')
  }

  let modelMessages: any[]
  try {
    modelMessages = await convertToModelMessages(messages)
  } catch {
    return errorStream('⚠️ Could not process your message. Please clear the chat and try again.')
  }

  const history = trimHistory(modelMessages)
  const isCustomer = session.user.role === 'CUSTOMER'

  // ── System Prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are DeliveryBot — the AI assistant for DeliveryTracker, India's last-mile delivery platform.
User: ${session.user.name || 'User'} | Role: ${session.user.role} | ID: ${session.user.id}

TOOLS AVAILABLE (you can take REAL actions):
• placeOrder       — create a delivery order in the database
• listOrders       — show the user's orders
• trackOrder       — fetch live status + timeline for an order
• previewCharge    — calculate cost before ordering
• getChargeBreakdown — explain an existing order's charge
• rescheduleOrder  — reschedule a FAILED delivery

ORDER PLACEMENT — collect these, ask only for missing ones:
  1. Pickup address (full, with city)
  2. Drop address (full, with city)
  3. Package L × B × H (cm)
  4. Weight (kg)
  5. Payment: PREPAID or COD
Call placeOrder the moment you have all 5. Don't re-confirm.

⚡ CRITICAL OUTPUT RULES — FOLLOW WITHOUT EXCEPTION:
Rule 1: After EVERY tool call you MUST write a text reply. NO EXCEPTIONS.
Rule 2: Never finish your turn with only a tool call and no text.
Rule 3: If you called a tool and got results, summarise them NOW in plain text.
Rule 4: If the user message is "__retry_summarise__", look at the last tool result in the conversation and summarise it clearly as if you are responding to the original question.
Rule 5: If all tools returned errors, explain each error and suggest next steps.
Rule 6: Never produce an empty or blank response.

FORMAT:
- Use ₹ for money, DD/MM/YYYY for dates
- Timeline → bullet points with timestamps
- After placing order → show: Order ID, total charge, next steps
- Keep replies under 150 words
- If you can't help → "Please email support@deliverytracker.app"`

  // ── Tools ──────────────────────────────────────────────────────────────────
  const tools = {

    placeOrder: tool({
      description: 'Place a new delivery order. Call this only when you have: pickup address, drop address, package dimensions (L,B,H cm), weight (kg), and payment type.',
      inputSchema: z.object({
        pickupAddress: z.string().min(10).describe('Full pickup address with city and state'),
        dropAddress:   z.string().min(10).describe('Full delivery address with city and state'),
        packageLength:  z.number().positive().describe('Length in cm'),
        packageBreadth: z.number().positive().describe('Breadth in cm'),
        packageHeight:  z.number().positive().describe('Height in cm'),
        actualWeight:   z.number().positive().describe('Actual weight in kg'),
        orderType:   z.enum(['B2B', 'B2C']).default('B2C').describe('B2C for individual customers, B2B for business'),
        paymentType: z.enum(['PREPAID', 'COD']).describe('PREPAID = paid online, COD = cash on delivery'),
        notes: z.string().optional().describe('Special delivery instructions'),
      }),
      execute: async ({ pickupAddress, dropAddress, packageLength, packageBreadth, packageHeight, actualWeight, orderType, paymentType, notes }) => {
        try {
          const [pickupGeo, dropGeo] = await Promise.all([geocodeAddress(pickupAddress), geocodeAddress(dropAddress)])
          if (!pickupGeo) return { success: false, error: `Cannot locate pickup address: "${pickupAddress}". Please provide a more specific address.` }
          if (!dropGeo)   return { success: false, error: `Cannot locate drop address: "${dropAddress}". Please provide a more specific address.` }

          const [pickupZone, dropZone] = await Promise.all([
            detectZone(pickupGeo.lat, pickupGeo.lng),
            detectZone(dropGeo.lat, dropGeo.lng),
          ])
          if (!pickupZone) return { success: false, error: 'Pickup address is outside our serviceable zones. Please contact support.' }
          if (!dropZone)   return { success: false, error: 'Drop address is outside our serviceable zones. Please contact support.' }

          const charge = await calculateCharge({
            pickupZoneId: pickupZone.id, dropZoneId: dropZone.id,
            packageLength, packageBreadth, packageHeight, actualWeight,
            orderType: orderType as OrderType, paymentType: paymentType as PaymentType,
          })
          if (charge.error) return { success: false, error: charge.error }

          const order = await prisma.$transaction(async (tx) => {
            const o = await tx.order.create({
              data: {
                customerId: session.user.id,
                pickupAddress, pickupLat: pickupGeo.lat, pickupLng: pickupGeo.lng, pickupZoneId: pickupZone.id,
                dropAddress,   dropLat:   dropGeo.lat,   dropLng:   dropGeo.lng,   dropZoneId:   dropZone.id,
                packageLength, packageBreadth, packageHeight, actualWeight,
                volumetricWeight: charge.volumetricWeight,
                billedWeight:     charge.billedWeight,
                orderType: orderType as OrderType, paymentType: paymentType as PaymentType,
                rateCardId: charge.rateCardId,
                baseCharge: charge.baseCharge, codSurcharge: charge.codSurcharge, totalCharge: charge.totalCharge,
                status: OrderStatus.PENDING,
                notes: notes ?? null,
              },
            })
            await tx.trackingEvent.create({
              data: { orderId: o.id, status: OrderStatus.PENDING, notes: 'Order placed via DeliveryBot', actorId: session.user.id, actorRole: session.user.role as Role },
            })
            return o
          })

          notifyOrderStatusChange(order.id, OrderStatus.PENDING).catch(console.error)

          return {
            success: true,
            shortId: generateOrderShortId(order.id),
            fullId: order.id,
            status: 'PENDING',
            pickupZone: pickupZone.name,
            dropZone: dropZone.name,
            totalCharge: `₹${charge.totalCharge}`,
            billedWeight: `${charge.billedWeight} kg`,
            paymentType,
            message: 'Order created successfully! Confirmation email sent. An agent will be assigned shortly.',
          }
        } catch (e) {
          console.error('[placeOrder]', e)
          return { success: false, error: 'Failed to create order. Please try again or use the order form.' }
        }
      },
    }),

    listOrders: tool({
      description: "List the user's delivery orders. Customers see their own; admins see all.",
      inputSchema: z.object({
        limit:  z.number().min(1).max(20).optional().default(5),
        status: z.enum(['PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED']).optional(),
      }),
      execute: async ({ limit, status }) => {
        try {
          const where: any = {}
          if (isCustomer) where.customerId = session.user.id
          if (status) where.status = status

          const orders = await prisma.order.findMany({
            where, orderBy: { createdAt: 'desc' }, take: limit,
            select: { id: true, status: true, totalCharge: true, createdAt: true, dropAddress: true, pickupAddress: true, paymentType: true },
          })
          if (orders.length === 0) return { found: true, orders: [], message: 'No orders found.' }
          return {
            found: true,
            count: orders.length,
            orders: orders.map((o) => ({
              shortId:     generateOrderShortId(o.id),
              fullId:      o.id,
              status:      o.status,
              charge:      `₹${o.totalCharge}`,
              paymentType: o.paymentType,
              from:        o.pickupAddress,
              to:          o.dropAddress,
              date:        new Date(o.createdAt).toLocaleDateString('en-IN'),
            })),
          }
        } catch (e) {
          return { found: false, error: 'Error fetching orders. Please try again.' }
        }
      },
    }),

    trackOrder: tool({
      description: 'Get live status + full tracking timeline for an order.',
      inputSchema: z.object({
        orderId: z.string().describe('Order ID — full UUID or last 8 characters'),
      }),
      execute: async ({ orderId }) => {
        try {
          const order = await prisma.order.findFirst({
            where: {
              OR: [{ id: orderId }, { id: { endsWith: orderId.toLowerCase() } }],
              ...(isCustomer ? { customerId: session.user.id } : {}),
            },
            include: {
              trackingEvents: { orderBy: { timestamp: 'asc' } },
              agent: { select: { name: true, phone: true } },
              pickupZone: { select: { name: true } },
              dropZone:   { select: { name: true } },
            },
          })
          if (!order) return { found: false, error: `No order found for ID "${orderId}". Please check the ID.` }
          return {
            found: true,
            shortId:      generateOrderShortId(order.id),
            fullId:       order.id,
            status:       order.status,
            pickupAddress: order.pickupAddress,
            dropAddress:   order.dropAddress,
            totalCharge:   `₹${order.totalCharge}`,
            paymentType:   order.paymentType,
            agentName:     order.agent?.name  ?? 'Not yet assigned',
            agentPhone:    order.agent?.phone ?? 'N/A',
            pickupZone:    order.pickupZone?.name ?? 'N/A',
            dropZone:      order.dropZone?.name   ?? 'N/A',
            scheduledDate: order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString('en-IN') : null,
            canReschedule: order.status === 'FAILED',
            timeline: order.trackingEvents.map((e) => ({
              status: e.status,
              notes:  e.notes ?? '',
              time:   new Date(e.timestamp).toLocaleString('en-IN'),
            })),
          }
        } catch (e) {
          return { found: false, error: 'Database error. Please try again.' }
        }
      },
    }),

    previewCharge: tool({
      description: 'Calculate the delivery charge for given addresses and package details before placing the order.',
      inputSchema: z.object({
        pickupAddress:  z.string(),
        dropAddress:    z.string(),
        packageLength:  z.number().positive(),
        packageBreadth: z.number().positive(),
        packageHeight:  z.number().positive(),
        actualWeight:   z.number().positive(),
        orderType:   z.enum(['B2B','B2C']).default('B2C'),
        paymentType: z.enum(['PREPAID','COD']).default('PREPAID'),
      }),
      execute: async ({ pickupAddress, dropAddress, packageLength, packageBreadth, packageHeight, actualWeight, orderType, paymentType }) => {
        try {
          const [pickupGeo, dropGeo] = await Promise.all([geocodeAddress(pickupAddress), geocodeAddress(dropAddress)])
          if (!pickupGeo) return { success: false, error: `Cannot find: "${pickupAddress}"` }
          if (!dropGeo)   return { success: false, error: `Cannot find: "${dropAddress}"` }

          const [pickupZone, dropZone] = await Promise.all([detectZone(pickupGeo.lat, pickupGeo.lng), detectZone(dropGeo.lat, dropGeo.lng)])
          if (!pickupZone || !dropZone) return { success: false, error: 'One or both addresses are outside serviceable zones.' }

          const charge = await calculateCharge({ pickupZoneId: pickupZone.id, dropZoneId: dropZone.id, packageLength, packageBreadth, packageHeight, actualWeight, orderType: orderType as OrderType, paymentType: paymentType as PaymentType })
          if (charge.error) return { success: false, error: charge.error }

          return {
            success: true,
            pickupZone: pickupZone.name,
            dropZone:   dropZone.name,
            volumetricWeight: `${charge.volumetricWeight} kg`,
            billedWeight:     `${charge.billedWeight} kg`,
            billingBasis:  charge.billedWeight === charge.volumetricWeight ? 'Volumetric weight (higher)' : 'Actual weight (higher)',
            rateCard:      charge.rateCardName,
            baseCharge:    `₹${charge.baseCharge}`,
            codSurcharge:  `₹${charge.codSurcharge}`,
            totalCharge:   `₹${charge.totalCharge}`,
          }
        } catch (e) {
          return { success: false, error: 'Failed to calculate. Please try again.' }
        }
      },
    }),

    getChargeBreakdown: tool({
      description: 'Explain the charge on an existing order in detail.',
      inputSchema: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => {
        try {
          const order = await prisma.order.findFirst({
            where: {
              OR: [{ id: orderId }, { id: { endsWith: orderId.toLowerCase() } }],
              ...(isCustomer ? { customerId: session.user.id } : {}),
            },
            select: { actualWeight: true, volumetricWeight: true, billedWeight: true, packageLength: true, packageBreadth: true, packageHeight: true, baseCharge: true, codSurcharge: true, totalCharge: true, orderType: true, paymentType: true },
          })
          if (!order) return { found: false, error: 'Order not found.' }
          return {
            found: true,
            formula:           `(${order.packageLength}×${order.packageBreadth}×${order.packageHeight}) ÷ 5000 = ${order.volumetricWeight} kg`,
            actualWeight:      `${order.actualWeight} kg`,
            volumetricWeight:  `${order.volumetricWeight} kg`,
            billedWeight:      `${order.billedWeight} kg`,
            billingBasis:      order.billedWeight === order.actualWeight ? 'Actual weight (higher than volumetric)' : 'Volumetric weight (higher than actual)',
            baseCharge:        `₹${order.baseCharge}`,
            codSurcharge:      `₹${order.codSurcharge ?? 0}`,
            totalCharge:       `₹${order.totalCharge}`,
          }
        } catch (e) {
          return { found: false, error: 'Error fetching breakdown.' }
        }
      },
    }),

    rescheduleOrder: tool({
      description: 'Reschedule a FAILED delivery to a new future date.',
      inputSchema: z.object({
        orderId: z.string(),
        newDate: z.string().describe('New delivery date in YYYY-MM-DD format'),
      }),
      execute: async ({ orderId, newDate }) => {
        try {
          const order = await prisma.order.findFirst({
            where: {
              OR: [{ id: orderId }, { id: { endsWith: orderId.toLowerCase() } }],
              ...(isCustomer ? { customerId: session.user.id } : {}),
            },
          })
          if (!order) return { success: false, error: 'Order not found.' }
          if (order.status !== 'FAILED') return { success: false, error: `Order status is "${order.status}". Only FAILED orders can be rescheduled.` }

          const scheduledDate = new Date(newDate)
          if (isNaN(scheduledDate.getTime())) return { success: false, error: 'Invalid date. Use YYYY-MM-DD format.' }
          if (scheduledDate <= new Date()) return { success: false, error: 'Please pick a future date.' }

          await prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.RESCHEDULED, scheduledDate } })
            await tx.trackingEvent.create({
              data: { orderId: order.id, status: OrderStatus.RESCHEDULED, notes: `Rescheduled via DeliveryBot to ${scheduledDate.toLocaleDateString('en-IN')}`, actorId: session.user.id, actorRole: session.user.role as Role },
            })
          })

          notifyOrderStatusChange(order.id, OrderStatus.RESCHEDULED).catch(console.error)

          return {
            success: true,
            shortId: generateOrderShortId(order.id),
            newDate: scheduledDate.toLocaleDateString('en-IN'),
            message: 'Rescheduled! Confirmation email sent to customer.',
          }
        } catch (e) {
          console.error('[rescheduleOrder]', e)
          return { success: false, error: 'Failed to reschedule. Please try again.' }
        }
      },
    }),
  }

  // ── Try each model until one works ────────────────────────────────────────
  let lastErr: unknown = null

  for (const model of models) {
    try {
      const modelName = (model as any).modelId ?? 'unknown'
      console.log(`[chat] Trying model: ${modelName}`)

      const result = streamText({
        model,
        system: systemPrompt,
        messages: history,
        tools,
        maxSteps: 10,      // multi-step: geocode → detect zone → calc charge → create order
        temperature: 0.15, // low temp = consistent, no hallucinations
        onError: ({ error }) => {
          console.error(`[chat] Stream error on ${modelName}:`, error)
        },
      })

      return result.toUIMessageStreamResponse({
        onError: (error) => {
          const msg = extractErrorMessage(error)
          console.error(`[chat] Stream error (${modelName}):`, msg)
          if (isQuotaError(error)) return '⚠️ Rate limit hit. Please wait 30 seconds and try again.'
          if (msg.includes('authentication') || msg.includes('API key') || msg.includes('invalid key'))
            return '⚠️ AI API key is invalid or expired. Please contact the administrator.'
          return `⚠️ AI error: ${msg}`
        },
      })
    } catch (err) {
      lastErr = err
      console.warn(`[chat] Model failed at startup:`, (err as Error)?.message?.slice(0, 120))
      // Continue to next model
    }
  }

  console.error('[chat] All models failed:', lastErr)
  return errorStream(
    isQuotaError(lastErr)
      ? '⚠️ All AI models are rate-limited. Please wait 1 minute and try again.'
      : '⚠️ AI assistant is temporarily unavailable. Please try again in a moment.'
  )
}
