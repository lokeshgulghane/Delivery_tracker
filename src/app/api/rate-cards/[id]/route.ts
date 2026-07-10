import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

const updateSchema = z.object({
  name: z.string().optional(),
  baseRate: z.number().positive().optional(),
  minCharge: z.number().positive().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const data = updateSchema.parse(await request.json())
  const rateCard = await prisma.rateCard.update({ where: { id }, data })
  return NextResponse.json(rateCard)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  await prisma.rateCard.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
