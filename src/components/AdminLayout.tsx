import { useState } from 'react';
import {
  LayoutDashboard, Package, Truck, Users, MapPin, DollarSign,
  BarChart3, Bell, LifeBuoy, Settings, UserCog, MessageSquare,
  Menu, LogOut, ChevronRight, Gavel,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';
import { AdminDashboardPage } from './admin/Dashboard';
import { AdminDeliveriesPage } from './admin/Deliveries';
import { AdminDriversPage } from './admin/Drivers';
import { AdminCustomersPage } from './admin/Customers';
import { AdminLiveTrackingPage } from './admin/LiveTracking';
import { AdminPaymentsPage } from './admin/Payments';
import { AdminReportsPage } from './admin/Reports';
import { AdminNotificationsPage } from './admin/Notifications';
import { AdminMessagesPage } from './admin/Messages';
import { AdminSupportPage } from './admin/Support';
import { AdminSettingsPage } from './admin/Settings';
import { AdminUsersPage } from './admin/AdminUsers';
import { ShipperPortal } from './ShipperPortal';
import { DriverPortal } from './DriverPortal';
import { DispatchOrders } from './DispatchOrders';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual' | 'triple';
type AdminSection = 'dashboard' | 'deliveries' | 'dispatch-orders' | 'drivers' | 'customers' | 'tracking' | 'payments' | 'reports' | 'notifications' | 'messages' | 'support' | 'settings' | 'admin-users' | 'shipper-portal' | 'driver-portal';

const NAV_ITEMS: { id: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deliveries', label: 'Deliveries', icon: Package },
  { id: 'dispatch-orders', label: 'Dispatch Orders', icon: Truck },
  { id: 'drivers', label: 'Drivers', icon: Truck },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'tracking', label: 'Live Tracking', icon: MapPin },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'admin-users', label: 'Admin Users', icon: UserCog },
  { id: 'shipper-portal', label: 'Shipper Portal', icon: Gavel },
  { id: 'driver-portal', label: 'Driver Portal', icon: Truck },
];

export function AdminLayout({ setView }: { setView: (v: View) => void }) {
  const { adminUser, profile, signOut } = useAuth();
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isShipper = !!profile?.roles?.includes('shipper');
  const isDriver = !!profile?.roles?.includes('driver');
  const hasOtherPortal = isShipper || isDriver;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800">
          <Logo size={32} showText={false} />
          <div className="leading-tight">
            <div className="font-bold text-white text-sm">Zhuri Transcare</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Admin Panel</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => { setSection(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
              </button>
            );
          })}
        </nav>

        {hasOtherPortal && (
          <div className="px-3 pb-2 border-t border-slate-800 pt-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5 px-1">Switch Portal</div>
            {isShipper && (
              <button onClick={() => setView('shipper')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                <Package className="w-4 h-4 shrink-0" /> Standalone Shipper Portal
              </button>
            )}
            {isDriver && (
              <button onClick={() => setView('driver')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                <Truck className="w-4 h-4 shrink-0" /> Standalone Driver Portal
              </button>
            )}
          </div>
        )}

        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-2 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white">
              {adminUser?.full_name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{adminUser?.full_name}</div>
              <div className="text-xs text-slate-500 capitalize">{adminUser?.role}</div>
            </div>
          </div>
          <button onClick={signOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100">
              <Menu className="w-5 h-5" />
            </button>
            <div className="font-semibold text-slate-900">Admin Panel</div>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {section === 'dashboard' && <AdminDashboardPage />}
          {section === 'deliveries' && <AdminDeliveriesPage onNavigate={(s) => setSection(s as AdminSection)} />}
          {section === 'dispatch-orders' && <DispatchOrders admin />}
          {section === 'drivers' && <AdminDriversPage />}
          {section === 'customers' && <AdminCustomersPage />}
          {section === 'tracking' && <AdminLiveTrackingPage />}
          {section === 'payments' && <AdminPaymentsPage />}
          {section === 'reports' && <AdminReportsPage />}
          {section === 'notifications' && <AdminNotificationsPage />}
          {section === 'messages' && <AdminMessagesPage />}
          {section === 'support' && <AdminSupportPage />}
          {section === 'settings' && <AdminSettingsPage />}
          {section === 'admin-users' && <AdminUsersPage />}
          {section === 'shipper-portal' && <ShipperPortal setView={setView} embedded />}
          {section === 'driver-portal' && <DriverPortal setView={setView} embedded />}
        </div>
      </div>
    </div>
  );
}
