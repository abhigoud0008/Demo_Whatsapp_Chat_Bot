import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareOff,
  Send,
  XCircle,
} from 'lucide-react';
import type {
  ComplaintPriority,
  ComplaintStatus,
  NotificationDeliveryStatus,
} from '../shared/types';

export const ComplaintStatusLabel: React.FC<{ status: ComplaintStatus }> = ({ status }) => {
  if (status === 'Resolved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Resolved</span>
      </span>
    );
  }
  if (status === 'In Progress') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
        <Loader2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>In Progress</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Pending</span>
    </span>
  );
};

export const PriorityLabel: React.FC<{ priority: ComplaintPriority; overdue?: boolean }> = ({
  priority,
  overdue,
}) => {
  const colorClass =
    priority === 'Urgent'
      ? 'text-rose-700 font-semibold'
      : priority === 'High'
        ? 'text-amber-700 font-medium'
        : priority === 'Medium'
          ? 'text-slate-700 font-medium'
          : 'text-slate-500';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${colorClass}`}>
      {overdue && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-label="Overdue SLA" />}
      <span>{priority}</span>
    </span>
  );
};

export const DeliveryStatusLabel: React.FC<{ status: NotificationDeliveryStatus }> = ({
  status,
}) => {
  switch (status) {
    case 'delivered':
    case 'read':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{status === 'read' ? 'Read by Customer' : 'Delivered'}</span>
        </span>
      );
    case 'sent':
    case 'accepted_by_meta':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700">
          <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{status === 'accepted_by_meta' ? 'Accepted by Meta' : 'Sent'}</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Delivery Failed</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <MessageSquareOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Not Connected</span>
        </span>
      );
  }
};
