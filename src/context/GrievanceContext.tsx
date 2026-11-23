import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import {
  INITIAL_DEMO_ADMINS,
  INITIAL_DEMO_AUDIT_LOGS,
  INITIAL_DEMO_COMPLAINTS,
  INITIAL_DEMO_HISTORY,
  INITIAL_DEMO_NOTIFICATIONS,
} from '../data/demoData';
import { OperationType, db, handleFirestoreError } from '../firebase/firebaseClient';
import {
  normalizeAdminRole,
  type AdminAuditAction,
  type AdminAuditLog,
  type AdminRole,
  type AdminUser,
  type Complaint,
  type ComplaintCategory,
  type ComplaintHistory,
  type ComplaintPriority,
  type ComplaintStatus,
  type NotificationDeliveryStatus,
  type NotificationLog,
  type NotificationStatus,
} from '../shared/types';
import {
  validateAdminInput,
  validateComplaintDraft,
  validateInternalRemarks,
  validateResolutionNotes,
  validateUsername,
} from '../shared/validation';
import { formatResolutionMessage, isWithinServiceWindow } from '../shared/whatsappSecurity';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface GrievanceContextValue {
  complaints: Complaint[];
  history: ComplaintHistory[];
  notifications: NotificationLog[];
  admins: AdminUser[];
  auditLogs: AdminAuditLog[];
  loading: boolean;
  canWrite: boolean;
  isSuperAdmin: boolean;
  createIntakeComplaint: (input: {
    customerPhone: string;
    description: string;
    category: ComplaintCategory;
    priority: ComplaintPriority;
    source: 'whatsapp' | 'simulator';
  }) => Promise<{ complaintId: string; ticketId: string }>;
  assignComplaint: (complaintId: string, adminUid: string, adminName: string) => Promise<void>;
  updateComplaintClassification: (
    complaintId: string,
    category: ComplaintCategory,
    priority: ComplaintPriority
  ) => Promise<void>;
  markInProgress: (complaintId: string, remarks?: string) => Promise<void>;
  resolveComplaint: (complaintId: string, resolutionNotes: string) => Promise<void>;
  reopenComplaint: (complaintId: string, remarks: string) => Promise<void>;
  addInternalNote: (complaintId: string, remarks: string) => Promise<void>;
  createAdminUser: (input: {
    uid: string;
    username: string;
    email: string;
    displayName: string;
    role: AdminRole;
  }) => Promise<void>;
  updateAdminUser: (
    uid: string,
    updates: { username: string; displayName: string; role: AdminRole; active: boolean }
  ) => Promise<void>;
  removeAdminUser: (uid: string) => Promise<void>;
}

const GrievanceContext = createContext<GrievanceContextValue | null>(null);

function toDate(val: unknown): Date {
  if (val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate();
  }
  if (val instanceof Date) return val;
  return new Date();
}

function toNullableDate(val: unknown): Date | null {
  if (!val) return null;
  if (typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate();
  }
  if (val instanceof Date) return val;
  return null;
}

