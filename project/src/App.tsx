import { useState, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { Logo } from './components/Logo';
import { LandingPage } from './components/LandingPage';
import { AuthPage } from './components/AuthPage';
import { ShipperPortal } from './components/ShipperPortal';
import { DriverPortal } from './components/DriverPortal';
import { DualPortal } from './components/DualPortal';
import { AdminLayout } from './components/AdminLayout';
import { TriplePortal } from './components/TriplePortal';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual' | 'triple';

function AppContent() {
  const { session, profile, adminUser, loading, signOut } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  // userNav is set when the user manually navigates (e.g. clicking Home).
  // null means "follow the auto-computed targetView".
  const [userNav, setUserNav] = useState<View | null>(null);
  const lastTargetView = useRef<View | null>(null);

  const isAdmin = !!(adminUser || profile?.roles?.includes('admin'));
  const isShipper = !!profile?.roles?.includes('shipper');
  const isDriver = !!profile?.roles?.includes('driver');
  const computedTarget: View | null = !session
    ? 'home'
    : (!adminUser && !profile)
      ? lastTargetView.current
      : isAdmin && isShipper && isDriver
        ? 'triple'
        : isAdmin && (isShipper || isDriver)
          ? 'triple'
          : isAdmin
            ? 'admin'
            : isShipper && isDriver
              ? 'dual'
              : isShipper
                ? 'shipper'
                : isDriver
                  ? 'driver'
                  : null;

  const targetView = computedTarget;
  if (computedTarget && computedTarget !== 'home' && session && (adminUser || profile)) {
    lastTargetView.current = computedTarget;
  }

  // Determine the effective view: if the user manually navigated, respect that
  // (as long as they're authorized). Otherwise follow targetView.
  let view: View;
  if (!session) {
    view = userNav === 'auth' ? 'auth' : 'home';
  } else if (userNav === 'auth') {
    view = targetView ?? 'home'; // logged in — redirect from auth page to portal
  } else if (userNav && userNav !== 'home') {
    // User manually selected a portal — only allow if authorized
    const allowed =
      (userNav === 'admin' && (targetView === 'admin' || targetView === 'triple')) ||
      (userNav === 'triple' && targetView === 'triple') ||
      (userNav === 'dual' && (targetView === 'dual' || targetView === 'triple')) ||
      (userNav === 'shipper' && (targetView === 'shipper' || targetView === 'dual' || targetView === 'triple')) ||
      (userNav === 'driver' && (targetView === 'driver' || targetView === 'dual' || targetView === 'triple'));
    view = allowed ? userNav : (targetView ?? 'home');
  } else if (userNav === 'home') {
    view = 'home';
  } else {
    view = targetView ?? 'home';
  }

  const setView = (v: View) => {
    setUserNav(v);
  };

  const handleSignOut = async () => {
    setUserNav(null);
    await signOut();
  };

  // Single loading screen for all states where session exists but profile
  // hasn't loaded yet. Prevents flicker between home, auth, and portal.
  if (session && loading && !profile && !adminUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a1845]">
        <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={64} height={64} className="rounded-full mb-4 animate-pulse" />
        <div className="text-blue-200 mb-4">Loading your account...</div>
        <button onClick={handleSignOut} className="text-sm text-blue-300 hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    );
  }

  // Initial app load (no session yet, checking auth state).
  if (loading && !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a1845]">
        <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={64} height={64} className="rounded-full mb-4 animate-pulse" />
        <div className="text-blue-200">Loading...</div>
      </div>
    );
  }

  if (view === 'auth') {
    return <AuthPage setView={setView} initialMode={authMode} />;
  }

  if (view === 'admin' && (targetView === 'admin' || targetView === 'triple')) {
    return <AdminLayout setView={setView} />;
  }
  if (view === 'triple' && targetView === 'triple') {
    return <TriplePortal setView={setView} />;
  }
  if (view === 'dual' && (targetView === 'dual' || targetView === 'triple')) {
    return <DualPortal setView={setView} />;
  }
  if (view === 'shipper' && (targetView === 'shipper' || targetView === 'dual' || targetView === 'triple')) {
    return <ShipperPortal setView={setView} />;
  }
  if (view === 'driver' && (targetView === 'driver' || targetView === 'dual' || targetView === 'triple')) {
    return <DriverPortal setView={setView} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a1845]">
      <header className="bg-[#0a1845] border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => setView('home')}>
            <Logo size={40} />
          </button>
          <nav className="hidden md:flex items-center gap-1">
            {session ? (
              <>
                {(adminUser || profile?.roles?.includes('admin')) ? (
                  <button onClick={() => setView('admin')} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Admin Panel</button>
                ) : profile?.roles?.includes('shipper') && profile?.roles?.includes('driver') ? (
                  <button onClick={() => setView('dual')} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Dual Portal</button>
                ) : (
                  <>
                    {profile?.roles?.includes('shipper') && (
                      <button onClick={() => setView('shipper')} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Shipper Portal</button>
                    )}
                    {profile?.roles?.includes('driver') && (
                      <button onClick={() => setView('driver')} className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Driver Portal</button>
                    )}
                  </>
                )}
                <button onClick={handleSignOut} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-blue-200 hover:text-red-300 hover:bg-white/10 transition-colors ml-1">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </>
            ) : (
              <button onClick={() => setView('auth')} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95">Get Started</button>
            )}
          </nav>
          {session && (
            <div className="md:hidden flex items-center gap-1">
              {(adminUser || profile?.roles?.includes('admin')) ? (
                <button onClick={() => setView('admin')} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Admin</button>
              ) : profile?.roles?.includes('shipper') && profile?.roles?.includes('driver') ? (
                <button onClick={() => setView('dual')} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Portal</button>
              ) : (
                <>
                  {profile?.roles?.includes('shipper') && (
                    <button onClick={() => setView('shipper')} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Shipper</button>
                  )}
                  {profile?.roles?.includes('driver') && (
                    <button onClick={() => setView('driver')} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors">Driver</button>
                  )}
                </>
              )}
              <button onClick={handleSignOut} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-200 hover:text-red-300 hover:bg-white/10 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">
        <LandingPage setView={setView} session={session} adminUser={adminUser} profile={profile} onAuthMode={setAuthMode} />
      </main>
      <footer className="bg-[#070f2e] text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <Logo size={36} />
            <div className="flex items-center gap-6 text-sm">
              <span className="hover:text-white cursor-pointer transition-colors">HIPAA Compliant</span>
              <span className="hover:text-white cursor-pointer transition-colors">DOT Certified</span>
              <span className="hover:text-white cursor-pointer transition-colors">24/7 Support</span>
            </div>
            <p className="text-xs text-slate-500">© 2026 Zhuri Transcare. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
