import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== Role.ADMIN) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const available = searchParams.get('available')

  const agents = await prisma.agentProfile.findMany({
    where: available !== null ? { isAvailable: available === 'true' } : {},
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      currentZone: { select: { id: true, name: true } },
    },
    orderBy: { user: { name: 'asc' } },
  })
  return NextResponse.json(agents)
}
