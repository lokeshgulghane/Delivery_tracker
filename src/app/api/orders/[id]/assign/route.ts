import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { autoAssignAgent, releaseAgent } from '@/lib/auto-assign'
import { notifyOrderStatusChange } from '@/lib/notifications'
import { OrderStatus, Role } from '@prisma/client'

const assignSchema = z.object({
  agentId: z.string().optional(), // omit for auto-assign
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { agentId } = assignSchema.parse(body)

  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === OrderStatus.DELIVERED) {
    return NextResponse.json({ error: 'Cannot reassign a delivered order' }, { status: 400 })
  }

  // Release previous agent if any
  if (order.agentId) await releaseAgent(order.agentId)

  if (agentId) {
    // Manual assignment
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { agentId, status: OrderStatus.ASSIGNED },
      })
      await tx.agentProfile.updateMany({
        where: { userId: agentId },
        data: { isAvailable: false },
      })
      await tx.trackingEvent.create({
        data: {
          orderId: id,
          status: OrderStatus.ASSIGNED,
          notes: 'Manually assigned by admin',
          actorId: session.user.id,
          actorRole: Role.ADMIN,
        },
      })
    })
    await notifyOrderStatusChange(id, OrderStatus.ASSIGNED)
    return NextResponse.json({ success: true, method: 'manual', agentId })
  } else {
    // Auto-assignment
    const result = await autoAssignAgent(id, order.pickupLat, order.pickupLng, order.pickupZoneId)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
    await notifyOrderStatusChange(id, OrderStatus.ASSIGNED)
    const { success: _ok, ...rest } = result
    return NextResponse.json({ success: true, method: 'auto', ...rest })
  }
}
