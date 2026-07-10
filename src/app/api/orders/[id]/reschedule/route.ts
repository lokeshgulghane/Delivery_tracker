import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoAssignAgent, releaseAgent } from '@/lib/auto-assign'
import { notifyOrderStatusChange } from '@/lib/notifications'
import { OrderStatus, Role } from '@prisma/client'

const rescheduleSchema = z.object({
  scheduledDate: z.string(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { scheduledDate } = rescheduleSchema.parse(body)

  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  if (session.user.role === Role.CUSTOMER && order.customerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (order.status !== OrderStatus.FAILED) {
    return NextResponse.json({ error: 'Only FAILED orders can be rescheduled' }, { status: 400 })
  }

  const newDate = new Date(scheduledDate)

  // Release current agent
  if (order.agentId) await releaseAgent(order.agentId)

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: { status: OrderStatus.RESCHEDULED, scheduledDate: newDate, agentId: null },
    })
    await tx.trackingEvent.create({
      data: {
        orderId: id,
        status: OrderStatus.RESCHEDULED,
        notes: `Rescheduled for ${newDate.toLocaleDateString('en-IN')}`,
        actorId: session.user.id,
        actorRole: session.user.role as Role,
      },
    })
  })

  notifyOrderStatusChange(id, OrderStatus.RESCHEDULED).catch(console.error)

  // Trigger auto-assign for rescheduled attempt
  autoAssignAgent(id, order.pickupLat, order.pickupLng, order.pickupZoneId)
    .then((result) => {
      if (result.success) notifyOrderStatusChange(id, OrderStatus.ASSIGNED).catch(console.error)
    })
    .catch(console.error)

  return NextResponse.json({ success: true, scheduledDate: newDate })
}
