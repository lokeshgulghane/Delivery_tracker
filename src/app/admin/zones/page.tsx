import { prisma } from '@/lib/prisma'
import ZoneManager from './ZoneManager'

export const metadata = { title: 'Zone Management — Admin' }

export default async function ZonesPage() {
  const zones = await prisma.zone.findMany({
    include: { areas: true, _count: { select: { pickupOrders: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Zone Management</h1>
        <p className="text-gold-muted mt-1">Draw and manage delivery zones. Zones are used for rate card matching and agent assignment.</p>
      </div>
      <ZoneManager initialZones={zones as any} />
    </div>
  )
}
