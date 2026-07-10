import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Agent Management — Admin' }

export default async function AgentsPage() {
  const agents = await prisma.agentProfile.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          _count: { select: { ordersAsAgent: true } },
        },
      },
      currentZone: { select: { name: true } },
    },
    orderBy: { user: { name: 'asc' } },
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Agent Management</h1>
        <p className="text-gold-muted mt-1">{agents.length} registered agents</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-sm text-gold-muted">Total Agents</p>
          <p className="text-3xl font-bold gradient-text">{agents.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gold-muted">Available Now</p>
          <p className="text-3xl font-bold text-green-400">{agents.filter(a => a.isAvailable).length}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-gold-muted">On Delivery</p>
          <p className="text-3xl font-bold text-orange-400">{agents.filter(a => !a.isAvailable).length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Contact</th>
                <th>Vehicle</th>
                <th>Current Zone</th>
                <th>Location</th>
                <th>Orders</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gold-muted">No agents registered</td></tr>
              ) : agents.map(agent => (
                <tr key={agent.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center text-sm font-bold text-black shrink-0">
                        {agent.user.name[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-sm text-gold-primary">{agent.user.name}</span>
                    </div>
                  </td>
                  <td className="text-xs text-gold-muted">
                    <p>{agent.user.email}</p>
                    {agent.user.phone && <p>{agent.user.phone}</p>}
                  </td>
                  <td className="text-sm text-gold-secondary">{agent.vehicleType || '—'}</td>
                  <td className="text-sm text-gold-secondary">{agent.currentZone?.name || '—'}</td>
                  <td className="text-xs text-gold-muted font-mono">
                    {agent.currentLat && agent.currentLng
                      ? `${agent.currentLat.toFixed(3)}, ${agent.currentLng.toFixed(3)}`
                      : '—'}
                  </td>
                  <td className="text-center font-medium text-gold-primary">{agent.user._count.ordersAsAgent}</td>
                  <td>
                    <span className={`badge ${agent.isAvailable ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-orange-400 border-orange-500/30 bg-orange-500/10'}`}>
                      {agent.isAvailable ? '● Available' : '🚚 On Delivery'}
                    </span>
                  </td>
                  <td className="text-xs text-gold-muted">{formatDate(agent.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
