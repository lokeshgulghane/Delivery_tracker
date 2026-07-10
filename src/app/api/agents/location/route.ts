import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { detectZone } from '@/lib/zone-detector'
import { Role } from '@prisma/client'

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.AGENT) return NextResponse.json({ error: 'Agent only' }, { status: 403 })

  const { lat, lng } = locationSchema.parse(await request.json())
  const zone = await detectZone(lat, lng)

  await prisma.agentProfile.updateMany({
    where: { userId: session.user.id },
    data: { currentLat: lat, currentLng: lng, currentZoneId: zone?.id || null },
  })

  return NextResponse.json({ success: true, zone })
}
