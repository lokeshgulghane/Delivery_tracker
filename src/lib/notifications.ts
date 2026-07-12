import nodemailer from 'nodemailer'
import { prisma } from './prisma'
import { OrderStatus } from '@prisma/client'

// ── SMTP Transporter ─────────────────────────────────────────────────────────
// Lazy-initialised once so the connection pool is reused across requests
let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true → port 465 (SSL), false → STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  return _transporter
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NotificationPayload {
  to: string
  customerId: string
  customerName: string
  orderId: string
  status: OrderStatus
  notes?: string
  agentName?: string
  scheduledDate?: Date | null
  totalCharge?: number
  pickupAddress?: string
  dropAddress?: string
}

// ── Subject lines ─────────────────────────────────────────────────────────────
const STATUS_SUBJECTS: Record<OrderStatus, string> = {
  PENDING:          '📦 Order Placed — DeliveryTracker',
  ASSIGNED:         '🚴 Delivery Agent Assigned — DeliveryTracker',
  PICKED_UP:        '✅ Package Picked Up — DeliveryTracker',
  IN_TRANSIT:       '🚚 Package In Transit — DeliveryTracker',
  OUT_FOR_DELIVERY: '🏃 Out for Delivery — DeliveryTracker',
  DELIVERED:        '🎉 Package Delivered! — DeliveryTracker',
  FAILED:           '⚠️ Delivery Attempt Failed — DeliveryTracker',
  RESCHEDULED:      '📅 Delivery Rescheduled — DeliveryTracker',
}

