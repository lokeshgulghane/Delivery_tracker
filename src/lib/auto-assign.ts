import { prisma } from './prisma'
import { haversineDistance } from './haversine'
import { OrderStatus, Role } from '@prisma/client'

export interface AssignmentResult {
  success: boolean
  agentId?: string
  agentName?: string
  distance?: number
  error?: string
}

/**
 * Auto-Assignment Logic:
 * 1. Find all available agents
 * 2. Prefer agents in the same zone as pickup
 * 3. Sort by Haversine distance to pickup location
 * 4. Assign the nearest agent
 * 5. Mark agent as unavailable
 * 6. Append tracking event
 */
export async function autoAssignAgent(
  orderId: string,
  pickupLat: number,
  pickupLng: number,
  pickupZoneId: string | null
): Promise<AssignmentResult> {
  try {
    // Get all available agents with their locations
    const availableAgents = await prisma.agentProfile.findMany({
      where: {
        isAvailable: true,
        currentLat: { not: null },
        currentLng: { not: null },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    })

    if (availableAgents.length === 0) {
      return { success: false, error: 'No available agents at this time.' }
    }

    // Calculate distance from each agent to pickup
    const agentsWithDistance = availableAgents
      .filter((a) => a.currentLat !== null && a.currentLng !== null)
      .map((agent) => ({
        agent,
        distance: haversineDistance(
          agent.currentLat!,
          agent.currentLng!,
          pickupLat,
          pickupLng
        ),
        sameZone: pickupZoneId !== null && agent.currentZoneId === pickupZoneId,
      }))

    // Sort: same-zone agents first, then by distance
    agentsWithDistance.sort((a, b) => {
      if (a.sameZone && !b.sameZone) return -1
      if (!a.sameZone && b.sameZone) return 1
      return a.distance - b.distance
    })

    const selected = agentsWithDistance[0]

    // Atomic transaction: assign order + mark agent unavailable + log event
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          agentId: selected.agent.userId,
          status: OrderStatus.ASSIGNED,
        },
      })

      await tx.agentProfile.update({
        where: { id: selected.agent.id },
        data: { isAvailable: false },
      })

      await tx.trackingEvent.create({
        data: {
          orderId,
          status: OrderStatus.ASSIGNED,
          notes: `Auto-assigned to ${selected.agent.user.name} (${Math.round(selected.distance * 10) / 10} km away)`,
          actorRole: Role.ADMIN,
        },
      })
    })

    return {
      success: true,
      agentId: selected.agent.userId,
      agentName: selected.agent.user.name,
      distance: Math.round(selected.distance * 10) / 10,
    }
  } catch (error) {
    console.error('Auto-assign error:', error)
    return { success: false, error: 'Assignment failed due to internal error.' }
  }
}

/**
 * Release agent back to available pool (after delivery or failed attempt)
 */
export async function releaseAgent(agentId: string): Promise<void> {
  await prisma.agentProfile.updateMany({
    where: { userId: agentId },
    data: { isAvailable: true },
  })
}
