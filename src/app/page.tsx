import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await auth()

  // Redirect logged-in users to their dashboard
  if (session?.user) {
    if (session.user.role === 'ADMIN') redirect('/admin')
    if (session.user.role === 'AGENT') redirect('/agent')
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen bg-[#0a0a1a] overflow-hidden">
      {/* ── Ambient Background ──────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-700/20 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-indigo-700/10 blur-[100px]" />
      </div>

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="relative z-10 glass border-b border-purple-500/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-lg">
              🚚
            </div>
            <span className="text-xl font-bold gradient-text">DeliveryTracker</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="btn-secondary py-2 px-4 text-sm">Sign In</Link>
            <Link href="/auth/register" className="btn-primary py-2 px-4 text-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-purple-500/30 text-sm text-purple-300 mb-8 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Real-time last-mile delivery platform
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 leading-tight animate-fade-in">
          Deliver Smarter.<br />
          <span className="gradient-text">Track Everything.</span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 animate-fade-in">
          Intelligent auto-assignment, dynamic pricing engine with B2B/B2C rate cards,
          real-time tracking, and AI-powered customer support — all in one platform.
        </p>

        <div className="flex flex-wrap gap-4 justify-center animate-fade-in">
          <Link href="/auth/register" className="btn-primary text-base px-8 py-3">
            🚀 Start Delivering
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base px-8 py-3">
            View Dashboard →
          </Link>
        </div>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-3 md:grid-cols-3 gap-6 max-w-2xl mx-auto mt-20">
          {[
            { label: 'Orders Processed', value: '10K+', icon: '📦' },
            { label: 'Delivery Agents', value: '500+', icon: '🛵' },
            { label: 'Success Rate', value: '98.2%', icon: '✅' },
          ].map((stat) => (
            <div key={stat.label} className="card text-center">
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold gradient-text">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Built for <span className="gradient-text">Real-World Logistics</span>
        </h2>
        <p className="text-slate-400 text-center mb-12 max-w-xl mx-auto">
          Every feature designed to handle the complexity of last-mile delivery operations at scale.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: '⚡',
              title: 'Smart Rate Engine',
              desc: 'Auto-calculates charges using volumetric weight, B2B/B2C rate cards, zone detection, and COD surcharges. Zero hardcoding — fully admin-configurable.',
            },
            {
              icon: '🗺️',
              title: 'Zone-Based Routing',
              desc: 'Draw delivery zones graphically on a map. System auto-detects pickup/drop zones and selects the correct rate card for intra or inter-zone delivery.',
            },
            {
              icon: '🤖',
              title: 'Auto Agent Assignment',
              desc: 'Nearest available agent detected by zone preference + Haversine distance. Atomic assignment prevents double-booking.',
            },
            {
              icon: '📍',
              title: 'Live Tracking',
              desc: 'Immutable tracking timeline with every status change logged (actor, timestamp, notes). Customers see real-time updates without page reload.',
            },
            {
              icon: '💬',
              title: 'AI Chatbot Support',
              desc: 'Gemini-powered assistant with tool-calling. Ask about order status, charge breakdowns, or reschedule failed deliveries — in natural language.',
            },
            {
              icon: '📧',
              title: 'Email Notifications',
              desc: 'Beautiful HTML emails sent at every status change. Templates for assignment, pickup, transit, delivery, failure, and reschedule.',
            },
          ].map((f) => (
            <div key={f.title} className="card group hover:translate-y-[-4px] transition-transform duration-200">
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">
          How It <span className="gradient-text">Works</span>
        </h2>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { step: '01', icon: '📋', title: 'Place Order', desc: 'Enter pickup & drop addresses, package dimensions, and payment type.' },
            { step: '02', icon: '💰', title: 'Get Quote', desc: 'System auto-calculates charge using rate engine before you confirm.' },
            { step: '03', icon: '🛵', title: 'Agent Assigned', desc: 'Nearest available agent is automatically assigned to your order.' },
            { step: '04', icon: '✅', title: 'Track & Receive', desc: 'Follow every status update in real-time until delivered to your door.' },
          ].map((step, i) => (
            <div key={step.step} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/30 to-blue-600/30 border border-purple-500/30 flex items-center justify-center text-2xl mx-auto mb-4">
                {step.icon}
              </div>
              <div className="text-xs font-bold text-purple-400 mb-1">{step.step}</div>
              <h3 className="font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-slate-400">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Role Cards ───────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">
          Three Portals, <span className="gradient-text">One Platform</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              role: 'Customer',
              icon: '👤',
              color: 'from-purple-600 to-indigo-600',
              features: ['Place & track orders', 'Real-time status updates', 'Reschedule failed deliveries', 'AI chatbot support', 'Email notifications'],
              href: '/auth/register',
              cta: 'Register as Customer',
            },
            {
              role: 'Admin',
              icon: '⚙️',
              color: 'from-blue-600 to-cyan-600',
              features: ['Manage zones & rate cards', 'Assign/reassign agents', 'Override any order status', 'View analytics dashboard', 'Create orders on behalf of customers'],
              href: '/auth/login',
              cta: 'Admin Login',
            },
            {
              role: 'Delivery Agent',
              icon: '🛵',
              color: 'from-green-600 to-teal-600',
              features: ['View assigned orders', 'Update delivery status', 'Mark COD collected', 'Share live location', 'View route map'],
              href: '/auth/register',
              cta: 'Register as Agent',
            },
          ].map((portal) => (
            <div key={portal.role} className="card flex flex-col">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${portal.color} flex items-center justify-center text-2xl mb-4`}>
                {portal.icon}
              </div>
              <h3 className="text-xl font-bold mb-4">{portal.role} Portal</h3>
              <ul className="space-y-2 mb-6 flex-1">
                {portal.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href={portal.href} className="btn-primary w-full justify-center text-sm">
                {portal.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-purple-500/10 py-8 px-6 text-center text-slate-500 text-sm">
        <p>© 2024 DeliveryTracker. Built for real-world last-mile logistics.</p>
      </footer>
    </main>
  )
}
