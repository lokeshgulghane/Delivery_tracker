import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrderType, Role } from '@prisma/client'

const rateCardSchema = z.object({
  name: z.string().min(2),
  orderType: z.enum(['B2B', 'B2C']),
  isIntraZone: z.boolean(),
  fromZoneId: z.string().nullable().optional(),
  toZoneId: z.string().nullable().optional(),
  intraZoneId: z.string().nullable().optional(),
  baseRate: z.number().positive(),
  minCharge: z.number().positive(),
})

export async function GET() {
  const rateCards = await prisma.rateCard.findMany({
    include: { fromZone: true, toZone: true, intraZone: true },
    orderBy: [{ orderType: 'asc' }, { isIntraZone: 'desc' }],
  })
  return NextResponse.json(rateCards)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const data = rateCardSchema.parse(await request.json())
  const rateCard = await prisma.rateCard.create({
    data: {
      name: data.name,
      orderType: data.orderType as OrderType,
      isIntraZone: data.isIntraZone,
      fromZoneId: data.fromZoneId || null,
      toZoneId: data.toZoneId || null,
      intraZoneId: data.intraZoneId || null,
      baseRate: data.baseRate,
      minCharge: data.minCharge,
    },
  })
  return NextResponse.json(rateCard, { status: 201 })
}
