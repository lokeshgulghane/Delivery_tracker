import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const [totalOrders, pendingOrders, deliveredOrders, failedOrders, totalRevenue, activeAgents, totalCustomers] =
    await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.count({ where: { status: 'FAILED' } }),
      prisma.order.aggregate({ _sum: { totalCharge: true }, where: { status: 'DELIVERED' } }),
      prisma.agentProfile.count({ where: { isAvailable: true } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
    ])

  const ordersByStatus = await prisma.order.groupBy({
    by: ['status'],
    _count: { status: true },
  })

  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      pickupZone: { select: { name: true } },
      dropZone: { select: { name: true } },
    },
  })

  return NextResponse.json({
    totalOrders,
    pendingOrders,
    deliveredOrders,
    failedOrders,
    totalRevenue: totalRevenue._sum.totalCharge || 0,
    activeAgents,
    totalCustomers,
    ordersByStatus,
    recentOrders,
  })
}
