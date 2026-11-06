import { useState } from 'react';
import { LayoutDashboard, Package, Truck, Navigation, DollarSign, Wallet, FileText, MessageSquare, Star, Bell, User, Settings, LogOut, Home, Menu, X, MapPin, ClipboardList } from 'lucide-react';
import { type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useDriverLocation } from '../lib/useDriverLocation';
import { type View, type DriverTab } from './driver/shared';
import { DashboardTab } from './driver/DashboardTab';
import { FindLoads } from './driver/FindLoads';
import { MyLoads } from './driver/MyLoads';
import { ActiveDelivery } from './driver/ActiveDelivery';
import { LiveTrackingTab } from './driver/LiveTrackingTab';
import { EarningsTab } from './driver/EarningsTab';
import { PaymentsPayoutsTab } from './driver/PaymentsPayoutsTab';
import { DocumentsTab } from './driver/DocumentsTab';
import { MessagesTab } from './driver/MessagesTab';
import { RatingsTab } from './driver/RatingsTab';
import { NotificationsTab } from './driver/NotificationsTab';
import { DriverProfile } from './driver/DriverProfile';
import { SettingsTab } from './driver/SettingsTab';
import { DispatchOrders } from './DispatchOrders';

const TABS: { id: DriverTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'find-loads', label: 'Find Loads', icon: Package },
  { id: 'my-loads', label: 'My Loads', icon: Truck },
  { id: 'dispatch-orders', label: 'Dispatch Orders', icon: ClipboardList },
  { id: 'active-delivery', label: 'Active Delivery', icon: Navigation },
  { id: 'live-tracking', label: 'Live Tracking', icon: MapPin },
  { id: 'earnings', label: 'Earnings', icon: DollarSign },
  { id: 'payments', label: 'Payments & Payouts', icon: Wallet },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'ratings', label: 'Ratings', icon: Star },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function DriverPortal({ setView, embedded }: { setView: (v: View) => void; embedded?: boolean }) {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<DriverTab>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('stripe') === 'return' || params.get('stripe') === 'refresh') return 'payments';
    } catch { /* ignore */ }
    return 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useDriverLocation(profile?.id, !!profile && profile.roles?.includes('driver'));

  const content = (
    <div>
      <div className={tab === 'dashboard' ? '' : 'hidden'}><DashboardTab onNavigate={setTab} /></div>
      <div className={tab === 'find-loads' ? '' : 'hidden'}><FindLoads /></div>
      <div className={tab === 'my-loads' ? '' : 'hidden'}><MyLoads onNavigate={setTab} /></div>
      <div className={tab === 'dispatch-orders' ? '' : 'hidden'}><DispatchOrders /></div>
      <div className={tab === 'active-delivery' ? '' : 'hidden'}><ActiveDelivery /></div>
      <div className={tab === 'live-tracking' ? '' : 'hidden'}><LiveTrackingTab /></div>
      <div className={tab === 'earnings' ? '' : 'hidden'}><EarningsTab /></div>
      <div className={tab === 'payments' ? '' : 'hidden'}><PaymentsPayoutsTab /></div>
      <div className={tab === 'documents' ? '' : 'hidden'}><DocumentsTab /></div>
      <div className={tab === 'messages' ? '' : 'hidden'}><MessagesTab /></div>
      <div className={tab === 'ratings' ? '' : 'hidden'}><RatingsTab /></div>
      <div className={tab === 'notifications' ? '' : 'hidden'}><NotificationsTab /></div>
      <div className={tab === 'profile' ? '' : 'hidden'}><DriverProfile /></div>
      <div className={tab === 'settings' ? '' : 'hidden'}><SettingsTab /></div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex gap-6 relative">
        <DriverSidebar tab={tab} setTab={setTab} profile={profile} embedded sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <div className="flex-1 min-w-0">
          <DriverMobileBar tab={tab} setSidebarOpen={setSidebarOpen} embedded />
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <DriverSidebar tab={tab} setTab={setTab} profile={profile} onSignOut={signOut} onHome={() => setView('home')} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <DriverMobileBar tab={tab} setSidebarOpen={setSidebarOpen} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{content}</div>
      </div>
    </div>
  );
}

function DriverMobileBar({ tab, setSidebarOpen, embedded }: { tab: DriverTab; setSidebarOpen: (v: boolean) => void; embedded?: boolean }) {
  const activeTab = TABS.find((t) => t.id === tab);
  const Icon = activeTab?.icon ?? LayoutDashboard;
  return (
    <header className={`bg-white border-b border-slate-200 sticky top-0 z-30 ${embedded ? 'lg:hidden' : 'lg:hidden'}`}>
      <div className="flex items-center justify-between h-14 px-4">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-slate-900 text-sm">{activeTab?.label}</span>
        </div>
        <div className="w-9" />
      </div>
    </header>
  );
}

function DriverSidebar({ tab, setTab, profile, onSignOut, onHome, embedded, sidebarOpen, setSidebarOpen }: {
  tab: DriverTab; setTab: (t: DriverTab) => void; profile: Profile | null;
  onSignOut?: () => void; onHome?: () => void; embedded?: boolean;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void;
}) {
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${embedded ? 'lg:self-start lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20 lg:rounded-xl' : ''}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={36} height={36} className="rounded-full shrink-0" />
            <div>
              <div className="font-bold text-slate-900 text-sm">Driver Portal</div>
              <div className="text-xs text-slate-500 truncate max-w-[120px]">{profile?.full_name}</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon className="w-4 h-4 shrink-0" /> {t.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100 space-y-0.5">
          {onHome && (
            <button onClick={onHome} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Home className="w-4 h-4 shrink-0" /> Home
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4 shrink-0" /> Sign Out
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
