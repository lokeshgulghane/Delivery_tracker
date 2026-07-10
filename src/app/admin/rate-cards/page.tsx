import { prisma } from '@/lib/prisma'
import RateCardManager from './RateCardManager'

export const metadata = { title: 'Rate Cards — Admin' }

export default async function RateCardsPage() {
  const [rateCards, zones, codSurcharges] = await Promise.all([
    prisma.rateCard.findMany({
      include: { fromZone: true, toZone: true, intraZone: true },
      orderBy: [{ orderType: 'asc' }, { isIntraZone: 'desc' }],
    }),
    prisma.zone.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.codSurcharge.findMany(),
  ])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Rate Cards & Pricing</h1>
        <p className="text-slate-400 mt-1">Configure B2B/B2C rates for intra and inter-zone deliveries. All values are per-kg with a minimum charge floor.</p>
      </div>
      <RateCardManager initialRateCards={rateCards} zones={zones} codSurcharges={codSurcharges} />
    </div>
  )
}
