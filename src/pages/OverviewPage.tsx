import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react';
import { BentoGrid, BentoGridItem } from '../components/aceternity/BentoGrid';
import { CardSpotlight } from '../components/aceternity/CardSpotlight';
import { ComplaintStatusLabel, PriorityLabel } from '../components/StatusText';
import { useGrievanceData } from '../context/GrievanceContext';
import { COMPLAINT_CATEGORIES } from '../shared/types';
import { isComplaintOverdue, maskPhone } from '../shared/whatsappSecurity';

type DateRangeKey = 'all' | '24h' | '7d' | '30d';

export const OverviewPage: React.FC = () => {
  const { complaints, history, loading } = useGrievanceData();
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const navigate = useNavigate();

  const filteredComplaints = useMemo(() => {
    if (dateRange === 'all') return complaints;
    const now = Date.now();
    const cutoffHours = dateRange === '24h' ? 24 : dateRange === '7d' ? 24 * 7 : 24 * 30;
    const cutoffMs = now - cutoffHours * 60 * 60 * 1000;
    return complaints.filter((c) => c.createdAt.getTime() >= cutoffMs);
  }, [complaints, dateRange]);

  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let resolved = 0;
    let overdue = 0;
    for (const c of filteredComplaints) {
      if (c.status === 'Pending') pending += 1;
      else if (c.status === 'In Progress') inProgress += 1;
      else if (c.status === 'Resolved') resolved += 1;
      if (isComplaintOverdue(c)) overdue += 1;
    }
    return {
      total: filteredComplaints.length,
      pending,
      inProgress,
      resolved,
      overdue,
    };
  }, [filteredComplaints]);

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of COMPLAINT_CATEGORIES) counts.set(cat, 0);
    for (const c of filteredComplaints) {
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    }
    const maxCount = Math.max(1, ...Array.from(counts.values()));
    return Array.from(counts.entries())
      .map(([category, count]) => ({
        category,
        count,
        percent: Math.round((count / maxCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredComplaints]);

  const timeSeries = useMemo(() => {
    const days: Array<{ key: string; label: string; count: number; resolved: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      days.push({ key, label, count: 0, resolved: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const c of filteredComplaints) {
      const key = c.createdAt.toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (bucket) {
        bucket.count += 1;
        if (c.status === 'Resolved') bucket.resolved += 1;
      }
    }
    return days;
  }, [filteredComplaints]);

  const maxTimeCount = Math.max(2, ...timeSeries.map((d) => d.count));

  const kpiCards = [
    {
      label: 'Total Complaints',
      value: stats.total,
      sub: 'All tracked tickets',
      icon: FileText,
      accent: 'text-slate-700',
    },
    {
      label: 'Pending',
      value: stats.pending,
      sub: 'Awaiting triage',
      icon: Clock,
      accent: 'text-amber-700',
    },
    {
      label: 'In Progress',
      value: stats.inProgress,
      sub: 'Active investigation',
      icon: Loader2,
      accent: 'text-teal-700',
    },
    {
      label: 'Resolved',
      value: stats.resolved,
      sub: 'Closed with remarks',
      icon: CheckCircle2,
      accent: 'text-emerald-700',
    },
    {
      label: 'Overdue SLA',
      value: stats.overdue,
      sub: 'Exceeded priority window',
      icon: AlertTriangle,
      accent: stats.overdue > 0 ? 'text-rose-700' : 'text-slate-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time intake volume, resolution throughput, and SLA monitoring.
          </p>
        </div>

        <div
          role="group"
          aria-label="Filter dashboard by date range"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {(
            [
              { key: 'all', label: 'All Time' },
              { key: '24h', label: '24 Hours' },
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setDateRange(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                dateRange === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <CardSpotlight key={kpi.label}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                <Icon className={`h-4 w-4 ${kpi.accent}`} aria-hidden="true" />
              </div>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {loading ? '—' : kpi.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{kpi.sub}</p>
            </CardSpotlight>
          );
        })}
      </div>

      {/* Interactive Analytics Bento Grid */}
      <BentoGrid>
        <BentoGridItem
          className="lg:col-span-7"
          title="Complaints Over Time (Last 7 Days)"
          subtitle="Daily incoming complaint tickets vs resolved tickets"
        >
          <div className="flex h-56 flex-col justify-end pt-4">
            <div className="grid h-44 grid-cols-7 items-end gap-3 border-b border-slate-100 pb-2">
              {timeSeries.map((day) => {
                const totalHeightPct = Math.max(6, Math.round((day.count / maxTimeCount) * 100));
                const resolvedHeightPct =
                  day.count > 0 ? Math.round((day.resolved / day.count) * 100) : 0;
                const isHovered = hoveredDay === day.key;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onMouseEnter={() => setHoveredDay(day.key)}
                    onMouseLeave={() => setHoveredDay(null)}
                    onFocus={() => setHoveredDay(day.key)}
                    onBlur={() => setHoveredDay(null)}
                    aria-label={`${day.label}: ${day.count} total, ${day.resolved} resolved`}
                    className="group relative flex h-full flex-col items-center justify-end focus:outline-none"
                  >
                    {isHovered && (
                      <div className="absolute -top-9 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] text-white shadow-sm">
                        {day.count} total · {day.resolved} resolved
                      </div>
                    )}
                    <span className="mb-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
                      {day.count}
                    </span>
                    <div
                      className="relative w-full max-w-[34px] overflow-hidden rounded-t-md bg-teal-600/20 transition-all duration-200 group-hover:bg-teal-600/30"
                      style={{ height: `${totalHeightPct}%` }}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-t-sm bg-teal-700 transition-all duration-200"
                        style={{ height: `${resolvedHeightPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-3 text-center">
              {timeSeries.map((day) => (
                <span key={day.key} className="truncate text-[11px] text-slate-500">
                  {day.label}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-600/25" aria-hidden="true" />
                Incoming
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-700" aria-hidden="true" />
                Resolved
              </span>
            </div>
          </div>
        </BentoGridItem>

        <BentoGridItem
          className="lg:col-span-5"
          title="Complaint Category Statistics"
          subtitle="Click a category to filter the ticket queue"
        >
          <div className="space-y-3">
            {categoryBreakdown.map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() =>
                  navigate(`/complaints?category=${encodeURIComponent(item.category)}`)
                }
                className="group block w-full text-left"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 group-hover:text-teal-800">
                    {item.category}
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">{item.count}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-teal-700 transition-all duration-200 group-hover:bg-teal-600"
                    style={{ width: `${item.count > 0 ? Math.max(4, item.percent) : 0}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </BentoGridItem>
      </BentoGrid>

      {/* Bottom Split: Recent Complaints & Recent Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200/90 bg-white p-5 lg:col-span-7">
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Incoming Complaints
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Latest grievances received via WhatsApp or simulator
              </p>
            </div>
            <Link
              to="/complaints"
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {filteredComplaints.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No complaints recorded in this date window.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredComplaints.slice(0, 5).map((c) => {
                const overdue = isComplaintOverdue(c);
                return (
                  <Link
                    key={c.id}
                    to={`/complaints/${c.id}`}
                    className="block py-3 transition-colors hover:bg-slate-50/70"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">
                          {c.ticketId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{maskPhone(c.customerPhone)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{c.category}</span>
                      </div>
                      <ComplaintStatusLabel status={c.status} />
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-700">{c.description}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <PriorityLabel priority={c.priority} overdue={overdue} />
                      <span aria-hidden="true">·</span>
                      <span>{c.assignedAdminName}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200/90 bg-white p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Activity
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Audited status transitions and resolution remarks
              </p>
            </div>
            <Link
              to="/notifications"
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap"
            >
              <span>Delivery logs</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {history.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No administrative activity logged yet.
            </div>
          ) : (
            <div className="space-y-3.5">
              {history.slice(0, 6).map((item) => (
                <div key={item.id} className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      to={`/complaints/${item.complaintId}`}
                      className="font-mono font-semibold text-teal-800 hover:underline"
                    >
                      {item.ticketId}
                    </Link>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {item.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                      {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">
                    <span className="font-medium">{item.changedByName}</span> · {item.previousStatus} →{' '}
                    <span className="font-medium text-slate-900">{item.newStatus}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.remarks}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
