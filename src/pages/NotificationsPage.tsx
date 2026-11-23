import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DeliveryStatusLabel } from '../components/StatusText';
import { useGrievanceData } from '../context/GrievanceContext';
import { maskPhone } from '../shared/whatsappSecurity';

const TYPE_LABELS: Record<string, string> = {
  acknowledgment: 'Ticket Acknowledgment',
  status_reply: 'Status Check Reply',
  resolution_service: 'Resolution (24h Service)',
  resolution_template: 'Resolution (Utility Template)',
  menu_reply: 'Bot Menu Reply',
};

export const NotificationsPage: React.FC = () => {
  const { notifications, loading } = useGrievanceData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (statusFilter !== 'All' && n.status !== statusFilter) return false;
      if (q) {
        return (
          n.ticketId.toLowerCase().includes(q) ||
          n.recipient.toLowerCase().includes(q) ||
          n.error.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [notifications, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Notification History
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Verified Meta WhatsApp Cloud API dispatch and webhook delivery status log.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/90 bg-white p-4 sm:grid-cols-12">
        <div className="relative sm:col-span-8">
          <label htmlFor="notif-search" className="sr-only">
            Search notification logs by ticket ID or phone
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="notif-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by Ticket ID, recipient, or failure reason..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-4">
          <label htmlFor="notif-status-filter" className="sr-only">
            Filter by delivery status
          </label>
          <select
            id="notif-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="All">All Delivery Statuses</option>
            <option value="accepted_by_meta">Accepted by Meta</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="read">Read</option>
            <option value="failed">Failed</option>
            <option value="not_connected">Not Connected</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading notification logs...</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-display text-base font-semibold text-slate-900">
              No notification attempts recorded
            </p>
            <p className="mt-1 text-sm text-slate-500">
              WhatsApp acknowledgments and resolution dispatch attempts appear here with exact
              Meta webhook delivery states.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-4 py-3 whitespace-nowrap">Ticket ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Message Type</th>
                  <th className="px-4 py-3 whitespace-nowrap">Recipient</th>
                  <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                  <th className="px-4 py-3 whitespace-nowrap">Delivery Status</th>
                  <th className="px-4 py-3">Failure Reason / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">
                      {log.complaintId && log.complaintId !== 'system' ? (
                        <Link
                          to={`/complaints/${log.complaintId}`}
                          className="text-teal-800 hover:underline"
                        >
                          {log.ticketId || log.complaintId}
                        </Link>
                      ) : (
                        <span className="text-slate-700">{log.ticketId || 'System'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                      {TYPE_LABELS[log.messageType] ?? log.messageType}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                      {maskPhone(log.recipient)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {log.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DeliveryStatusLabel status={log.status} />
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                      {log.error || (log.messageId ? `Meta ID: ${log.messageId}` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
