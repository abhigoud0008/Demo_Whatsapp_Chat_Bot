import {
  ADMIN_ROLES,
  BLUEPRINT_LIMITS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_PRIORITIES,
  type AdminRole,
  type ComplaintCategory,
  type ComplaintPriority,
} from './types.ts';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateComplaintDraft(input: {
  customerPhone: string;
  description: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
}): ValidationResult {
  const phone = input.customerPhone.trim();
  if (!BLUEPRINT_LIMITS.PHONE_REGEX.test(phone)) {
    return { valid: false, error: 'Phone number must be 7 to 15 digits (optional leading +).' };
  }
  const desc = input.description.trim();
  if (desc.length < BLUEPRINT_LIMITS.DESCRIPTION_MIN || desc.length > BLUEPRINT_LIMITS.DESCRIPTION_MAX) {
    return {
      valid: false,
      error: `Description must be between ${BLUEPRINT_LIMITS.DESCRIPTION_MIN} and ${BLUEPRINT_LIMITS.DESCRIPTION_MAX} characters.`,
    };
  }
  if (!COMPLAINT_CATEGORIES.includes(input.category)) {
    return { valid: false, error: 'Invalid complaint category.' };
  }
  if (!COMPLAINT_PRIORITIES.includes(input.priority)) {
    return { valid: false, error: 'Invalid complaint priority.' };
  }
  return { valid: true };
}

export function validateResolutionNotes(notes: string): ValidationResult {
  const trimmed = notes.trim();
  if (trimmed.length < BLUEPRINT_LIMITS.RESOLUTION_MIN) {
    return {
      valid: false,
      error: `Resolution remarks are required (at least ${BLUEPRINT_LIMITS.RESOLUTION_MIN} characters).`,
    };
  }
  if (trimmed.length > BLUEPRINT_LIMITS.RESOLUTION_MAX) {
    return {
      valid: false,
      error: `Resolution remarks cannot exceed ${BLUEPRINT_LIMITS.RESOLUTION_MAX} characters.`,
    };
  }
  return { valid: true };
}

export function validateInternalRemarks(remarks: string): ValidationResult {
  const trimmed = remarks.trim();
  if (trimmed.length < BLUEPRINT_LIMITS.REMARKS_MIN) {
    return { valid: false, error: 'Remarks cannot be empty.' };
  }
  if (trimmed.length > BLUEPRINT_LIMITS.REMARKS_MAX) {
    return {
      valid: false,
      error: `Remarks cannot exceed ${BLUEPRINT_LIMITS.REMARKS_MAX} characters.`,
    };
  }
  return { valid: true };
}

export function validateUsername(username: string): ValidationResult {
  const normalized = username.trim().toLowerCase();
  if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        'Username must be 3 to 32 characters, start with a lowercase letter or digit, and use only lowercase letters, numbers, dots, underscores, or hyphens.',
    };
  }
  return { valid: true };
}

export function validateStrongPassword(password: string): ValidationResult {
  if (password.length < 12 || password.length > 128) {
    return { valid: false, error: 'Password must be between 12 and 128 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must include at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one digit.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: 'Password must include at least one special character.' };
  }
  return { valid: true };
}

export function validateAdminInput(input: {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: AdminRole;
}): ValidationResult {
  if (!BLUEPRINT_LIMITS.ID_REGEX.test(input.uid.trim())) {
    return { valid: false, error: 'Firebase UID must contain only letters, numbers, underscores, or hyphens.' };
  }
  const usernameCheck = validateUsername(input.username);
  if (!usernameCheck.valid) {
    return usernameCheck;
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) {
    return { valid: false, error: 'Display name must be between 1 and 120 characters.' };
  }
  if (!ADMIN_ROLES.includes(input.role)) {
    return { valid: false, error: 'Invalid admin role.' };
  }
  return { valid: true };
}
