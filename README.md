# DeliveryTracker

A full-stack last-mile delivery management platform built for the Indian logistics market. Three roles, one codebase — admins configure and oversee, agents pick up and deliver, customers book and track.

---

## What this actually does

Most delivery software either gives you a clunky admin panel with no customer-facing side, or a pretty tracking page with no ops tooling. This tries to do both properly.

**Admins** get a dashboard to create orders, manage delivery zones (drawn as GeoJSON polygons), configure rate cards (intra-zone vs inter-zone, B2B vs B2C), set COD surcharges, and monitor all orders with status filters. They can also manually assign agents or let the system auto-assign based on proximity.

**Agents** log in on mobile, see their assigned orders, update statuses step by step (Picked Up → In Transit → Out for Delivery → Delivered), and their GPS location is tracked to power the auto-assignment logic.

**Customers** book deliveries through a form or by just chatting with the AI bot, track their parcels in real time, see an itemized charge breakdown, and get email notifications at every status change.

---

## Tech stack

| Layer | What's used |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Prisma 7 |
| Auth | NextAuth v5 (beta) with Prisma adapter |
| AI / Chat | Groq (`llama-3.3-70b-versatile`) + Gemini fallback via Vercel AI SDK v7 |
| Email | Nodemailer over SMTP (Gmail app passwords work fine) |
| Geocoding | OpenStreetMap Nominatim (no key, no cost) |
| Zone detection | Turf.js point-in-polygon against GeoJSON zone boundaries |
| Charge engine | Custom — volumetric weight formula, zone corridors, COD surcharge |
| Styling | Vanilla CSS with custom design tokens (dark gold theme) |
| Deployment | Vercel |

---

## Project structure

```
src/
├── app/
│   ├── (customer)/          # Customer portal — dashboard, orders, booking
│   ├── admin/               # Admin panel — orders, zones, rate cards, agents
│   ├── agent/               # Agent app — assigned orders, status updates
│   ├── api/
│   │   ├── chat/            # AI chatbot route (Groq + Gemini fallback)
│   │   ├── orders/          # CRUD + status updates + auto-assign
│   │   ├── zones/           # Zone management
│   │   ├── rate-cards/      # Rate card CRUD
│   │   ├── agents/          # Agent listing + location updates
│   │   └── auth/            # NextAuth + registration
│   └── auth/                # Login + register pages
│
├── components/
│   ├── Chatbot.tsx          # Floating AI chat widget (customer-only)
│   ├── ResponsiveLayout.tsx # Shared shell — sidebar, hamburger menu, top bar
│   ├── Sidebar.tsx          # Nav sidebar component
│   └── StatusBadge.tsx      # Order status pill
│
└── lib/
    ├── auth.ts              # NextAuth config
    ├── auto-assign.ts       # Nearest-agent assignment (Haversine sorting)
    ├── geocoder.ts          # Address → lat/lng via Nominatim
    ├── haversine.ts         # Great-circle distance formula
    ├── notifications.ts     # SMTP email dispatch
    ├── prisma.ts            # Prisma client singleton
    ├── rate-engine.ts       # Charge calculation logic
    ├── utils.ts             # Shared helpers
    └── zone-detector.ts     # Point-in-polygon zone detection
```

---

## How the charge calculation works

This is the most non-obvious part of the system, so it's worth explaining.

**Volumetric weight** = (Length × Breadth × Height) ÷ 5000

**Billed weight** = max(actual weight, volumetric weight)

The billed weight gets multiplied by a `baseRate` pulled from the matching rate card. Rate cards are looked up by:
1. Is it intra-zone (pickup and drop in same zone) or inter-zone?
2. Specific zone corridor match (e.g. Zone A → Zone B)
3. Reverse corridor fallback (Zone B → Zone A uses same card)
4. Generic catch-all card if no corridor-specific one exists

COD orders have a flat surcharge on top, configured separately per order type (B2B/B2C).

The total is stored on the order at creation time, not recalculated later — so historical charges don't change if you update rate cards.

---

## How auto-assignment works

When an order is created (or manually triggered), the system:

1. Fetches all agents with `isAvailable: true` and a known GPS position
2. Calculates Haversine distance from each agent to the pickup address
3. Sorts: agents in the same zone as pickup come first, then by distance
4. Picks the nearest eligible agent
5. Wraps it in a Prisma transaction: sets `order.agentId`, flips `agent.isAvailable = false`, creates a `TrackingEvent`

When an agent marks a delivery as delivered (or failed), they're released back to the available pool.

---

## AI chatbot — what it can actually do

