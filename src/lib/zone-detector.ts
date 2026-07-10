import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, polygon as turfPolygon, Feature, Polygon } from '@turf/helpers'
import { prisma } from './prisma'

export interface DetectedZone {
  id: string
  name: string
}

/**
 * Detects which zone a lat/lng coordinate falls into
 * Uses Turf.js point-in-polygon against all zones stored in DB as GeoJSON
 */
export async function detectZone(lat: number, lng: number): Promise<DetectedZone | null> {
  const zones = await prisma.zone.findMany({
    select: { id: true, name: true, geoJsonBoundary: true },
  })

  for (const zone of zones) {
    try {
      const boundary = zone.geoJsonBoundary as { type: string; coordinates: number[][][] }
      if (boundary.type !== 'Polygon') continue

      const pt = point([lng, lat]) // Turf uses [lng, lat]
      const poly: Feature<Polygon> = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: boundary.coordinates },
        properties: {},
      }

      if (booleanPointInPolygon(pt, poly)) {
        return { id: zone.id, name: zone.name }
      }
    } catch (e) {
      console.error(`Zone detection error for zone ${zone.name}:`, e)
    }
  }

  return null // address is outside all defined zones
}
