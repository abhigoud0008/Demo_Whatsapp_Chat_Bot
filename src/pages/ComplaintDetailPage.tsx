import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ComplaintStatusLabel, PriorityLabel } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { useGrievanceData } from '../context/GrievanceContext';
import { useToast } from '../context/ToastContext';
import {
  ADMIN_ROLE_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  type ComplaintCategory,
  type ComplaintPriority,
} from '../shared/types';
import { validateInternalRemarks, validateResolutionNotes } from '../shared/validation';
import {
  formatResolutionMessage,
  isComplaintOverdue,
  isWithinServiceWindow,
  maskPhone,
} from '../shared/whatsappSecurity';

export const ComplaintDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { adminProfile, integrationStatus } = useAuth();
  const {
    complaints,
    history,
    admins,
    canWrite,
    assignComplaint,
    updateComplaintClassification,
    markInProgress,
    resolveComplaint,
    reopenComplaint,
    addInternalNote,
  } = useGrievanceData();
  const { pushToast } = useToast();

  const complaint = complaints.find((c) => c.id === id);

  const complaintHistory = useMemo(
    () =>
      history
        .filter((h) => h.complaintId === id)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [history, id]
  );

  const [revealPhone, setRevealPhone] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Resolve confirmation dialog state
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Reopen confirmation dialog state
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  if (!complaint) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="font-display text-lg font-semibold text-slate-900">
          Complaint Not Found
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          The requested ticket record could not be located or you do not have access to it.
        </p>
        <Link
          to="/complaints"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Complaints</span>
        </Link>
      </div>
    );
  }

  const overdue = isComplaintOverdue(complaint);
  const inside24hWindow = isWithinServiceWindow(complaint.lastCustomerMessageAt);

  const handleAssignChange = async (selectedUid: string) => {
    if (!canWrite) return;
    if (!selectedUid) {
      await assignComplaint(complaint.id, '', 'Unassigned');
      return;
    }
    const targetAdmin = admins.find((a) => a.uid === selectedUid);
    if (targetAdmin) {
      await assignComplaint(complaint.id, targetAdmin.uid, targetAdmin.displayName);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateInternalRemarks(noteInput);
    if (!check.valid) {
      pushToast({ title: 'Invalid remark', description: check.error, variant: 'error' });
      return;
    }
    setSavingNote(true);
    try {
      await addInternalNote(complaint.id, noteInput);
      setNoteInput('');
    } finally {
      setSavingNote(false);
    }
  };

  const handleConfirmResolve = async () => {
    const check = validateResolutionNotes(resolutionText);
    if (!check.valid) {
      setResolveError(check.error ?? 'Resolution remarks are required.');
      return;
    }
    setResolveError(null);
    setResolving(true);
    try {
      await resolveComplaint(complaint.id, resolutionText);
      setResolveOpen(false);
      setResolutionText('');
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Unable to resolve complaint.');
    } finally {
      setResolving(false);
    }
  };

  const handleConfirmReopen = async () => {
    const check = validateInternalRemarks(reopenReason);
    if (!check.valid) {
      setReopenError(check.error ?? 'Please state a reason for reopening.');
      return;
    }
    setReopenError(null);
    setReopening(true);
    try {
      await reopenComplaint(complaint.id, reopenReason);
      setReopenOpen(false);
      setReopenReason('');
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : 'Unable to reopen complaint.');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/complaints"
            aria-label="Back to complaint list"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-xl font-bold text-slate-900">
                {complaint.ticketId}
              </h1>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <ComplaintStatusLabel status={complaint.status} />
              <span aria-hidden="true" className="text-slate-300">·</span>
              <PriorityLabel priority={complaint.priority} overdue={overdue} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Submitted {complaint.createdAt.toLocaleString()} · Source: {complaint.source}
            </p>
          </div>
        </div>

        {/* Workflow Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!canWrite && (
            <span className="text-xs font-medium text-slate-500">
              {adminProfile ? ADMIN_ROLE_LABELS[adminProfile.role] : 'Read-Only Reviewer'}
            </span>
          )}
          {canWrite && complaint.status === 'Pending' && (
            <button
              type="button"
              onClick={() => void markInProgress(complaint.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Loader2 className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              <span>Mark In Progress</span>
            </button>
          )}
          {canWrite && complaint.status !== 'Resolved' && (
            <button
              type="button"
              onClick={() => {
                setResolveError(null);
                setResolveOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mark Resolved</span>
            </button>
          )}
          {canWrite && complaint.status === 'Resolved' && (
            <button
              type="button"
              onClick={() => {
                setReopenError(null);
                setReopenOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              <span>Reopen Complaint</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Description, Resolution, Notes & History */}
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-xl border border-slate-200/90 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Customer Grievance
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {complaint.description}
            </p>
          </section>

          {complaint.status === 'Resolved' && complaint.resolutionNotes && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-emerald-950">
                  Resolution Summary
                </h2>
                {complaint.resolvedAt && (
                  <span className="font-mono text-xs text-emerald-800 tabular-nums">
                    Resolved {complaint.resolvedAt.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-emerald-900">
                {complaint.resolutionNotes}
              </p>
            </section>
          )}

          {/* Internal Remarks Composer */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Internal Notes &amp; Status History
            </h2>
            {canWrite && (
              <form onSubmit={(e) => void handleAddNote(e)} className="mt-4">
                <label htmlFor="internal-remark" className="block text-xs font-medium text-slate-600">
                  Add Internal Administrative Remark (not sent to customer)
                </label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="internal-remark"
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Record dispatch details, inspection update, or escalation note..."
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !noteInput.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{savingNote ? 'Saving...' : 'Add Note'}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="mt-5 divide-y divide-slate-100">
              {complaintHistory.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  No audit events recorded for this ticket yet.
                </p>
              ) : (
                complaintHistory.map((entry) => (
                  <div key={entry.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-900">
                        {entry.changedByName} · {entry.previousStatus} → {entry.newStatus}
                      </span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {entry.timestamp.toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{entry.remarks}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right: Metadata & Triage Controls */}
        <aside className="space-y-5 lg:col-span-4">
          <section className="rounded-xl border border-slate-200/90 bg-white p-5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Ticket Metadata &amp; Triage
            </h2>

            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Customer WhatsApp Number</dt>
                <dd className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium text-slate-900 tabular-nums">
                    {revealPhone ? complaint.customerPhone : maskPhone(complaint.customerPhone)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRevealPhone((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {revealPhone ? (
                      <>
                        <EyeOff className="h-3 w-3" aria-hidden="true" />
                        <span>Mask</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>Reveal</span>
                      </>
                    )}
                  </button>
                </dd>
              </div>

              <div>
                <label htmlFor="assign-admin" className="block text-xs font-medium text-slate-500">
                  Assigned Administrator
                </label>
                <select
                  id="assign-admin"
                  disabled={!canWrite}
                  value={complaint.assignedAdminId}
                  onChange={(e) => void handleAssignChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">Unassigned</option>
                  {admins
                    .filter((a) => a.active && a.role !== 'reviewer')
                    .map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.displayName} ({ADMIN_ROLE_LABELS[a.role]})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="detail-category" className="block text-xs font-medium text-slate-500">
                  Category
                </label>
                <select
                  id="detail-category"
                  disabled={!canWrite}
                  value={complaint.category}
                  onChange={(e) =>
                    void updateComplaintClassification(
                      complaint.id,
                      e.target.value as ComplaintCategory,
                      complaint.priority
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
                >
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="detail-priority" className="block text-xs font-medium text-slate-500">
                  Priority
                </label>
                <select
                  id="detail-priority"
                  disabled={!canWrite}
                  value={complaint.priority}
                  onChange={(e) =>
                    void updateComplaintClassification(
                      complaint.id,
                      complaint.category,
                      e.target.value as ComplaintPriority
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
                >
                  {COMPLAINT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <dt className="text-xs font-medium text-slate-500">WhatsApp Notification Status</dt>
                <dd className="mt-1 text-xs font-medium text-slate-800">
                  {complaint.notificationStatus}
                </dd>
                <p className="mt-1 text-[11px] text-slate-500">
                  {inside24hWindow
                    ? 'Within 24h customer-service window (standard text reply; no template needed).'
                    : integrationStatus.resolutionTemplateConfigured
                      ? 'Outside 24h window (will send configured Meta utility template).'
                      : 'Outside 24h window (optional utility template not configured; customer must message first to reopen 24h window).'}
                </p>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {/* Resolve Confirmation Modal */}
      <ConfirmDialog
        open={resolveOpen}
        title={`Resolve ${complaint.ticketId}`}
        description="Resolution remarks are required before closing this complaint and preparing the customer WhatsApp notification."
        confirmLabel="Confirm & Resolve"
        loading={resolving}
        onCancel={() => setResolveOpen(false)}
        onConfirm={() => void handleConfirmResolve()}
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="resolution-remarks-input" className="block text-xs font-medium text-slate-700">
              Resolution Remarks (sent to customer)
            </label>
            <textarea
              id="resolution-remarks-input"
              rows={3}
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder="e.g., Water supply restored successfully."
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
            {resolveError && (
              <p className="mt-1 text-xs text-rose-600" role="alert">
                {resolveError}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-500">
              Outgoing WhatsApp Preview (
              {inside24hWindow
                ? '24h Service Reply'
                : integrationStatus.resolutionTemplateConfigured
                  ? 'Utility Template'
                  : 'Utility Template Not Configured'}
              )
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs text-slate-700">
              {formatResolutionMessage(
                complaint.ticketId,
                resolutionText.trim() || 'Resolution remarks will appear here.'
              )}
            </pre>
          </div>
        </div>
      </ConfirmDialog>

      {/* Reopen Confirmation Modal */}
      <ConfirmDialog
        open={reopenOpen}
        title={`Reopen ${complaint.ticketId}`}
        description="Reopening returns this ticket to In Progress and records an immutable audit history entry."
        confirmLabel="Confirm Reopen"
        confirmVariant="danger"
        loading={reopening}
        onCancel={() => setReopenOpen(false)}
        onConfirm={() => void handleConfirmReopen()}
      >
        <div>
          <label htmlFor="reopen-reason-input" className="block text-xs font-medium text-slate-700">
            Reason for Reopening
          </label>
          <textarea
            id="reopen-reason-input"
            rows={2}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="e.g., Customer reported issue recurred after repair."
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
          {reopenError && (
            <p className="mt-1 text-xs text-rose-600" role="alert">
              {reopenError}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
};
