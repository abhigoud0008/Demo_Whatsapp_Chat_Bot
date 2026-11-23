import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, RotateCcw, Search } from 'lucide-react';
import { ComplaintStatusLabel, PriorityLabel } from '../components/StatusText';
import { useGrievanceData } from '../context/GrievanceContext';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from '../shared/types';
import { isComplaintOverdue, maskPhone } from '../shared/whatsappSecurity';

const PAGE_SIZE = 8;

export const ComplaintsPage: React.FC = () => {
  const { complaints, loading } = useGrievanceData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>(
    searchParams.get('category') || 'All'
  );
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [revealPhones, setRevealPhones] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const paramCat = searchParams.get('category');
    if (paramCat) setCategoryFilter(paramCat);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const cutoff =
      dateFilter === 'today'
        ? now - 24 * 60 * 60 * 1000
        : dateFilter === '7d'
          ? now - 7 * 24 * 60 * 60 * 1000
          : dateFilter === '30d'
            ? now - 30 * 24 * 60 * 60 * 1000
            : 0;

    return complaints.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      if (cutoff && c.createdAt.getTime() < cutoff) return false;
      if (q) {
        const matches =
          c.ticketId.toLowerCase().includes(q) ||
          c.customerPhone.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [complaints, searchQuery, statusFilter, categoryFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setCategoryFilter('All');
    setDateFilter('all');
    setPage(1);
    setSearchParams({});
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Complaint Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Search, triage, assign, and resolve customer complaints across all channels.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRevealPhones((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {revealPhones ? (
            <>
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mask Phone Numbers</span>
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reveal Phone Numbers</span>
            </>
          )}
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/90 bg-white p-4 md:grid-cols-12">
        <div className="relative md:col-span-5">
          <label htmlFor="complaint-search" className="sr-only">
            Search by ticket ID, phone number, or description
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="complaint-search"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search Ticket ID (GRV-1001), phone, or keywords..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            {COMPLAINT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-3">
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="All">All Categories</option>
            {COMPLAINT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="date-filter" className="sr-only">
            Filter by date
          </label>
          <select
            id="date-filter"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d');
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">Any Date</option>
            <option value="today">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
        {loading ? (
          <div className="divide-y divide-slate-100 p-4" aria-label="Loading complaints">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-3.5 animate-pulse">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="h-4 w-32 rounded bg-slate-100" />
                <div className="h-4 w-64 rounded bg-slate-100" />
                <div className="h-4 w-20 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-base font-semibold text-slate-900">
              No matching complaints found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Adjust your search terms or clear active filters to view all tickets.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Filters</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 pr-2.5 pl-4 whitespace-nowrap">Ticket ID</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Phone</th>
                  <th className="px-2.5 py-3">Description</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Category</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Priority</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Status</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Submitted</th>
                  <th className="px-2.5 py-3 whitespace-nowrap">Assignee</th>
                  <th className="py-3 pr-4 pl-2.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((c) => {
                  const overdue = isComplaintOverdue(c);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="py-3 pr-2.5 pl-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {c.ticketId}
                      </td>
                      <td className="px-2.5 py-3 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                        {revealPhones ? c.customerPhone : maskPhone(c.customerPhone)}
                      </td>
                      <td className="max-w-[185px] px-2.5 py-3 text-slate-700">
                        <p className="truncate">{c.description}</p>
                      </td>
                      <td className="px-2.5 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {c.category}
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap">
                        <PriorityLabel priority={c.priority} overdue={overdue} />
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap">
                        <ComplaintStatusLabel status={c.status} />
                      </td>
                      <td className="px-2.5 py-3 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {c.createdAt.toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit',
                        })}
                      </td>
                      <td className="max-w-[120px] truncate px-2.5 py-3 text-xs text-slate-700 whitespace-nowrap">
                        {c.assignedAdminName || 'Unassigned'}
                      </td>
                      <td className="py-3 pr-4 pl-2.5 text-right whitespace-nowrap">
                        <Link
                          to={`/complaints/${c.id}`}
                          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-600/40 hover:text-teal-800"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span className="tabular-nums">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} complaints
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45"
              >
                Previous
              </button>
              <span className="font-mono tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
