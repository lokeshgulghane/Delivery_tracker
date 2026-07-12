import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, tool, convertToModelMessages } from 'ai'
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

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']

function isQuotaError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err)
  return msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit')
}

/** Inject an error as a visible bot message instead of a silent failure */
function errorTextStream(message: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'text-delta', textDelta: message }) + '\n'))
      controller.enqueue(encoder.encode(JSON.stringify({ type: 'finish', finishReason: 'error', usage: { promptTokens: 0, completionTokens: 0 } }) + '\n'))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Vercel-AI-Data-Stream': 'v1' } })
}

function trimHistory(msgs: any[], max = 14): any[] {
  if (msgs.length <= max) return msgs
  let i = msgs.length - max
  while (i < msgs.length && (msgs[i].role === 'tool' || (Array.isArray(msgs[i]?.content) && msgs[i].content[0]?.type === 'tool-result'))) i++
  return msgs.slice(i)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return errorTextStream('⚠️ AI is not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in environment variables.')
  }

  let messages: any[]
  try {
    const body = await request.json()
    messages = body.messages ?? []
  } catch {
    return errorTextStream('⚠️ Invalid request. Please try again.')
  }

  let modelMessages: any[]
  try {
    modelMessages = await convertToModelMessages(messages)
  } catch {
    return errorTextStream('⚠️ Could not process your message. Please clear the chat and try again.')
  }

  const history = trimHistory(modelMessages)
  const isCustomer = session.user.role === 'CUSTOMER'
  const isAdmin = session.user.role === 'ADMIN'

  // ── System Prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are DeliveryBot, the AI assistant for DeliveryTracker (India last-mile delivery platform).
You are talking with: ${session.user.name || 'User'} (Role: ${session.user.role}, ID: ${session.user.id})

YOUR CAPABILITIES — YOU CAN DO ALL OF THESE:
1. Place a new delivery order (collect addresses, package details, payment type)
2. List orders (customer sees their own, admin sees all)
3. Track any order by ID — show status + full timeline
4. Show charge breakdown for an order
5. Reschedule a failed delivery to a new date
6. Get a charge preview before placing an order
7. Answer FAQs about delivery

CONVERSATION STYLE:
- Be friendly, concise, and proactive
- If the user wants to place an order, guide them step by step — collect: pickup address, drop address, package size (L×B×H in cm), weight (kg), payment type (PREPAID or COD)
- If they give all info at once, use it directly — don't ask again
- After every tool call, ALWAYS write a clear text summary of the result
- Use ₹ for money. Use Indian date format DD/MM/YYYY.
- If something fails, explain clearly and suggest what to do next

STRICT RULES:
1. NEVER send an empty response — always write text after a tool call
2. If a tool returns an error, explain it in plain language
3. For order placement, validate that the user provided all required fields before calling placOrder
4. After placing an order, confirm the order ID, charge, and estimated timeline