const STATUS_ICONS: Record<OrderStatus, string> = {
  PENDING:          '📦',
  ASSIGNED:         '🚴',
  PICKED_UP:        '✅',
  IN_TRANSIT:       '🚚',
  OUT_FOR_DELIVERY: '🏃',
  DELIVERED:        '🎉',
  FAILED:           '⚠️',
  RESCHEDULED:      '📅',
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function buildEmailHtml(payload: NotificationPayload): string {
  const shortId    = payload.orderId.slice(-8).toUpperCase()
  const statusLabel = payload.status.replace(/_/g, ' ')
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const isFailure  = payload.status === 'FAILED'
  const badgeColor = isFailure ? '#ef4444' : '#D4A017'

  const statusMessages: Record<OrderStatus, string> = {
    PENDING:          `Your order <strong>#${shortId}</strong> has been placed successfully. Our team will assign a delivery agent shortly.`,
    ASSIGNED:         `Great news! A delivery agent${payload.agentName ? ` <strong>${payload.agentName}</strong>` : ''} has been assigned to your order <strong>#${shortId}</strong> and will pick up your package soon.`,
    PICKED_UP:        `Your package for order <strong>#${shortId}</strong> has been picked up and is now with the delivery agent.`,
    IN_TRANSIT:       `Your package for order <strong>#${shortId}</strong> is currently in transit and on its way to the delivery location.`,
    OUT_FOR_DELIVERY: `Your package for order <strong>#${shortId}</strong> is out for delivery! Expect it within the next few hours.`,
    DELIVERED:        `Your package for order <strong>#${shortId}</strong> has been successfully delivered. Thank you for trusting DeliveryTracker!`,
    FAILED:           `We were unable to deliver your package for order <strong>#${shortId}</strong>.${payload.notes ? ` Reason: ${payload.notes}` : ''} Please reschedule your delivery.`,
    RESCHEDULED:      `Your delivery for order <strong>#${shortId}</strong> has been rescheduled${payload.scheduledDate ? ` for <strong>${new Date(payload.scheduledDate).toLocaleDateString('en-IN')}</strong>` : ''}. We will assign a new agent shortly.`,
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${STATUS_SUBJECTS[payload.status]}</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#080808;padding:40px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a1400 0%,#0f0f0f 100%);border:1px solid #D4A017;border-bottom:none;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
    <div style="color:#D4A017;font-size:28px;font-weight:800;letter-spacing:-0.5px;">🚚 DeliveryTracker</div>
    <p style="color:#9a8060;margin:6px 0 0;font-size:13px;letter-spacing:0.5px;">LAST-MILE DELIVERY PLATFORM</p>
  </td></tr>

  <!-- Status Badge -->
  <tr><td style="background:#111111;border-left:1px solid #D4A017;border-right:1px solid #D4A017;padding:24px 40px 0;text-align:center;">
    <div style="display:inline-block;background:${badgeColor}22;border:1px solid ${badgeColor};border-radius:100px;padding:8px 20px;margin-bottom:16px;">
      <span style="color:${badgeColor};font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${STATUS_ICONS[payload.status]} ${statusLabel}</span>
    </div>
  </td></tr>

  <!-- Main Content -->
  <tr><td style="background:#111111;border-left:1px solid #D4A017;border-right:1px solid #D4A017;padding:8px 40px 32px;">
    <p style="color:#e8d5a3;font-size:16px;margin:0 0 8px;">Hi <strong>${payload.customerName}</strong>,</p>
    <p style="color:#b8a070;font-size:15px;line-height:1.7;margin:0 0 28px;">${statusMessages[payload.status]}</p>

    <!-- Order Details -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#1a1400;border:1px solid #2d2000;border-radius:12px;margin-bottom:28px;">
      <tr><td style="padding:16px 20px;border-bottom:1px solid #2d2000;">
        <span style="color:#6b5a3a;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Order Details</span>
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#6b5a3a;font-size:13px;padding:5px 0;">Order ID</td>
            <td align="right" style="color:#F0C040;font-weight:700;font-size:14px;font-family:monospace;">#${shortId}</td>
          </tr>
          ${payload.pickupAddress ? `<tr>
            <td style="color:#6b5a3a;font-size:13px;padding:5px 0;vertical-align:top;">Pickup</td>
            <td align="right" style="color:#c8b080;font-size:13px;max-width:300px;text-align:right;">${payload.pickupAddress}</td>
          </tr>` : ''}
          ${payload.dropAddress ? `<tr>
            <td style="color:#6b5a3a;font-size:13px;padding:5px 0;vertical-align:top;">Delivery To</td>
            <td align="right" style="color:#c8b080;font-size:13px;max-width:300px;text-align:right;">${payload.dropAddress}</td>
          </tr>` : ''}
          ${payload.agentName && payload.status !== 'PENDING' ? `<tr>
            <td style="color:#6b5a3a;font-size:13px;padding:5px 0;">Delivery Agent</td>
            <td align="right" style="color:#c8b080;font-size:13px;">${payload.agentName}</td>
          </tr>` : ''}
          ${payload.totalCharge ? `<tr>
            <td style="color:#6b5a3a;font-size:13px;padding:5px 0;">Total Charge</td>
            <td align="right" style="color:#D4A017;font-weight:700;font-size:15px;">₹${payload.totalCharge}</td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;">
      <a href="${appUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#D4A017,#F0C040);color:#080808;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;">
        Track Your Order →
      </a>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f0f0f;border:1px solid #D4A017;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
    <p style="color:#3a3020;margin:0;font-size:12px;">Sent by DeliveryTracker Admin · This is an automated notification</p>
    <p style="color:#3a3020;margin:6px 0 0;font-size:11px;">© ${new Date().getFullYear()} DeliveryTracker. All rights reserved.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

// ── Core send function ────────────────────────────────────────────────────────
export async function sendStatusNotification(payload: NotificationPayload): Promise<boolean> {
  const subject = STATUS_SUBJECTS[payload.status]
  const html    = buildEmailHtml(payload)

  // Log to DB first
  const notification = await prisma.notification.create({
    data: {
      userId:  payload.customerId,
      orderId: payload.orderId,
      subject,
      message: `Status updated to ${payload.status}`,
      type:    'EMAIL',
    },
  })

  // If SMTP is not configured → mock log and mark sent
  const smtpReady = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  )

  if (!smtpReady) {
    console.log(`[EMAIL MOCK] To: ${payload.to} | Subject: ${subject}`)
    console.log('[EMAIL MOCK] Configure SMTP_HOST / SMTP_USER / SMTP_PASS in .env.local to send real emails.')
    await prisma.notification.update({
      where: { id: notification.id },
      data:  { status: 'SENT', sentAt: new Date() },
    })
    return true
  }

  try {
    const transporter = getTransporter()
    const fromName    = process.env.SMTP_FROM_NAME || 'DeliveryTracker'
    const fromEmail   = process.env.SMTP_USER!

    const info = await transporter.sendMail({
      from:    `"${fromName}" <${fromEmail}>`,
      to:      payload.to,
      subject,
      html,
    })

    console.log(`[EMAIL SENT] messageId=${info.messageId} | to=${payload.to} | status=${payload.status}`)

    await prisma.notification.update({
      where: { id: notification.id },
      data:  { status: 'SENT', sentAt: new Date() },
    })
    return true
  } catch (err) {
    console.error('[SMTP ERROR]', err)
    await prisma.notification.update({
      where: { id: notification.id },
      data:  { status: 'FAILED' },
    })
    return false
  }
}

// ── Public helper called by all order routes ──────────────────────────────────
export async function notifyOrderStatusChange(
  orderId: string,
  status: OrderStatus,
  notes?: string,
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        agent:    { select: { name: true } },
      },
    })

    if (!order || !order.customer.email) {
      console.warn(`[NOTIFY] No customer email for order ${orderId}`)
      return
    }

    await sendStatusNotification({
      to:           order.customer.email,
      customerId:   order.customer.id,
      customerName: order.customer.name,
      orderId:      order.id,
      status,
      notes,
      agentName:    order.agent?.name,
      scheduledDate: order.scheduledDate,
      totalCharge:  order.totalCharge ?? undefined,
      pickupAddress: order.pickupAddress,
      dropAddress:  order.dropAddress,
    })
  } catch (err) {
    console.error('[notifyOrderStatusChange ERROR]', err)
  }
}
