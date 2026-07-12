import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notifyOrderStatusChange } from '@/lib/notifications'
import { releaseAgent } from '@/lib/auto-assign'
import { OrderStatus, Role } from '@prisma/client'

// Valid status transitions per agent role
const AGENT_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.ASSIGNED]: [OrderStatus.PICKED_UP],
  [OrderStatus.PICKED_UP]: [OrderStatus.IN_TRANSIT],
  [OrderStatus.IN_TRANSIT]: [OrderStatus.OUT_FOR_DELIVERY],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.FAILED],
}

const statusUpdateSchema = z.object({
  status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'PENDING', 'ASSIGNED', 'RESCHEDULED']),
  notes: z.string().optional(),
  codCollected: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status, notes, codCollected } = statusUpdateSchema.parse(body)

  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const newStatus = status as OrderStatus

  // Permission checks
  if (session.user.role === Role.AGENT) {
    if (order.agentId !== session.user.id) {
      return NextResponse.json({ error: 'Not your order' }, { status: 403 })
    }
    const allowed = AGENT_TRANSITIONS[order.status] || []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${order.status} → ${newStatus}` },
        { status: 400 }
      )
    }
  } else if (session.user.role === Role.CUSTOMER) {
    return NextResponse.json({ error: 'Customers cannot update status' }, { status: 403 })
  }
  // ADMIN can override any status

  const updateData: Record<string, unknown> = { status: newStatus }
  if (codCollected !== undefined) {
    updateData.codCollected = codCollected
    if (codCollected) updateData.codAmount = order.totalCharge
  }

  // Atomic transaction: update order + append immutable tracking event
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: updateData })
    await tx.trackingEvent.create({
      data: {
        orderId: id,
        status: newStatus,
        notes,
        actorId: session.user.id,
        actorRole: session.user.role as Role,
      },
    })
  })

  // Release agent back to available pool on terminal states
  if ((newStatus === OrderStatus.DELIVERED || newStatus === OrderStatus.FAILED) && order.agentId) {
    await releaseAgent(order.agentId)
  }

  // Send notification and await it to prevent Vercel container termination
  await notifyOrderStatusChange(id, newStatus, notes)

  return NextResponse.json({ success: true, status: newStatus })
}
