import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { geocodeAddress } from '@/lib/geocoder'
import { detectZone } from '@/lib/zone-detector'
import { calculateCharge } from '@/lib/rate-engine'
import { OrderType, PaymentType } from '@prisma/client'

const previewSchema = z.object({
  pickupAddress: z.string().min(5),
  dropAddress: z.string().min(5),
  packageLength: z.number().positive(),
  packageBreadth: z.number().positive(),
  packageHeight: z.number().positive(),
  actualWeight: z.number().positive(),
  orderType: z.enum(['B2B', 'B2C']),
  paymentType: z.enum(['PREPAID', 'COD']),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = previewSchema.parse(body)

    // Geocode addresses
    const [pickupGeo, dropGeo] = await Promise.all([
      geocodeAddress(data.pickupAddress),
      geocodeAddress(data.dropAddress),
    ])

    if (!pickupGeo) {
      return NextResponse.json({ error: 'Could not locate pickup address. Please be more specific.' }, { status: 400 })
    }
    if (!dropGeo) {
      return NextResponse.json({ error: 'Could not locate drop address. Please be more specific.' }, { status: 400 })
    }

    // Detect zones
    const [pickupZone, dropZone] = await Promise.all([
      detectZone(pickupGeo.lat, pickupGeo.lng),
      detectZone(dropGeo.lat, dropGeo.lng),
    ])

    if (!pickupZone) {
      return NextResponse.json({ error: 'Pickup address is outside our serviceable zones.' }, { status: 400 })
    }
    if (!dropZone) {
      return NextResponse.json({ error: 'Drop address is outside our serviceable zones.' }, { status: 400 })
    }

    // Calculate charge
    const charge = await calculateCharge({
      pickupZoneId: pickupZone.id,
      dropZoneId: dropZone.id,
      packageLength: data.packageLength,
      packageBreadth: data.packageBreadth,
      packageHeight: data.packageHeight,
      actualWeight: data.actualWeight,
      orderType: data.orderType as OrderType,
      paymentType: data.paymentType as PaymentType,
    })

    if (charge.error) {
      return NextResponse.json({ error: charge.error }, { status: 400 })
    }

    return NextResponse.json({
      pickupGeo,
      dropGeo,
      pickupZone,
      dropZone,
      charge,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    console.error('Charge preview error:', error)
    return NextResponse.json({ error: 'Failed to calculate charge' }, { status: 500 })
  }
}
