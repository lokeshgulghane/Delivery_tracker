import { OrderStatus } from '@prisma/client'
import { getStatusColor, getStatusIcon, getStatusLabel } from '@/lib/utils'

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${getStatusColor(status)}`}>
      {getStatusIcon(status)} {getStatusLabel(status)}
    </span>
  )
}
