import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { OrderStatus } from '@prisma/client'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getStatusColor(status: OrderStatus): string {
  const colors: Record<OrderStatus, string> = {
    PENDING:          'text-amber-400 bg-amber-400/10 border-amber-400/30',
    ASSIGNED:         'text-sky-400 bg-sky-400/10 border-sky-400/30',
    PICKED_UP:        'text-cyan-300 bg-cyan-300/10 border-cyan-300/30',
    IN_TRANSIT:       'text-blue-300 bg-blue-300/10 border-blue-300/30',
    OUT_FOR_DELIVERY: 'text-yellow-300 bg-yellow-300/10 border-yellow-300/30',
    DELIVERED:        'text-green-400 bg-green-400/10 border-green-400/30',
    FAILED:           'text-red-400 bg-red-400/10 border-red-400/30',
    RESCHEDULED:      'text-orange-400 bg-orange-400/10 border-orange-400/30',
  }
  return colors[status]
}

export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    PENDING: 'Pending',
    ASSIGNED: 'Assigned',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    FAILED: 'Failed',
    RESCHEDULED: 'Rescheduled',
  }
  return labels[status]
}

export function getStatusIcon(status: OrderStatus): string {
  const icons: Record<OrderStatus, string> = {
    PENDING: '⏳',
    ASSIGNED: '🚴',
    PICKED_UP: '📦',
    IN_TRANSIT: '🚚',
    OUT_FOR_DELIVERY: '🏃',
    DELIVERED: '✅',
    FAILED: '❌',
    RESCHEDULED: '📅',
  }
  return icons[status]
}

export function generateOrderShortId(id: string): string {
  return id.slice(-8).toUpperCase()
}
