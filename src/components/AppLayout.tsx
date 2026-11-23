import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLE_LABELS } from '../shared/types';
import { HoverBorderGradient } from './aceternity/HoverBorderGradient';
import { WhatsAppSimulatorDrawer } from './WhatsAppSimulatorDrawer';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/complaints', label: 'Complaints', icon: FileText },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { adminProfile, isDemoMode, integrationStatus, logout, exitDemoMode } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const location = useLocation();

  const breadcrumbLabel = (() => {
    if (location.pathname === '/') return 'Overview Dashboard';
    if (location.pathname === '/complaints') return 'Complaint Management';
    if (location.pathname.startsWith('/complaints/')) return 'Complaint Details';
    if (location.pathname === '/notifications') return 'Notification History';
    if (location.pathname === '/settings') return 'Admin Settings';
    return 'Console';
  })();

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-5">
      <div>
        <div className="flex items-center justify-between px-2 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              GrievanceFlow
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Primary Navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50/90 text-teal-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-slate-100 pt-5 px-2">
          <p className="text-xs font-medium text-slate-500">Integration Status</p>
          <dl className="mt-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Firestore</dt>
              <dd className={integrationStatus.firebaseConnected ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                {integrationStatus.firebaseConnected ? 'Connected' : 'Offline'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">WhatsApp API</dt>
              <dd className={integrationStatus.whatsappConnected ? 'font-medium text-emerald-700' : 'text-amber-700'}>
                {integrationStatus.whatsappConnected ? 'Connected' : 'Not Connected'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="px-2">
          <p className="truncate text-sm font-medium text-slate-900">
            {adminProfile?.displayName ?? 'Administrator'}
          </p>
          <p className="truncate text-xs text-slate-500">
            {adminProfile ? ADMIN_ROLE_LABELS[adminProfile.role] : 'Reviewer'} ·{' '}
            {isDemoMode ? 'Demo Session' : 'Live Auth'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{isDemoMode ? 'Exit Demo Mode' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#FAF9F6] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarContent}</div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 border-r border-slate-200 bg-white">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">GrievanceFlow</span>
              <span className="hidden text-slate-300 sm:inline">/</span>
              <span className="truncate font-display font-semibold text-slate-900">
                {breadcrumbLabel}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <HoverBorderGradient onClick={() => setSimulatorOpen(true)}>
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">WhatsApp Simulator</span>
              <span className="sm:hidden">Simulator</span>
            </HoverBorderGradient>
          </div>
        </header>

        {isDemoMode && (
          <div
            role="region"
            aria-label="Client Demo Mode Notice"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950 sm:px-6"
          >
            <p>
              <span className="font-semibold">Client Demo Mode Active:</span> Viewing sample
              grievances in local session memory. Live WhatsApp delivery is disabled until Meta
              credentials are configured.
            </p>
            <button
              type="button"
              onClick={exitDemoMode}
              className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              Return to Sign-In
            </button>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <WhatsAppSimulatorDrawer open={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
};
