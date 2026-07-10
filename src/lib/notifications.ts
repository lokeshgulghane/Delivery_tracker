import { Resend } from 'resend'
import { prisma } from './prisma'
import { OrderStatus } from '@prisma/client'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL || 'noreply@deliverytracker.app'

export interface NotificationPayload {
  to: string
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

const STATUS_SUBJECTS: Record<OrderStatus, string> = {
  PENDING: '📦 Order Placed Successfully',
  ASSIGNED: '🚴 Delivery Agent Assigned',
  PICKED_UP: '✅ Package Picked Up',
  IN_TRANSIT: '🚚 Package In Transit',
  OUT_FOR_DELIVERY: '🏃 Out for Delivery',
  DELIVERED: '🎉 Package Delivered!',
  FAILED: '⚠️ Delivery Attempt Failed',
  RESCHEDULED: '📅 Delivery Rescheduled',
}

function buildEmailHtml(payload: NotificationPayload): string {
  const shortId = payload.orderId.slice(-8).toUpperCase()
  const statusText = payload.status.replace(/_/g, ' ')

  const statusMessages: Record<OrderStatus, string> = {
    PENDING: `Your order #${shortId} has been placed successfully. Our team will assign a delivery agent shortly.`,
    ASSIGNED: `Great news! A delivery agent${payload.agentName ? ` (${payload.agentName})` : ''} has been assigned to your order #${shortId}.`,
    PICKED_UP: `Your package for order #${shortId} has been picked up and is now with the delivery agent.`,
    IN_TRANSIT: `Your package for order #${shortId} is currently in transit to the delivery location.`,
    OUT_FOR_DELIVERY: `Your package for order #${shortId} is out for delivery! Expect it soon.`,
    DELIVERED: `Your package for order #${shortId} has been successfully delivered. Thank you for using our service!`,
    FAILED: `We were unable to deliver your package for order #${shortId}. ${payload.notes || ''} Please reschedule your delivery.`,
    RESCHEDULED: `Your delivery for order #${shortId} has been rescheduled${payload.scheduledDate ? ` for ${payload.scheduledDate.toLocaleDateString('en-IN')}` : ''}. We will assign a new agent soon.`,
  }

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${STATUS_SUBJECTS[payload.status]}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f23;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1a3e 0%,#16213e 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(139,92,246,0.3);">
  <tr><td style="background:linear-gradient(90deg,#7c3aed,#2563eb);padding:32px 40px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">🚚 DeliveryTracker</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Last-Mile Delivery Platform</p>
  </td></tr>
  <tr><td style="padding:40px;">
    <h2 style="color:#a78bfa;margin:0 0 8px;font-size:20px;">${STATUS_SUBJECTS[payload.status]}</h2>
    <p style="color:#94a3b8;margin:0 0 24px;font-size:14px;">Order Status: <strong style="color:#e2e8f0;">${statusText}</strong></p>
    
    <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#e2e8f0;margin:0;font-size:16px;line-height:1.6;">Hi ${payload.customerName},</p>
      <p style="color:#cbd5e1;margin:12px 0 0;font-size:15px;line-height:1.7;">${statusMessages[payload.status]}</p>
    </div>
    
    <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#64748b;margin:0 0 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Order Details</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="color:#94a3b8;padding:4px 0;font-size:14px;">Order ID</td><td align="right" style="color:#e2e8f0;font-weight:600;font-size:14px;">#${shortId}</td></tr>
        ${payload.pickupAddress ? `<tr><td style="color:#94a3b8;padding:4px 0;font-size:14px;">Pickup</td><td align="right" style="color:#e2e8f0;font-size:14px;max-width:300px;text-align:right;">${payload.pickupAddress}</td></tr>` : ''}
        ${payload.dropAddress ? `<tr><td style="color:#94a3b8;padding:4px 0;font-size:14px;">Delivery</td><td align="right" style="color:#e2e8f0;font-size:14px;max-width:300px;text-align:right;">${payload.dropAddress}</td></tr>` : ''}
        ${payload.totalCharge ? `<tr><td style="color:#94a3b8;padding:4px 0;font-size:14px;">Total Charge</td><td align="right" style="color:#a78bfa;font-weight:700;font-size:14px;">₹${payload.totalCharge}</td></tr>` : ''}
      </table>
    </div>
    
    <div style="text-align:center;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/orders/${payload.orderId}" 
         style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Track Your Order</a>
    </div>
  </td></tr>
  <tr><td style="background:rgba(0,0,0,0.2);padding:20px 40px;text-align:center;">
    <p style="color:#475569;margin:0;font-size:12px;">© 2024 DeliveryTracker. All rights reserved.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

export async function sendStatusNotification(payload: NotificationPayload): Promise<boolean> {
  try {
    const subject = STATUS_SUBJECTS[payload.status]
    const html = buildEmailHtml(payload)

    // Log to DB first
    const notification = await prisma.notification.create({
      data: {
        userId: payload.orderId, // Will be updated when we have userId
        orderId: payload.orderId,
        subject,
        message: `Status updated to ${payload.status}`,
        type: 'EMAIL',
      },
    })

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.startsWith('placeholder')) {
      console.log(`[EMAIL MOCK] To: ${payload.to} | Subject: ${subject}`)
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      return true
    }

    const { error } = await resend.emails.send({
      from: FROM,
      to: payload.to,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED' },
      })
      return false
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    })

    return true
  } catch (error) {
    console.error('Notification error:', error)
    return false
  }
}

export async function notifyOrderStatusChange(orderId: string, status: OrderStatus, notes?: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { name: true, email: true } },
        agent: { select: { name: true } },
      },
    })

    if (!order || !order.customer.email) return

    await sendStatusNotification({
      to: order.customer.email,
      customerName: order.customer.name,
      orderId: order.id,
      status,
      notes,
      agentName: order.agent?.name,
      scheduledDate: order.scheduledDate,
      totalCharge: order.totalCharge,
      pickupAddress: order.pickupAddress,
      dropAddress: order.dropAddress,
    })
  } catch (error) {
    console.error('notifyOrderStatusChange error:', error)
  }
}
