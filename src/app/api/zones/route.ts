import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

const zoneSchema = z.object({
  name: z.string().min(2),
  geoJsonBoundary: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.array(z.number()))),
  }),
})

export async function GET() {
  const zones = await prisma.zone.findMany({
    include: { areas: true, _count: { select: { pickupOrders: true, agentsInZone: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(zones)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const data = zoneSchema.parse(body)
    const zone = await prisma.zone.create({ data })
    return NextResponse.json(zone, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    return NextResponse.json({ error: 'Failed to create zone' }, { status: 500 })
  }
}
