import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CodSurchargeManager from './CodSurchargeManager'

export const metadata = { title: 'COD Surcharges — Admin' }

export default async function CodSurchargesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/auth/login')
  }

  const surcharges = await prisma.codSurcharge.findMany()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">COD Surcharges</h1>
        <p className="text-gold-muted mt-1">Configure the flat-fee surcharge applied to Cash on Delivery orders, per order type.</p>
      </div>
      <CodSurchargeManager initialSurcharges={surcharges} />
    </div>
  )
}
