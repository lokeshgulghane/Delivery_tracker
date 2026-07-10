import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

const zoneUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  geoJsonBoundary: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()))),
  }).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const zone = await prisma.zone.findUnique({ where: { id }, include: { areas: true } })
  if (!zone) return NextResponse.json({ error: 'Zone not found' }, { status: 404 })
  return NextResponse.json(zone)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  const data = zoneUpdateSchema.parse(await request.json())
  const zone = await prisma.zone.update({ where: { id }, data })
  return NextResponse.json(zone)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const { id } = await params
  await prisma.zone.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
