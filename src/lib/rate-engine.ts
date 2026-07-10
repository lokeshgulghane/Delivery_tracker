import { prisma } from './prisma'
import { OrderType, PaymentType } from '@prisma/client'

export interface ChargeInput {
  pickupZoneId: string
  dropZoneId: string
  packageLength: number   // cm
  packageBreadth: number  // cm
  packageHeight: number   // cm
  actualWeight: number    // kg
  orderType: OrderType
  paymentType: PaymentType
}

export interface ChargeBreakdown {
  volumetricWeight: number
  billedWeight: number
  isIntraZone: boolean
  rateCardId: string | null
  rateCardName: string
  baseRate: number
  baseCharge: number
  codSurcharge: number
  totalCharge: number
  error?: string
}

/**
 * Rate Calculation Engine
 * All values fetched from DB — zero hardcoding
 *
 * Algorithm:
 * 1. volumetricWeight = (L × B × H) / 5000
 * 2. billedWeight = max(actualWeight, volumetricWeight)
 * 3. Determine intra vs inter zone
 * 4. Find rate card: match orderType + zone corridor
 * 5. baseCharge = max(billedWeight × baseRate, minCharge)
 * 6. codSurcharge = COD surcharge from DB (if COD order)
 * 7. totalCharge = baseCharge + codSurcharge
 */
export async function calculateCharge(input: ChargeInput): Promise<ChargeBreakdown> {
  const {
    pickupZoneId,
    dropZoneId,
    packageLength,
    packageBreadth,
    packageHeight,
    actualWeight,
    orderType,
    paymentType,
  } = input

  // Step 1 & 2: Weight calculation
  const volumetricWeight = (packageLength * packageBreadth * packageHeight) / 5000
  const billedWeight = Math.max(actualWeight, volumetricWeight)

  // Step 3: Zone comparison
  const isIntraZone = pickupZoneId === dropZoneId

  // Step 4: Rate card lookup
  let rateCard = null

  if (isIntraZone) {
    rateCard = await prisma.rateCard.findFirst({
      where: {
        orderType,
        isIntraZone: true,
        intraZoneId: pickupZoneId,
        isActive: true,
      },
    })

    // Fallback: generic intra-zone rate card (no specific zone)
    if (!rateCard) {
      rateCard = await prisma.rateCard.findFirst({
        where: {
          orderType,
          isIntraZone: true,
          intraZoneId: null,
          isActive: true,
        },
      })
    }
  } else {
    // Inter-zone: try specific corridor first
    rateCard = await prisma.rateCard.findFirst({
      where: {
        orderType,
        isIntraZone: false,
        fromZoneId: pickupZoneId,
        toZoneId: dropZoneId,
        isActive: true,
      },
    })

    // Fallback: reverse corridor
    if (!rateCard) {
      rateCard = await prisma.rateCard.findFirst({
        where: {
          orderType,
          isIntraZone: false,
          fromZoneId: dropZoneId,
          toZoneId: pickupZoneId,
          isActive: true,
        },
      })
    }

    // Fallback: generic inter-zone rate card
    if (!rateCard) {
      rateCard = await prisma.rateCard.findFirst({
        where: {
          orderType,
          isIntraZone: false,
          fromZoneId: null,
          toZoneId: null,
          isActive: true,
        },
      })
    }
  }

  if (!rateCard) {
    return {
      volumetricWeight: Math.round(volumetricWeight * 100) / 100,
      billedWeight: Math.round(billedWeight * 100) / 100,
      isIntraZone,
      rateCardId: null,
      rateCardName: 'No rate card found',
      baseRate: 0,
      baseCharge: 0,
      codSurcharge: 0,
      totalCharge: 0,
      error: `No active rate card found for ${orderType} ${isIntraZone ? 'intra-zone' : 'inter-zone'} delivery. Please configure rate cards in admin panel.`,
    }
  }

  // Step 5: Base charge
  const rawCharge = billedWeight * rateCard.baseRate
  const baseCharge = Math.max(rawCharge, rateCard.minCharge)

  // Step 6: COD surcharge
  let codSurcharge = 0
  if (paymentType === PaymentType.COD) {
    const surchargeRecord = await prisma.codSurcharge.findUnique({
      where: { orderType },
    })
    codSurcharge = surchargeRecord?.surchargeAmount ?? 0
  }

  // Step 7: Total
  const totalCharge = Math.round((baseCharge + codSurcharge) * 100) / 100

  return {
    volumetricWeight: Math.round(volumetricWeight * 100) / 100,
    billedWeight: Math.round(billedWeight * 100) / 100,
    isIntraZone,
    rateCardId: rateCard.id,
    rateCardName: rateCard.name,
    baseRate: rateCard.baseRate,
    baseCharge: Math.round(baseCharge * 100) / 100,
    codSurcharge: Math.round(codSurcharge * 100) / 100,
    totalCharge,
  }
}
