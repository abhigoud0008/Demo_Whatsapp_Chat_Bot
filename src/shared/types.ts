export type ComplaintStatus = 'Pending' | 'In Progress' | 'Resolved';

export type ComplaintCategory =
  | 'Water Supply'
  | 'Electricity'
  | 'Sanitation'
  | 'Roads & Infrastructure'
  | 'Billing & Account'
  | 'Service Delay'
  | 'General';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type NotificationStatus =
  | 'Not Sent'
  | 'Queued'
  | 'Sent'
  | 'Delivered'
  | 'Read'
  | 'Failed'
  | 'Not Connected';

export type ComplaintSource = 'whatsapp' | 'simulator';

export type AdminRole = 'super_admin' | 'admin' | 'reviewer';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  reviewer: 'Read-Only Reviewer',
};

export function normalizeAdminRole(value: unknown): AdminRole | null {
  if (value === 'super_admin' || value === 'Super Admin') return 'super_admin';
  if (value === 'admin' || value === 'Admin') return 'admin';
  if (value === 'reviewer' || value === 'Read-Only Reviewer') return 'reviewer';
  return null;
}

export type AdminAuditAction =
  | 'login_success'
  | 'login_failed'
  | 'login_rate_limited'
  | 'login_denied_disabled'
  | 'login_denied_unauthorized'
  | 'logout'
  | 'password_reset_requested'
  | 'mfa_enrolled'
  | 'mfa_unenrolled'
  | 'admin_created'
  | 'admin_updated'
  | 'admin_removed'
  | 'bootstrap_super_admin'
  | 'complaint_assigned'
  | 'complaint_in_progress'
  | 'complaint_resolved'
  | 'complaint_reopened';

export type ConversationStep =
  | 'IDLE'
  | 'MENU_CHOICE'
  | 'AWAITING_COMPLAINT_TEXT'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_STATUS_TICKET_ID';

export type NotificationMessageType =
  | 'acknowledgment'
  | 'status_reply'
  | 'resolution_service'
  | 'resolution_template'
  | 'menu_reply';

export type NotificationDeliveryStatus =
  | 'accepted_by_meta'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'not_connected';

export interface Complaint {
  id: string;
  ticketId: string;
  customerPhone: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assignedAdminId: string;
  assignedAdminName: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string;
  notificationStatus: NotificationStatus;
  source: ComplaintSource;
  lastCustomerMessageAt?: Date | null;
}

export interface ComplaintHistory {
  id: string;
  complaintId: string;
  ticketId: string;
  previousStatus: ComplaintStatus | 'None';
  newStatus: ComplaintStatus;
  changedBy: string;
  changedByName: string;
  timestamp: Date;
  remarks: string;
}

export interface NotificationLog {
  id: string;
  complaintId: string;
  ticketId: string;
  messageId: string;
  recipient: string;
  messageType: NotificationMessageType;
  status: NotificationDeliveryStatus;
  error: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminUser {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: AdminRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAuditLog {
  id: string;
  action: AdminAuditAction;
  actorUid: string;
  actorUsername: string;
  actorEmail: string;
  targetId: string;
  details: string;
  timestamp: Date;
}

export interface ConversationState {
  phone: string;
  currentStep: ConversationStep;
  draftComplaint: string;
  lastInteractionAt: Date;
  updatedAt: Date;
}

export type AdminSdkMode = 'service_account' | 'adc_firestore' | 'id_token_only' | 'unconfigured';

export interface IntegrationStatus {
  firebaseConnected: boolean;
  firebaseProjectId: string;
  whatsappConnected: boolean;
  webhookConfigured: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  resolutionTemplateConfigured: boolean;
  usernameLoginReady: boolean;
  adminSdkFirestoreReady: boolean;
  adminSdkMode: AdminSdkMode;
  lastWebhookEventAt: string | null;
}

export const COMPLAINT_CATEGORIES: readonly ComplaintCategory[] = [
  'Water Supply',
  'Electricity',
  'Sanitation',
  'Roads & Infrastructure',
  'Billing & Account',
  'Service Delay',
  'General',
] as const;

export const COMPLAINT_PRIORITIES: readonly ComplaintPriority[] = [
  'Low',
  'Medium',
  'High',
  'Urgent',
] as const;

export const COMPLAINT_STATUSES: readonly ComplaintStatus[] = [
  'Pending',
  'In Progress',
  'Resolved',
] as const;

export const ADMIN_ROLES: readonly AdminRole[] = [
  'super_admin',
  'admin',
  'reviewer',
] as const;

export const BLUEPRINT_LIMITS = {
  TICKET_ID_REGEX: /^GRV-[0-9]{4,8}$/,
  PHONE_REGEX: /^\+?[0-9]{7,15}$/,
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  USERNAME_REGEX: /^[a-z0-9][a-z0-9._-]{2,31}$/,
  DESCRIPTION_MIN: 5,
  DESCRIPTION_MAX: 2000,
  RESOLUTION_MIN: 5,
  RESOLUTION_MAX: 2000,
  REMARKS_MIN: 1,
  REMARKS_MAX: 2000,
  PHONE_MIN: 7,
  PHONE_MAX: 32,
  DISPLAY_NAME_MAX: 120,
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  AUDIT_DETAILS_MAX: 500,
} as const;