export const GrievanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, adminProfile, isDemoMode, getIdToken } = useAuth();
  const { pushToast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [history, setHistory] = useState<ComplaintHistory[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const canWrite =
    adminProfile?.active === true &&
    (adminProfile.role === 'super_admin' || adminProfile.role === 'admin');
  const isSuperAdmin = adminProfile?.active === true && adminProfile.role === 'super_admin';

  useEffect(() => {
    if (isDemoMode) {
      setComplaints(INITIAL_DEMO_COMPLAINTS);
      setHistory(INITIAL_DEMO_HISTORY);
      setNotifications(INITIAL_DEMO_NOTIFICATIONS);
      setAdmins(INITIAL_DEMO_ADMINS);
      setAuditLogs(INITIAL_DEMO_AUDIT_LOGS);
      setLoading(false);
      return;
    }

    if (status !== 'authenticated' || !adminProfile) {
      setComplaints([]);
      setHistory([]);
      setNotifications([]);
      setAdmins([]);
      setAuditLogs([]);
      setLoading(status === 'loading');
      return;
    }

    setLoading(true);
    let initialLoaded = 0;
    const markLoaded = () => {
      initialLoaded += 1;
      if (initialLoaded >= 3) {
        setLoading(false);
      }
    };

    const unsubComplaints = onSnapshot(
      query(collection(db, 'complaints'), orderBy('createdAt', 'desc'), limit(200)),
      (snap) => {
        const list: Complaint[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ticketId: String(data.ticketId ?? ''),
            customerPhone: String(data.customerPhone ?? ''),
            description: String(data.description ?? ''),
            category: data.category as ComplaintCategory,
            priority: data.priority as ComplaintPriority,
            status: data.status as ComplaintStatus,
            assignedAdminId: String(data.assignedAdminId ?? ''),
            assignedAdminName: String(data.assignedAdminName ?? 'Unassigned'),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
            resolvedAt: toNullableDate(data.resolvedAt),
            resolutionNotes: String(data.resolutionNotes ?? ''),
            notificationStatus: (data.notificationStatus as NotificationStatus) ?? 'Not Connected',
            source: (data.source as 'whatsapp' | 'simulator') ?? 'whatsapp',
            lastCustomerMessageAt: toNullableDate(data.lastCustomerMessageAt),
          };
        });
        setComplaints(list);
        markLoaded();
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'complaints');
      }
    );

    const unsubHistory = onSnapshot(
      query(collection(db, 'complaint_history'), orderBy('timestamp', 'desc'), limit(300)),
      (snap) => {
        const list: ComplaintHistory[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            complaintId: String(data.complaintId ?? ''),
            ticketId: String(data.ticketId ?? ''),
            previousStatus: data.previousStatus as ComplaintStatus | 'None',
            newStatus: data.newStatus as ComplaintStatus,
            changedBy: String(data.changedBy ?? ''),
            changedByName: String(data.changedByName ?? ''),
            timestamp: toDate(data.timestamp),
            remarks: String(data.remarks ?? ''),
          };
        });
        setHistory(list);
        markLoaded();
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'complaint_history');
      }
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'notification_logs'), orderBy('createdAt', 'desc'), limit(200)),
      (snap) => {
        const list: NotificationLog[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            complaintId: String(data.complaintId ?? ''),
            ticketId: String(data.ticketId ?? ''),
            messageId: String(data.messageId ?? ''),
            recipient: String(data.recipient ?? ''),
            messageType: data.messageType,
            status: data.status as NotificationDeliveryStatus,
            error: String(data.error ?? ''),
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          };
        });
        setNotifications(list);
        markLoaded();
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'notification_logs');
      }
    );

    let unsubAdmins: (() => void) | undefined;
    let unsubAuditLogs: (() => void) | undefined;
    if (adminProfile.role === 'super_admin') {
      unsubAdmins = onSnapshot(
        query(collection(db, 'admins'), orderBy('createdAt', 'desc'), limit(50)),
        (snap) => {
          const list: AdminUser[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              username: String(data.username ?? ''),
              email: String(data.email ?? ''),
              displayName: String(data.displayName ?? ''),
              role: normalizeAdminRole(data.role) ?? 'reviewer',
              active: Boolean(data.active),
              createdAt: toDate(data.createdAt),
              updatedAt: toDate(data.updatedAt),
            };
          });
          setAdmins(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
      );

      unsubAuditLogs = onSnapshot(
        query(collection(db, 'admin_audit_logs'), orderBy('timestamp', 'desc'), limit(100)),
        (snap) => {
          const list: AdminAuditLog[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              action: data.action as AdminAuditAction,
              actorUid: String(data.actorUid ?? ''),
              actorUsername: String(data.actorUsername ?? ''),
              actorEmail: String(data.actorEmail ?? ''),
              targetId: String(data.targetId ?? ''),
              details: String(data.details ?? ''),
              timestamp: toDate(data.timestamp),
            };
          });
          setAuditLogs(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admin_audit_logs')
      );
    } else {
      setAdmins([adminProfile]);
      setAuditLogs([]);
    }

    return () => {
      unsubComplaints();
      unsubHistory();
      unsubNotifications();
      unsubAdmins?.();
      unsubAuditLogs?.();
    };
  }, [isDemoMode, status, adminProfile]);

  const createIntakeComplaint = useCallback(
    async (input: {
      customerPhone: string;
      description: string;
      category: ComplaintCategory;
      priority: ComplaintPriority;
      source: 'whatsapp' | 'simulator';
    }) => {
      const check = validateComplaintDraft(input);
      if (!check.valid) {
        throw new Error(check.error);
      }

      if (isDemoMode) {
        const existingMax = complaints.reduce((max, c) => {
          const num = Number(c.ticketId.replace('GRV-', ''));
          return Number.isFinite(num) && num > max ? num : max;
        }, 1000);
        const ticketId = `GRV-${existingMax + 1}`;
        const complaintId = `demo-${Date.now()}`;
        const now = new Date();

        const newComplaint: Complaint = {
          id: complaintId,
          ticketId,
          customerPhone: input.customerPhone.trim(),
          description: input.description.trim(),
          category: input.category,
          priority: input.priority,
          status: 'Pending',
          assignedAdminId: '',
          assignedAdminName: 'Unassigned',
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
          resolutionNotes: '',
          notificationStatus: 'Not Connected',
          source: input.source,
          lastCustomerMessageAt: now,
        };

        setComplaints((prev) => [newComplaint, ...prev]);
        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId,
            previousStatus: 'None',
            newStatus: 'Pending',
            changedBy: 'simulator',
            changedByName: 'WhatsApp Intake Bot',
            timestamp: now,
            remarks: 'Complaint registered via deterministic WhatsApp simulator.',
          },
          ...prev,
        ]);
        setNotifications((prev) => [
          {
            id: `notif-${Date.now()}`,
            complaintId,
            ticketId,
            messageId: '',
            recipient: input.customerPhone.trim(),
            messageType: 'acknowledgment',
            status: 'not_connected',
            error: 'Demo Mode: Meta WhatsApp Cloud API is not connected; acknowledgment rendered in simulator only.',
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ]);

        return { complaintId, ticketId };
      }

      if (!canWrite || !adminProfile) {
        throw new Error('Read-Only Reviewer accounts cannot create tickets.');
      }

      const counterRef = doc(db, 'system_counters', 'complaints');
      const complaintRef = doc(collection(db, 'complaints'));

      try {
        const ticketId = await runTransaction(db, async (tx) => {
          const counterSnap = await tx.get(counterRef);
          const nextNum = counterSnap.exists() ? Number(counterSnap.data().nextNumber) : 1001;
          const generatedId = `GRV-${nextNum}`;

          if (counterSnap.exists()) {
            tx.update(counterRef, {
              nextNumber: nextNum + 1,
              updatedAt: serverTimestamp(),
            });
          } else {
            tx.set(counterRef, {
              nextNumber: 1001,
              updatedAt: serverTimestamp(),
            });
          }

          tx.set(complaintRef, {
            ticketId: generatedId,
            customerPhone: input.customerPhone.trim(),
            description: input.description.trim(),
            category: input.category,
            priority: input.priority,
            status: 'Pending',
            assignedAdminId: '',
            assignedAdminName: 'Unassigned',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            resolvedAt: null,
            resolutionNotes: '',
            notificationStatus: 'Not Connected',
            source: input.source,
            lastCustomerMessageAt: serverTimestamp(),
          });

          return generatedId;
        });

        // Write audit history and notification log after complaint doc exists
        const batch = writeBatch(db);
        const histRef = doc(collection(db, 'complaint_history'));
        batch.set(histRef, {
          complaintId: complaintRef.id,
          ticketId,
          previousStatus: 'None',
          newStatus: 'Pending',
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks: 'Complaint created via WhatsApp simulator.',
        });

        const notifRef = doc(collection(db, 'notification_logs'));
        batch.set(notifRef, {
          complaintId: complaintRef.id,
          ticketId,
          messageId: '',
          recipient: input.customerPhone.trim(),
          messageType: 'acknowledgment',
          status: 'not_connected',
          error: 'Simulated ticket intake; live WhatsApp Cloud API reply was not sent.',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await batch.commit();
        return { complaintId: complaintRef.id, ticketId };
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'complaints');
      }
    },
    [isDemoMode, complaints, canWrite, adminProfile]
  );

  const assignComplaint = useCallback(
    async (complaintId: string, targetAdminUid: string, targetAdminName: string) => {
      const target = complaints.find((c) => c.id === complaintId);
      if (!target) return;

      if (isDemoMode) {
        const now = new Date();
        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaintId
              ? { ...c, assignedAdminId: targetAdminUid, assignedAdminName: targetAdminName, updatedAt: now }
              : c
          )
        );
        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId: target.ticketId,
            previousStatus: target.status,
            newStatus: target.status,
            changedBy: adminProfile?.uid ?? 'demo-super-admin',
            changedByName: adminProfile?.displayName ?? 'Demo Supervisor',
            timestamp: now,
            remarks: `Assigned complaint to ${targetAdminName}.`,
          },
          ...prev,
        ]);
        pushToast({ title: 'Complaint assigned', description: `${target.ticketId} assigned to ${targetAdminName}.`, variant: 'success' });
        return;
      }

      if (!canWrite || !adminProfile) throw new Error('Insufficient permissions.');

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'complaints', complaintId), {
          assignedAdminId: targetAdminUid,
          assignedAdminName: targetAdminName,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(collection(db, 'complaint_history')), {
          complaintId,
          ticketId: target.ticketId,
          previousStatus: target.status,
          newStatus: target.status,
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks: `Assigned complaint to ${targetAdminName}.`,
        });
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'complaint_assigned',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: complaintId,
          details: `Assigned ${target.ticketId} to ${targetAdminName}.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: 'Complaint assigned', description: `${target.ticketId} assigned to ${targetAdminName}.`, variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
      }
    },
    [complaints, isDemoMode, canWrite, adminProfile, pushToast]
  );

  const updateComplaintClassification = useCallback(
    async (complaintId: string, category: ComplaintCategory, priority: ComplaintPriority) => {
      if (isDemoMode) {
        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaintId ? { ...c, category, priority, updatedAt: new Date() } : c
          )
        );
        pushToast({ title: 'Classification updated', variant: 'success' });
        return;
      }
      if (!canWrite) throw new Error('Insufficient permissions.');
      try {
        await updateDoc(doc(db, 'complaints', complaintId), {
          category,
          priority,
          updatedAt: serverTimestamp(),
        });
        pushToast({ title: 'Classification updated', variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
      }
    },
    [isDemoMode, canWrite, pushToast]
  );

  const markInProgress = useCallback(
    async (complaintId: string, remarks = 'Investigation started by administrator.') => {
      const target = complaints.find((c) => c.id === complaintId);
      if (!target || !adminProfile) return;

      const assigneeId = target.assignedAdminId || adminProfile.uid;
      const assigneeName = target.assignedAdminId ? target.assignedAdminName : adminProfile.displayName;

      if (isDemoMode) {
        const now = new Date();
        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaintId
              ? {
                  ...c,
                  status: 'In Progress',
                  assignedAdminId: assigneeId,
                  assignedAdminName: assigneeName,
                  resolvedAt: null,
                  updatedAt: now,
                }
              : c
          )
        );
        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId: target.ticketId,
            previousStatus: target.status,
            newStatus: 'In Progress',
            changedBy: adminProfile.uid,
            changedByName: adminProfile.displayName,
            timestamp: now,
            remarks,
          },
          ...prev,
        ]);
        pushToast({ title: 'Marked In Progress', description: `${target.ticketId} is now in progress.`, variant: 'success' });
        return;
      }

      if (!canWrite) throw new Error('Insufficient permissions.');
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'complaints', complaintId), {
          status: 'In Progress',
          assignedAdminId: assigneeId,
          assignedAdminName: assigneeName,
          resolvedAt: null,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(collection(db, 'complaint_history')), {
          complaintId,
          ticketId: target.ticketId,
          previousStatus: target.status,
          newStatus: 'In Progress',
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks,
        });
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'complaint_in_progress',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: complaintId,
          details: `Marked ${target.ticketId} In Progress.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: 'Marked In Progress', description: `${target.ticketId} is now in progress.`, variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
      }
    },
    [complaints, adminProfile, isDemoMode, canWrite, pushToast]
  );

  const resolveComplaint = useCallback(
    async (complaintId: string, resolutionNotes: string) => {
      const check = validateResolutionNotes(resolutionNotes);
      if (!check.valid) throw new Error(check.error);

      const target = complaints.find((c) => c.id === complaintId);
      if (!target || !adminProfile) return;

      const cleanNotes = resolutionNotes.trim();
      const insideWindow = isWithinServiceWindow(target.lastCustomerMessageAt);
      const msgType = insideWindow ? 'resolution_service' : 'resolution_template';

      if (isDemoMode) {
        const now = new Date();
        // Prevent duplicate notification if already resolved with identical notes
        const alreadySent = notifications.some(
          (n) =>
            n.complaintId === complaintId &&
            (n.messageType === 'resolution_service' || n.messageType === 'resolution_template') &&
            n.status === 'delivered'
        );

        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaintId
              ? {
                  ...c,
                  status: 'Resolved',
                  resolutionNotes: cleanNotes,
                  resolvedAt: now,
                  updatedAt: now,
                  assignedAdminId: c.assignedAdminId || adminProfile.uid,
                  assignedAdminName: c.assignedAdminId ? c.assignedAdminName : adminProfile.displayName,
                  notificationStatus: 'Not Connected',
                }
              : c
          )
        );

        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId: target.ticketId,
            previousStatus: target.status,
            newStatus: 'Resolved',
            changedBy: adminProfile.uid,
            changedByName: adminProfile.displayName,
            timestamp: now,
            remarks: cleanNotes,
          },
          ...prev,
        ]);

        if (!alreadySent) {
          setNotifications((prev) => [
            {
              id: `notif-${Date.now()}`,
              complaintId,
              ticketId: target.ticketId,
              messageId: '',
              recipient: target.customerPhone,
              messageType: msgType,
              status: 'not_connected',
              error: `Demo Mode: Prepared resolution message ("${formatResolutionMessage(target.ticketId, cleanNotes).slice(0, 64)}..."). Connect Meta Cloud API to dispatch live.`,
              createdAt: now,
              updatedAt: now,
            },
            ...prev,
          ]);
        }

        pushToast({
          title: `Complaint ${target.ticketId} resolved`,
          description: 'WhatsApp API not connected in Demo Mode; notification logged as Not Connected.',
          variant: 'info',
        });
        return;
      }

      if (!canWrite) throw new Error('Insufficient permissions.');

      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'complaints', complaintId), {
          status: 'Resolved',
          resolutionNotes: cleanNotes,
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          assignedAdminId: target.assignedAdminId || adminProfile.uid,
          assignedAdminName: target.assignedAdminId ? target.assignedAdminName : adminProfile.displayName,
          notificationStatus: 'Queued',
        });

        batch.set(doc(collection(db, 'complaint_history')), {
          complaintId,
          ticketId: target.ticketId,
          previousStatus: target.status,
          newStatus: 'Resolved',
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks: cleanNotes,
        });

        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'complaint_resolved',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: complaintId,
          details: `Resolved ${target.ticketId}.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });

        await batch.commit();

        // Trigger server-side WhatsApp notification (never claiming delivery on request alone)
        const idToken = await getIdToken();
        const notifyRes = await fetch('/api/whatsapp/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            complaintId,
            ticketId: target.ticketId,
            customerPhone: target.customerPhone,
            resolutionNotes: cleanNotes,
            lastCustomerMessageAt: target.lastCustomerMessageAt?.toISOString() ?? null,
          }),
        });

        const payload = (await notifyRes.json()) as {
          ok?: boolean;
          status?: NotificationDeliveryStatus;
          messageId?: string;
          messageType?: 'resolution_service' | 'resolution_template';
          loggedServerSide?: boolean;
          error?: string;
        };

        const deliveryStatus: NotificationDeliveryStatus = payload.status ?? 'failed';
        const complaintNotifStatus: NotificationStatus =
          deliveryStatus === 'accepted_by_meta'
            ? 'Queued'
            : deliveryStatus === 'not_connected'
              ? 'Not Connected'
              : 'Failed';

        const followUpBatch = writeBatch(db);
        followUpBatch.update(doc(db, 'complaints', complaintId), {
          notificationStatus: complaintNotifStatus,
          updatedAt: serverTimestamp(),
        });
        if (!payload.loggedServerSide) {
          followUpBatch.set(doc(collection(db, 'notification_logs')), {
            complaintId,
            ticketId: target.ticketId,
            messageId: payload.messageId ?? '',
            recipient: target.customerPhone,
            messageType: payload.messageType ?? msgType,
            status: deliveryStatus,
            error: payload.error ?? '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await followUpBatch.commit();

        if (deliveryStatus === 'accepted_by_meta') {
          pushToast({
            title: `${target.ticketId} resolved`,
            description: 'Resolution notification accepted by Meta; awaiting webhook delivery confirmation.',
            variant: 'success',
          });
        } else {
          pushToast({
            title: `${target.ticketId} resolved`,
            description: payload.error || 'WhatsApp notification could not be dispatched.',
            variant: 'error',
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
      }
    },
    [complaints, adminProfile, isDemoMode, notifications, canWrite, getIdToken, pushToast]
  );

  const reopenComplaint = useCallback(
    async (complaintId: string, remarks: string) => {
      const check = validateInternalRemarks(remarks);
      if (!check.valid) throw new Error(check.error);

      const target = complaints.find((c) => c.id === complaintId);
      if (!target || !adminProfile) return;

      if (isDemoMode) {
        const now = new Date();
        setComplaints((prev) =>
          prev.map((c) =>
            c.id === complaintId ? { ...c, status: 'In Progress', resolvedAt: null, updatedAt: now } : c
          )
        );
        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId: target.ticketId,
            previousStatus: target.status,
            newStatus: 'In Progress',
            changedBy: adminProfile.uid,
            changedByName: adminProfile.displayName,
            timestamp: now,
            remarks: `Reopened: ${remarks.trim()}`,
          },
          ...prev,
        ]);
        pushToast({ title: `${target.ticketId} reopened`, variant: 'info' });
        return;
      }

      if (!canWrite) throw new Error('Insufficient permissions.');
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'complaints', complaintId), {
          status: 'In Progress',
          resolvedAt: null,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(collection(db, 'complaint_history')), {
          complaintId,
          ticketId: target.ticketId,
          previousStatus: target.status,
          newStatus: 'In Progress',
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks: `Reopened: ${remarks.trim()}`,
        });
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'complaint_reopened',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: complaintId,
          details: `Reopened ${target.ticketId}.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: `${target.ticketId} reopened`, variant: 'info' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `complaints/${complaintId}`);
      }
    },
    [complaints, adminProfile, isDemoMode, canWrite, pushToast]
  );

  const addInternalNote = useCallback(
    async (complaintId: string, remarks: string) => {
      const check = validateInternalRemarks(remarks);
      if (!check.valid) throw new Error(check.error);

      const target = complaints.find((c) => c.id === complaintId);
      if (!target || !adminProfile) return;

      if (isDemoMode) {
        const now = new Date();
        setHistory((prev) => [
          {
            id: `hist-${Date.now()}`,
            complaintId,
            ticketId: target.ticketId,
            previousStatus: target.status,
            newStatus: target.status,
            changedBy: adminProfile.uid,
            changedByName: adminProfile.displayName,
            timestamp: now,
            remarks: remarks.trim(),
          },
          ...prev,
        ]);
        pushToast({ title: 'Internal remark saved', variant: 'success' });
        return;
      }

      if (!canWrite) throw new Error('Insufficient permissions.');
      try {
        await setDoc(doc(collection(db, 'complaint_history')), {
          complaintId,
          ticketId: target.ticketId,
          previousStatus: target.status,
          newStatus: target.status,
          changedBy: adminProfile.uid,
          changedByName: adminProfile.displayName,
          timestamp: serverTimestamp(),
          remarks: remarks.trim(),
        });
        pushToast({ title: 'Internal remark saved', variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'complaint_history');
      }
    },
    [complaints, adminProfile, isDemoMode, canWrite, pushToast]
  );

  const createAdminUser = useCallback(
    async (input: {
      uid: string;
      username: string;
      email: string;
      displayName: string;
      role: AdminRole;
    }) => {
      const check = validateAdminInput(input);
      if (!check.valid) throw new Error(check.error);

      const normalizedUsername = input.username.trim().toLowerCase();
      if (admins.some((a) => a.username.toLowerCase() === normalizedUsername)) {
        throw new Error(`Username "${normalizedUsername}" is already assigned to another administrator.`);
      }

      if (isDemoMode) {
        const now = new Date();
        setAdmins((prev) => [
          {
            uid: input.uid.trim(),
            username: normalizedUsername,
            email: input.email.trim().toLowerCase(),
            displayName: input.displayName.trim(),
            role: input.role,
            active: true,
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ]);
        setAuditLogs((prev) => [
          {
            id: `audit-${Date.now()}`,
            action: 'admin_created',
            actorUid: adminProfile?.uid ?? 'demo-super-admin',
            actorUsername: adminProfile?.username ?? 'demo_supervisor',
            actorEmail: adminProfile?.email ?? '',
            targetId: input.uid.trim(),
            details: `Added ${normalizedUsername} (${input.role}).`,
            timestamp: now,
          },
          ...prev,
        ]);
        pushToast({ title: 'Administrator added (Demo)', variant: 'success' });
        return;
      }

      if (!isSuperAdmin || !adminProfile) throw new Error('Only Super Admins can manage administrators.');
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'admins', input.uid.trim()), {
          uid: input.uid.trim(),
          username: normalizedUsername,
          email: input.email.trim().toLowerCase(),
          displayName: input.displayName.trim(),
          role: input.role,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'admin_created',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: input.uid.trim(),
          details: `Authorized administrator ${normalizedUsername} (${input.role}).`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: 'Administrator added', variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `admins/${input.uid}`);
      }
    },
    [admins, adminProfile, isDemoMode, isSuperAdmin, pushToast]
  );

  const updateAdminUser = useCallback(
    async (
      uid: string,
      updates: { username: string; displayName: string; role: AdminRole; active: boolean }
    ) => {
      const usernameCheck = validateUsername(updates.username);
      if (!usernameCheck.valid) throw new Error(usernameCheck.error);
      const normalizedUsername = updates.username.trim().toLowerCase();

      if (admins.some((a) => a.uid !== uid && a.username.toLowerCase() === normalizedUsername)) {
        throw new Error(`Username "${normalizedUsername}" is already in use.`);
      }

      if (isDemoMode) {
        const now = new Date();
        setAdmins((prev) =>
          prev.map((a) =>
            a.uid === uid
              ? { ...a, ...updates, username: normalizedUsername, updatedAt: now }
              : a
          )
        );
        setAuditLogs((prev) => [
          {
            id: `audit-${Date.now()}`,
            action: 'admin_updated',
            actorUid: adminProfile?.uid ?? 'demo-super-admin',
            actorUsername: adminProfile?.username ?? 'demo_supervisor',
            actorEmail: adminProfile?.email ?? '',
            targetId: uid,
            details: `Updated ${normalizedUsername}: role=${updates.role}, active=${String(updates.active)}.`,
            timestamp: now,
          },
          ...prev,
        ]);
        pushToast({ title: 'Administrator updated (Demo)', variant: 'success' });
        return;
      }
      if (!isSuperAdmin || !adminProfile) throw new Error('Only Super Admins can manage administrators.');
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'admins', uid), {
          username: normalizedUsername,
          displayName: updates.displayName.trim(),
          role: updates.role,
          active: updates.active,
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'admin_updated',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: uid,
          details: `Updated ${normalizedUsername}: role=${updates.role}, active=${String(updates.active)}.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: 'Administrator updated', variant: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `admins/${uid}`);
      }
    },
    [admins, adminProfile, isDemoMode, isSuperAdmin, pushToast]
  );

  const removeAdminUser = useCallback(
    async (uid: string) => {
      if (adminProfile?.uid === uid) {
        throw new Error('You cannot remove your own active administrator account.');
      }
      if (isDemoMode) {
        setAdmins((prev) => prev.filter((a) => a.uid !== uid));
        pushToast({ title: 'Administrator removed (Demo)', variant: 'info' });
        return;
      }
      if (!isSuperAdmin || !adminProfile) throw new Error('Only Super Admins can remove administrators.');
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'admins', uid));
        batch.set(doc(collection(db, 'admin_audit_logs')), {
          action: 'admin_removed',
          actorUid: adminProfile.uid,
          actorUsername: adminProfile.username,
          actorEmail: adminProfile.email,
          targetId: uid,
          details: `Removed administrator access for UID ${uid}.`.slice(0, 500),
          timestamp: serverTimestamp(),
        });
        await batch.commit();
        pushToast({ title: 'Administrator removed', variant: 'info' });
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `admins/${uid}`);
      }
    },
    [adminProfile, isDemoMode, isSuperAdmin, pushToast]
  );

  return (
    <GrievanceContext.Provider
      value={{
        complaints,
        history,
        notifications,
        admins,
        auditLogs,
        loading,
        canWrite,
        isSuperAdmin,
        createIntakeComplaint,
        assignComplaint,
        updateComplaintClassification,
        markInProgress,
        resolveComplaint,
        reopenComplaint,
        addInternalNote,
        createAdminUser,
        updateAdminUser,
        removeAdminUser,
      }}
    >
      {children}
    </GrievanceContext.Provider>
  );
};

export function useGrievanceData(): GrievanceContextValue {
  const ctx = useContext(GrievanceContext);
  if (!ctx) {
    throw new Error('useGrievanceData must be used within GrievanceProvider');
  }
  return ctx;
}
