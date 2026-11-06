import {
  Shield, Zap, Navigation, Snowflake, Heart, DollarSign,
  Plus, Truck, Package, ArrowRight, Lock, Phone, Mail,
} from 'lucide-react';
import { DisclaimerLink } from './Disclaimer';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual';

interface LandingPageProps {
  setView: (v: View) => void;
  session?: unknown;
  adminUser?: { role?: string } | null;
  profile?: { roles?: string[] } | null;
  onAuthMode?: (mode: 'login' | 'register') => void;
}

export function LandingPage({ setView, session, adminUser, profile, onAuthMode }: LandingPageProps) {
  const isAdmin = !!session && (!!adminUser || !!profile?.roles?.includes('admin'));
  const isDual = !!session && !isAdmin && !!profile?.roles?.includes('shipper') && !!profile?.roles?.includes('driver');
  const isShipper = !!session && !isAdmin && !!profile?.roles?.includes('shipper') && !profile?.roles?.includes('driver');
  const isDriver = !!session && !isAdmin && !!profile?.roles?.includes('driver') && !profile?.roles?.includes('shipper');

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a1845] via-[#0d1f5c] to-[#102572]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="text-center max-w-3xl mx-auto">
            <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={80} height={80} className="rounded-full mx-auto mb-6" />
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-blue-200 text-xs font-semibold mb-6">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              HIPAA-Compliant Medical Delivery Network
            </div>
            <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
              Urgent medical deliveries,
              <span className="block bg-gradient-to-r from-blue-300 to-emerald-300 bg-clip-text text-transparent">
                dispatched with precision
              </span>
            </h1>
            <p className="mt-6 text-lg text-blue-100 max-w-2xl mx-auto leading-relaxed">
              Zhuri Transcare connects pharmacies, labs, and hospitals with certified medical
              couriers for time-critical deliveries. Post a delivery, receive competitive bids, and
              track every mile in real time.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {isAdmin ? (
                <button onClick={() => setView('admin')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto">
                  <Shield className="w-4 h-4" />
                  Admin Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : isDual ? (
                <button onClick={() => setView('dual')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto">
                  Go to Portals
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : isShipper ? (
                <button onClick={() => setView('shipper')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto">
                  Shipper Portal
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : isDriver ? (
                <button onClick={() => setView('driver')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto">
                  Driver Portal
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <>
                  <button onClick={() => { onAuthMode?.('register'); setView('auth'); }} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 w-full sm:w-auto">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => { onAuthMode?.('login'); setView('auth'); }} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-all active:scale-95 w-full sm:w-auto shadow-lg shadow-emerald-500/30">
                    <Package className="w-4 h-4" />
                    Shipper Login
                  </button>
                  <button onClick={() => { onAuthMode?.('register'); setView('auth'); }} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur-sm text-white border border-white/20 font-semibold text-sm hover:bg-white/20 transition-all active:scale-95 w-full sm:w-auto">
                    <Truck className="w-4 h-4" />
                    Become a Driver
                  </button>
                  <button onClick={() => { onAuthMode?.('login'); setView('auth'); }} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur-sm text-white border border-white/20 font-semibold text-sm hover:bg-white/20 transition-all active:scale-95 w-full sm:w-auto">
                    <Lock className="w-4 h-4" />
                    Admin Login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900">Built for medical logistics</h2>
          <p className="mt-3 text-slate-600 max-w-2xl mx-auto">
            Every feature is designed around the unique demands of medical delivery — compliance,
            speed, and chain-of-custody integrity.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Shield, title: 'HIPAA-Compliant Network', desc: 'Every courier in our network is HIPAA-certified and background-checked. Chain of custody is documented at every handoff.', color: 'primary' },
            { icon: Zap, title: 'Competitive Bidding', desc: 'Post a delivery and receive bids from certified couriers in minutes. Choose by price, ETA, or rating.', color: 'emerald' },
            { icon: Navigation, title: 'Real-Time Tracking', desc: 'Track every delivery from pickup to drop-off with live status updates and GPS-verified milestones.', color: 'amber' },
            { icon: Snowflake, title: 'Cold Chain Support', desc: 'Refrigerated, frozen, and ambient temperature options for medications, specimens, and biologics.', color: 'primary' },
            { icon: Heart, title: 'Emergency Transport', desc: 'Organ transport, emergency medication, and STAT deliveries with dedicated priority routing.', color: 'red' },
            { icon: DollarSign, title: 'Transparent Pricing', desc: 'Set your max budget and let couriers compete. Automatic 10% platform fee, 90% to the driver instantly.', color: 'emerald' },
          ].map((feat, i) => {
            const Icon = feat.icon;
            const colorClasses: Record<string, string> = {
              primary: 'bg-primary-50 text-primary-600',
              emerald: 'bg-emerald-50 text-emerald-600',
              amber: 'bg-amber-50 text-amber-600',
              red: 'bg-red-50 text-red-600',
            };
            return (
              <div key={feat.title} className="card p-6 hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl ${colorClasses[feat.color]} flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold">How it works</h2>
            <p className="mt-3 text-slate-400">From request to delivery in four simple steps</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: 'Create Account', desc: 'Register as a shipper, driver, or both with a single email address.' },
              { step: '02', title: 'Post a Delivery', desc: 'Enter pickup and drop-off details, package type, priority level, and your max budget.' },
              { step: '03', title: 'Auto-Assign or Bid', desc: 'System auto-assigns to nearest driver, or couriers submit competitive bids.' },
              { step: '04', title: 'Track & Pay', desc: 'Monitor real-time status. Payment auto-distributed: 90% to driver, 10% platform fee.' },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                <div className="text-4xl font-extrabold text-primary-400/30 mb-2">{s.step}</div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                {i < 3 && <ArrowRight className="hidden md:block absolute top-0 -right-4 w-5 h-5 text-slate-700" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl bg-slate-50 border border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Need help with a delivery?</div>
              <div className="text-xs text-slate-500">Our support team is available to assist you</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <a href="mailto:zhuritranscare@gmail.com" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all active:scale-95">
              <Mail className="w-4 h-4" />
              zhuritranscare@gmail.com
            </a>
            <a href="tel:+19784170522" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 transition-all active:scale-95">
              <Phone className="w-4 h-4" />
              +1 (978) 417-0522
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1845] to-[#102572] p-10 sm:p-16 text-center border border-white/10">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-3xl" />
          </div>
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to dispatch?</h2>
            <p className="text-primary-100 text-lg max-w-xl mx-auto mb-8">
              Join Zhuri Transcare today. Register as a shipper, driver, or both.
            </p>
            <button onClick={() => setView('auth')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-primary-700 font-semibold text-sm hover:bg-primary-50 transition-all active:scale-95">
              <Plus className="w-4 h-4" />
              Create Your Account
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src="/zhuri-transcare-logo.svg" alt="ZITRUCKGO" width={28} height={28} className="rounded-full" />
              <span className="text-sm font-semibold text-slate-700">ZITRUCKGO</span>
            </div>
            <DisclaimerLink className="text-slate-500" />
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} ZITRUCKGO. A marketplace for equal opportunity.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