The chatbot runs on Groq's free tier (`llama-3.3-70b-versatile`) with Gemini as a fallback. It's not a FAQ bot — it has tool access to the database and can take real actions:

- **Place a delivery order** — collects pickup address, drop address, package dimensions, weight, payment type, then creates the order, geocodes addresses, calculates the charge, writes to DB, and sends a confirmation email. All in one conversation.
- **List orders** — customers see their own, admins see everything
- **Track any order** — pulls live status and full event timeline
- **Preview charges** — estimate cost before committing
- **Explain an existing charge** — shows the volumetric weight formula with actual numbers
- **Reschedule failed deliveries** — updates status and notifies customer

The bot is only shown on the customer-facing side. Admin and agent panels don't have it.

If the model completes a tool call but forgets to write a reply (a known quirk of some open-source models), the client detects the empty response and automatically sends a hidden retry trigger after 600ms. The user never sees it — they just get a response.

---

## Order lifecycle

```
PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
                                                                ↘
                                                               FAILED → RESCHEDULED
```

Every transition creates an immutable `TrackingEvent` record with a timestamp, actor role, and optional notes. These are shown as a timeline on the order detail page and in emails.

---

## Email notifications

Emails go out on every status change via SMTP (nodemailer). The template is a custom HTML email — dark themed with gold accents, order details table, and a "Track Your Order" button. Gmail with an app password works fine. Configure in `.env.local`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # 16-char app password from myaccount.google.com/apppasswords
SMTP_FROM_NAME=DeliveryTracker
```

If SMTP isn't configured, it falls back to logging the email content to stdout (so local dev doesn't need a mail server).

---

## Setup

### Prerequisites
- Node.js 20+
- A PostgreSQL database (Neon's free tier works well)
- A Groq API key (free at console.groq.com — no card required)
- A Gmail account with 2FA enabled (for SMTP)

### Steps

```bash
git clone <repo-url>
cd delivery
npm install
```

Copy the env template:

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="run: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

GROQ_API_KEY="gsk_..."
GOOGLE_GENERATIVE_AI_API_KEY="AIza..."   # optional fallback

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM_NAME=DeliveryTracker
```

Run migrations and seed:

```bash
npx prisma migrate dev
npx prisma db seed        # creates an admin user, sample zones, and rate cards
```

Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Default admin credentials after seeding: `admin@deliverytracker.app` / `admin123` — change this immediately.

---

## Deploying to Vercel

1. Push to GitHub
2. Import repo in Vercel
3. Add all env vars from `.env.local` under **Settings → Environment Variables**
4. Set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to your actual Vercel domain
5. Deploy

The `GOOGLE_GENERATIVE_AI_API_KEY` and `GROQ_API_KEY` need to be set here too — `.env.local` is gitignored and never reaches the server.

---

## Database schema overview

| Table | Purpose |
|---|---|
| `User` | Unified user table — role determines what they see |
| `AgentProfile` | Agent-specific data: vehicle type, availability, current GPS |
| `Zone` | Delivery zone with a GeoJSON polygon boundary |
| `Area` | Named sub-area within a zone (for display) |
| `RateCard` | Pricing rules: intra/inter zone, order type, base rate, min charge |
| `CodSurcharge` | Flat COD fee per order type |
| `Order` | Full order record — addresses, geocoords, package, charges, status |
| `TrackingEvent` | Immutable status log per order (the timeline) |
| `Notification` | Email notification log with sent/failed status |

---

## Role access summary

| Feature | Customer | Agent | Admin |
|---|---|---|---|
| Book order (form) | ✅ | — | ✅ (for any customer) |
| Book order (chatbot) | ✅ | — | — |
| View own orders | ✅ | — | — |
| View all orders | — | — | ✅ |
| Update order status | — | ✅ (assigned orders) | ✅ |
| Assign agent | — | — | ✅ |
| Manage zones | — | — | ✅ |
| Manage rate cards | — | — | ✅ |
| View agent locations | — | — | ✅ |
| Receive email notifications | ✅ | — | — |

---

## Known limitations

- Geocoding uses Nominatim which has a 1 req/sec rate limit. For high-volume order creation this would need to be replaced with a paid geocoder or a local instance.
- Zone boundaries must be drawn as valid GeoJSON polygons. There's no built-in map editor — you'd use geojson.io or similar to create boundaries and paste them in.
- The Groq free tier has a daily limit of 14,400 requests. For a production deployment with heavy chatbot usage, you'd want to add a paid key or implement per-user rate limiting.
- Agent location tracking is passive (agents update it manually or on each status change). There's no continuous background GPS streaming.

---

## License

MIT
