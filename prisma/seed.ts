import { PrismaClient, OrderType, VehicleType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // ── Users ──────────────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash('Admin@123', 12)
  const customerPassword = await bcrypt.hash('Customer@123', 12)
  const agentPassword = await bcrypt.hash('Agent@123', 12)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@deliverytracker.app' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@deliverytracker.app',
      passwordHash: adminPassword,
      role: 'ADMIN',
      phone: '+91-9000000001',
    },
  })

  const customer1 = await prisma.user.upsert({
    where: { email: 'rahul@example.com' },
    update: {},
    create: {
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      passwordHash: customerPassword,
      role: 'CUSTOMER',
      phone: '+91-9876543210',
    },
  })

  const customer2 = await prisma.user.upsert({
    where: { email: 'priya@example.com' },
    update: {},
    create: {
      name: 'Priya Mehta',
      email: 'priya@example.com',
      passwordHash: customerPassword,
      role: 'CUSTOMER',
      phone: '+91-9876543211',
    },
  })

  const agent1 = await prisma.user.upsert({
    where: { email: 'agent1@deliverytracker.app' },
    update: {},
    create: {
      name: 'Vikram Singh',
      email: 'agent1@deliverytracker.app',
      passwordHash: agentPassword,
      role: 'AGENT',
      phone: '+91-9900000001',
    },
  })

  const agent2 = await prisma.user.upsert({
    where: { email: 'agent2@deliverytracker.app' },
    update: {},
    create: {
      name: 'Kiran Kumar',
      email: 'agent2@deliverytracker.app',
      passwordHash: agentPassword,
      role: 'AGENT',
      phone: '+91-9900000002',
    },
  })

  console.log('✅ Users created')

  // ── Zones (Mumbai & Pune regions) ─────────────────────────────────────────

  const zoneMumbaiNorth = await prisma.zone.upsert({
    where: { name: 'Mumbai North' },
    update: {},
    create: {
      name: 'Mumbai North',
      geoJsonBoundary: {
        type: 'Polygon',
        coordinates: [[
          [72.79, 19.05],
          [72.92, 19.05],
          [72.92, 19.25],
          [72.79, 19.25],
          [72.79, 19.05],
        ]],
      },
    },
  })

  const zoneMumbaiSouth = await prisma.zone.upsert({
    where: { name: 'Mumbai South' },
    update: {},
    create: {
      name: 'Mumbai South',
      geoJsonBoundary: {
        type: 'Polygon',
        coordinates: [[
          [72.79, 18.87],
          [72.92, 18.87],
          [72.92, 19.05],
          [72.79, 19.05],
          [72.79, 18.87],
        ]],
      },
    },
  })

  const zonePune = await prisma.zone.upsert({
    where: { name: 'Pune City' },
    update: {},
    create: {
      name: 'Pune City',
      geoJsonBoundary: {
        type: 'Polygon',
        coordinates: [[
          [73.73, 18.43],
          [73.95, 18.43],
          [73.95, 18.62],
          [73.73, 18.62],
          [73.73, 18.43],
        ]],
      },
    },
  })

  console.log('✅ Zones created')

  // ── Areas ─────────────────────────────────────────────────────────────────

  await prisma.area.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Andheri', pincode: '400053', zoneId: zoneMumbaiNorth.id },
      { name: 'Borivali', pincode: '400066', zoneId: zoneMumbaiNorth.id },
      { name: 'Malad', pincode: '400064', zoneId: zoneMumbaiNorth.id },
      { name: 'Goregaon', pincode: '400063', zoneId: zoneMumbaiNorth.id },
      { name: 'Dadar', pincode: '400014', zoneId: zoneMumbaiSouth.id },
      { name: 'Worli', pincode: '400018', zoneId: zoneMumbaiSouth.id },
      { name: 'Lower Parel', pincode: '400013', zoneId: zoneMumbaiSouth.id },
      { name: 'Bandra', pincode: '400050', zoneId: zoneMumbaiSouth.id },
      { name: 'Koregaon Park', pincode: '411001', zoneId: zonePune.id },
      { name: 'Hinjewadi', pincode: '411057', zoneId: zonePune.id },
      { name: 'Viman Nagar', pincode: '411014', zoneId: zonePune.id },
      { name: 'Kothrud', pincode: '411038', zoneId: zonePune.id },
    ],
  })

  console.log('✅ Areas created')

  // ── Rate Cards ─────────────────────────────────────────────────────────────

  await prisma.rateCard.createMany({
    skipDuplicates: true,
    data: [
      // B2C Intra-zone (same zone, any zone)
      {
        name: 'B2C Intra-Zone Standard',
        orderType: OrderType.B2C,
        isIntraZone: true,
        baseRate: 35,
        minCharge: 40,
      },
      // B2C Inter-zone (different zones)
      {
        name: 'B2C Inter-Zone Standard',
        orderType: OrderType.B2C,
        isIntraZone: false,
        fromZoneId: null,
        toZoneId: null,
        baseRate: 55,
        minCharge: 70,
      },
      // B2B Intra-zone
      {
        name: 'B2B Intra-Zone Standard',
        orderType: OrderType.B2B,
        isIntraZone: true,
        baseRate: 25,
        minCharge: 80,
      },
      // B2B Inter-zone
      {
        name: 'B2B Inter-Zone Standard',
        orderType: OrderType.B2B,
        isIntraZone: false,
        fromZoneId: null,
        toZoneId: null,
        baseRate: 40,
        minCharge: 120,
      },
      // Specific corridor: Mumbai North ↔ Pune
      {
        name: 'Mumbai North → Pune Express',
        orderType: OrderType.B2C,
        isIntraZone: false,
        fromZoneId: zoneMumbaiNorth.id,
        toZoneId: zonePune.id,
        baseRate: 65,
        minCharge: 90,
      },
    ],
  })

  console.log('✅ Rate cards created')

  // ── COD Surcharges ─────────────────────────────────────────────────────────

  await prisma.codSurcharge.upsert({
    where: { orderType: OrderType.B2C },
    update: {},
    create: { orderType: OrderType.B2C, surchargeAmount: 30 },
  })
  await prisma.codSurcharge.upsert({
    where: { orderType: OrderType.B2B },
    update: {},
    create: { orderType: OrderType.B2B, surchargeAmount: 50 },
  })

  console.log('✅ COD surcharges created')

  // ── Agent Profiles ─────────────────────────────────────────────────────────

  await prisma.agentProfile.upsert({
    where: { userId: agent1.id },
    update: {},
    create: {
      userId: agent1.id,
      currentLat: 19.1136, // Andheri East
      currentLng: 72.8697,
      currentZoneId: zoneMumbaiNorth.id,
      isAvailable: true,
      vehicleType: VehicleType.BIKE,
    },
  })

  await prisma.agentProfile.upsert({
    where: { userId: agent2.id },
    update: {},
    create: {
      userId: agent2.id,
      currentLat: 18.5204, // Pune
      currentLng: 73.8567,
      currentZoneId: zonePune.id,
      isAvailable: true,
      vehicleType: VehicleType.BIKE,
    },
  })

  console.log('✅ Agent profiles created')

  console.log('\n🎉 Seed complete!')
  console.log('\n📋 Login Credentials:')
  console.log('  Admin:    admin@deliverytracker.app / Admin@123')
  console.log('  Customer: rahul@example.com / Customer@123')
  console.log('  Agent:    agent1@deliverytracker.app / Agent@123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
