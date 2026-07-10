import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrderType, Role } from '@prisma/client'

const codSchema = z.object({
  orderType: z.enum(['B2B', 'B2C']),
  surchargeAmount: z.number().min(0),
})

export async function GET() {
  const surcharges = await prisma.codSurcharge.findMany()
  return NextResponse.json(surcharges)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const data = codSchema.parse(await request.json())
  const surcharge = await prisma.codSurcharge.upsert({
    where: { orderType: data.orderType as OrderType },
    update: { surchargeAmount: data.surchargeAmount },
    create: { orderType: data.orderType as OrderType, surchargeAmount: data.surchargeAmount },
  })
  return NextResponse.json(surcharge, { status: 201 })
}