IMPORTANT: You have FULL capability to take action — not just answer questions. Place orders, list them, reschedule them.`

  // ── Tools ──────────────────────────────────────────────────────────────────
  const tools = {
    // ── Track order ───────────────────────────────────────────────────────
    trackOrder: tool({
      description: 'Get current status and full tracking timeline of a delivery order.',
      inputSchema: z.object({
        orderId: z.string().describe('Full order ID or last 8 characters shown in the app'),
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
              dropZone: { select: { name: true } },
            },
          })
          if (!order) return { found: false, error: `No order found with ID "${orderId}". Please check the ID.` }
          return {
            found: true,
            shortId: generateOrderShortId(order.id),
            fullId: order.id,
            status: order.status,
            pickupAddress: order.pickupAddress,
            dropAddress: order.dropAddress,
            totalCharge: `₹${order.totalCharge}`,
            paymentType: order.paymentType,
            agentName: order.agent?.name ?? 'Not yet assigned',
            agentPhone: order.agent?.phone ?? 'N/A',
            pickupZone: order.pickupZone?.name ?? 'N/A',
            dropZone: order.dropZone?.name ?? 'N/A',
            scheduledDate: order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString('en-IN') : null,
            canReschedule: order.status === 'FAILED',
            trackingTimeline: order.trackingEvents.map((e) => ({
              status: e.status,
              notes: e.notes ?? '',
              time: new Date(e.timestamp).toLocaleString('en-IN'),
            })),
          }
        } catch (e) {
          console.error('[trackOrder]', e)
          return { found: false, error: 'Database error while fetching order.' }
        }
      },
    }),

    // ── List orders ───────────────────────────────────────────────────────
    listOrders: tool({
      description: 'List recent orders. Customers see their own orders; admins see all orders.',
      inputSchema: z.object({
        limit: z.number().optional().default(5),
        status: z.enum(['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RESCHEDULED']).optional(),
      }),
      execute: async ({ limit, status }) => {
        try {
          const where: any = {}
          if (isCustomer) where.customerId = session.user.id
          if (status) where.status = status

          const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true, status: true, totalCharge: true, createdAt: true,
              dropAddress: true, pickupAddress: true, paymentType: true,
            },
          })
          if (orders.length === 0) return { found: true, orders: [], message: 'No orders found.' }
          return {
            found: true,
            count: orders.length,
            orders: orders.map((o) => ({
              shortId: generateOrderShortId(o.id),
              fullId: o.id,
              status: o.status,
              charge: `₹${o.totalCharge}`,
              paymentType: o.paymentType,
              from: o.pickupAddress,
              to: o.dropAddress,
              date: new Date(o.createdAt).toLocaleDateString('en-IN'),
            })),
          }
        } catch (e) {
          return { found: false, error: 'Error fetching orders.' }
        }
      },
    }),

    // ── Charge preview ────────────────────────────────────────────────────
    previewCharge: tool({
      description: 'Preview the delivery charge before placing an order. Use this when the user asks for a price estimate.',
      inputSchema: z.object({
        pickupAddress: z.string(),
        dropAddress: z.string(),
        packageLength: z.number().describe('Length in cm'),
        packageBreadth: z.number().describe('Breadth in cm'),
        packageHeight: z.number().describe('Height in cm'),
        actualWeight: z.number().describe('Weight in kg'),
        orderType: z.enum(['B2B', 'B2C']).default('B2C'),
        paymentType: z.enum(['PREPAID', 'COD']).default('PREPAID'),
      }),
      execute: async ({ pickupAddress, dropAddress, packageLength, packageBreadth, packageHeight, actualWeight, orderType, paymentType }) => {
        try {
          const [pickupGeo, dropGeo] = await Promise.all([geocodeAddress(pickupAddress), geocodeAddress(dropAddress)])
          if (!pickupGeo) return { success: false, error: `Could not locate pickup address: "${pickupAddress}"` }
          if (!dropGeo) return { success: false, error: `Could not locate drop address: "${dropAddress}"` }

          const [pickupZone, dropZone] = await Promise.all([detectZone(pickupGeo.lat, pickupGeo.lng), detectZone(dropGeo.lat, dropGeo.lng)])
          if (!pickupZone || !dropZone) return { success: false, error: 'One or both addresses are outside our serviceable zones.' }

          const charge = await calculateCharge({ pickupZoneId: pickupZone.id, dropZoneId: dropZone.id, packageLength, packageBreadth, packageHeight, actualWeight, orderType: orderType as OrderType, paymentType: paymentType as PaymentType })
          if (charge.error) return { success: false, error: charge.error }

          return {
            success: true,
            pickupZone: pickupZone.name,
            dropZone: dropZone.name,
            volumetricWeight: `${charge.volumetricWeight} kg`,
            billedWeight: `${charge.billedWeight} kg`,
            billingBasis: charge.billedWeight === charge.volumetricWeight ? 'Volumetric (heavier)' : 'Actual weight',
            rateCard: charge.rateCardName,
            baseCharge: `₹${charge.baseCharge}`,
            codSurcharge: `₹${charge.codSurcharge}`,
            totalCharge: `₹${charge.totalCharge}`,
          }
        } catch (e) {
          console.error('[previewCharge]', e)
          return { success: false, error: 'Failed to calculate charge. Please try again.' }
        }
      },
    }),

    // ── Place order ───────────────────────────────────────────────────────
    placeOrder: tool({
      description: 'Place a new delivery order. Collect ALL required info before calling: pickup address, drop address, package dimensions (L, B, H in cm), weight (kg), and payment type (PREPAID or COD). Default orderType is B2C.',
      inputSchema: z.object({
        pickupAddress: z.string().min(5).describe('Full pickup address with city'),
        dropAddress: z.string().min(5).describe('Full delivery address with city'),
        packageLength: z.number().positive().describe('Package length in cm'),
        packageBreadth: z.number().positive().describe('Package breadth/width in cm'),
        packageHeight: z.number().positive().describe('Package height in cm'),
        actualWeight: z.number().positive().describe('Package actual weight in kg'),
        orderType: z.enum(['B2B', 'B2C']).default('B2C'),
        paymentType: z.enum(['PREPAID', 'COD']).describe('PREPAID = online payment, COD = cash on delivery'),
        notes: z.string().optional().describe('Any special instructions'),
      }),
      execute: async ({ pickupAddress, dropAddress, packageLength, packageBreadth, packageHeight, actualWeight, orderType, paymentType, notes }) => {
        try {
          // Geocode addresses
          const [pickupGeo, dropGeo] = await Promise.all([geocodeAddress(pickupAddress), geocodeAddress(dropAddress)])
          if (!pickupGeo) return { success: false, error: `Could not locate pickup address: "${pickupAddress}". Please provide a more specific address.` }
          if (!dropGeo) return { success: false, error: `Could not locate drop address: "${dropAddress}". Please provide a more specific address.` }

          // Detect zones
          const [pickupZone, dropZone] = await Promise.all([detectZone(pickupGeo.lat, pickupGeo.lng), detectZone(dropGeo.lat, dropGeo.lng)])
          if (!pickupZone) return { success: false, error: 'Pickup address is outside our serviceable delivery zones.' }
          if (!dropZone) return { success: false, error: 'Drop address is outside our serviceable delivery zones.' }

          // Calculate charge
          const charge = await calculateCharge({ pickupZoneId: pickupZone.id, dropZoneId: dropZone.id, packageLength, packageBreadth, packageHeight, actualWeight, orderType: orderType as OrderType, paymentType: paymentType as PaymentType })
          if (charge.error) return { success: false, error: charge.error }

          // Create order in DB
          const order = await prisma.$transaction(async (tx) => {
            const newOrder = await tx.order.create({
              data: {
                customerId: session.user.id,
                pickupAddress,
                pickupLat: pickupGeo.lat,
                pickupLng: pickupGeo.lng,
                pickupZoneId: pickupZone.id,
                dropAddress,
                dropLat: dropGeo.lat,
                dropLng: dropGeo.lng,
                dropZoneId: dropZone.id,
                packageLength, packageBreadth, packageHeight, actualWeight,
                volumetricWeight: charge.volumetricWeight,
                billedWeight: charge.billedWeight,
                orderType: orderType as OrderType,
                paymentType: paymentType as PaymentType,
                rateCardId: charge.rateCardId,
                baseCharge: charge.baseCharge,
                codSurcharge: charge.codSurcharge,
                totalCharge: charge.totalCharge,
                status: OrderStatus.PENDING,
                notes: notes || null,
              },
            })
            await tx.trackingEvent.create({
              data: {
                orderId: newOrder.id,
                status: OrderStatus.PENDING,
                notes: 'Order placed via DeliveryBot',
                actorId: session.user.id,
                actorRole: session.user.role as Role,
              },
            })
            return newOrder
          })

          // Send confirmation email
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
            message: 'Order placed successfully! A confirmation email has been sent. An agent will be assigned shortly.',
          }
        } catch (e) {
          console.error('[placeOrder]', e)
          return { success: false, error: 'Failed to create order. Please try again or use the order form.' }
        }
      },
    }),

    // ── Charge breakdown for existing order ───────────────────────────────
    getChargeBreakdown: tool({
      description: 'Get detailed charge breakdown for an existing order.',
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
            formula: `Volumetric = (${order.packageLength}×${order.packageBreadth}×${order.packageHeight}) ÷ 5000 = ${order.volumetricWeight} kg`,
            actualWeight: `${order.actualWeight} kg`,
            volumetricWeight: `${order.volumetricWeight} kg`,
            billedWeight: `${order.billedWeight} kg`,
            billingBasis: order.billedWeight === order.actualWeight ? 'Actual weight (higher)' : 'Volumetric weight (higher)',
            baseCharge: `₹${order.baseCharge}`,
            codSurcharge: `₹${order.codSurcharge ?? 0}`,
            totalCharge: `₹${order.totalCharge}`,
          }
        } catch (e) {
          return { found: false, error: 'Error fetching charge details.' }
        }
      },
    }),

    // ── Reschedule failed order ────────────────────────────────────────────
    rescheduleOrder: tool({
      description: 'Reschedule a failed delivery to a new date. Only works on FAILED orders.',
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
          if (order.status !== 'FAILED') return { success: false, error: `Order is currently ${order.status}. Only FAILED orders can be rescheduled.` }

          const scheduledDate = new Date(newDate)
          if (isNaN(scheduledDate.getTime())) return { success: false, error: 'Invalid date format. Please use YYYY-MM-DD.' }
          if (scheduledDate < new Date()) return { success: false, error: 'Scheduled date must be in the future.' }

          await prisma.$transaction(async (tx) => {
            await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.RESCHEDULED, scheduledDate } })
            await tx.trackingEvent.create({
              data: {
                orderId: order.id,
                status: OrderStatus.RESCHEDULED,
                notes: `Rescheduled via DeliveryBot to ${scheduledDate.toLocaleDateString('en-IN')}`,
                actorId: session.user.id,
                actorRole: session.user.role as Role,
              },
            })
          })

          notifyOrderStatusChange(order.id, OrderStatus.RESCHEDULED).catch(console.error)

          return {
            success: true,
            shortId: generateOrderShortId(order.id),
            newDate: scheduledDate.toLocaleDateString('en-IN'),
            message: 'Order rescheduled successfully. A confirmation email has been sent.',
          }
        } catch (e) {
          console.error('[rescheduleOrder]', e)
          return { success: false, error: 'Failed to reschedule order.' }
        }
      },
    }),
  }

  // ── Stream with fallback models ────────────────────────────────────────────
  const google = createGoogleGenerativeAI({ apiKey })

  for (const modelId of MODELS) {
    try {
      console.log(`[chat] Using ${modelId}`)
      const result = streamText({
        model: google(modelId),
        system: systemPrompt,
        messages: history,
        tools,
        maxSteps: 8,      // enough steps for multi-tool workflows (geocode → zone → charge → create)
        temperature: 0.2,
        onError: ({ error }) => console.error(`[chat] Stream error (${modelId}):`, error),
      })
      return result.toUIMessageStreamResponse({
        onError: (error) => {
          if (isQuotaError(error)) return '⚠️ AI quota reached. Please wait 1 minute and try again.'
          return `⚠️ AI error: ${error instanceof Error ? error.message : String(error)}`
        },
      })
    } catch (err) {
      console.warn(`[chat] Could not start stream on ${modelId}:`, (err as Error)?.message)
    }
  }

  return errorTextStream('⚠️ AI is currently unavailable. Please try again in a moment.')
}
