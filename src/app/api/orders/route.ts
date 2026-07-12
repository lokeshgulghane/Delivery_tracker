import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { geocodeAddress } from '@/lib/geocoder'
import { detectZone } from '@/lib/zone-detector'
import { calculateCharge } from '@/lib/rate-engine'
import { notifyOrderStatusChange } from '@/lib/notifications'
import { OrderType, PaymentType, Role, OrderStatus } from '@prisma/client'

const createOrderSchema = z.object({
  customerId: z.string().optional(), // admin creates for specific customer
  pickupAddress: z.string().min(5),
  dropAddress: z.string().min(5),
  packageLength: z.number().positive(),
  packageBreadth: z.number().positive(),
  packageHeight: z.number().positive(),
  actualWeight: z.number().positive(),
  orderType: z.enum(['B2B', 'B2C']),
  paymentType: z.enum(['PREPAID', 'COD']),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as OrderStatus | null
  const zoneId = searchParams.get('zoneId')
  const agentId = searchParams.get('agentId')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const where: Record<string, unknown> = {}

  // Role-based filtering
  if (session.user.role === Role.CUSTOMER) {
    where.customerId = session.user.id
  } else if (session.user.role === Role.AGENT) {
    where.agentId = session.user.id
  }

  if (status) where.status = status
  if (zoneId) where.pickupZoneId = zoneId
  if (agentId && session.user.role === Role.ADMIN) where.agentId = agentId

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true, phone: true } },
        pickupZone: { select: { id: true, name: true } },
        dropZone: { select: { id: true, name: true } },
        trackingEvents: { orderBy: { timestamp: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const data = createOrderSchema.parse(body)

    // Determine customer ID
    let customerId = session.user.id
    if (session.user.role === Role.ADMIN && data.customerId) {
      customerId = data.customerId
    }

    // Geocode both addresses
    const [pickupGeo, dropGeo] = await Promise.all([
      geocodeAddress(data.pickupAddress),
      geocodeAddress(data.dropAddress),
    ])

    if (!pickupGeo || !dropGeo) {
      return NextResponse.json({ error: 'Failed to geocode one or more addresses' }, { status: 400 })
    }

    // Detect zones
    const [pickupZone, dropZone] = await Promise.all([
      detectZone(pickupGeo.lat, pickupGeo.lng),
      detectZone(dropGeo.lat, dropGeo.lng),
    ])

    if (!pickupZone || !dropZone) {
      return NextResponse.json({ error: 'Address(es) outside serviceable zones' }, { status: 400 })
    }

    // Calculate charge
    const charge = await calculateCharge({
      pickupZoneId: pickupZone.id,
      dropZoneId: dropZone.id,
      packageLength: data.packageLength,
      packageBreadth: data.packageBreadth,
      packageHeight: data.packageHeight,
      actualWeight: data.actualWeight,
      orderType: data.orderType as OrderType,
      paymentType: data.paymentType as PaymentType,
    })

    if (charge.error) {
      return NextResponse.json({ error: charge.error }, { status: 400 })
    }

    // Create order + initial tracking event in transaction
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          customerId,
          createdByAdmin: session.user.role === Role.ADMIN ? session.user.id : null,
          pickupAddress: data.pickupAddress,
          pickupLat: pickupGeo.lat,
          pickupLng: pickupGeo.lng,
          pickupZoneId: pickupZone.id,
          dropAddress: data.dropAddress,
          dropLat: dropGeo.lat,
          dropLng: dropGeo.lng,
          dropZoneId: dropZone.id,
          packageLength: data.packageLength,
          packageBreadth: data.packageBreadth,
          packageHeight: data.packageHeight,
          actualWeight: data.actualWeight,
          volumetricWeight: charge.volumetricWeight,
          billedWeight: charge.billedWeight,
          orderType: data.orderType as OrderType,
          paymentType: data.paymentType as PaymentType,
          rateCardId: charge.rateCardId,
          baseCharge: charge.baseCharge,
          codSurcharge: charge.codSurcharge,
          totalCharge: charge.totalCharge,
          status: OrderStatus.PENDING,
          notes: data.notes,
        },
      })

      // Append immutable tracking event
      await tx.trackingEvent.create({
        data: {
          orderId: newOrder.id,
          status: OrderStatus.PENDING,
          notes: 'Order created',
          actorId: session.user.id,
          actorRole: session.user.role as Role,
        },
      })

      return newOrder
    })

    // Send notification and await it to prevent Vercel container termination
    await notifyOrderStatusChange(order.id, OrderStatus.PENDING)

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Create order error:', error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
