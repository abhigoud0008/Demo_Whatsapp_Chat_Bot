import {
  BLUEPRINT_LIMITS,
  type Complaint,
  type ComplaintCategory,
  type ComplaintPriority,
  type ConversationStep,
} from './types.ts';
import { classifyComplaint } from './whatsappSecurity.ts';

export interface ChatbotInput {
  currentStep: ConversationStep;
  draftComplaint: string;
  messageText: string;
  messageType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'unknown';
}

export type ChatbotSideEffect =
  | { type: 'NONE' }
  | {
      type: 'CREATE_COMPLAINT';
      description: string;
      category: ComplaintCategory;
      priority: ComplaintPriority;
    }
  | {
      type: 'LOOKUP_STATUS';
      ticketId: string;
    };

export interface ChatbotOutput {
  nextStep: ConversationStep;
  nextDraftComplaint: string;
  replyText: string;
  sideEffect: ChatbotSideEffect;
}

export const MENU_WELCOME_TEXT = [
  'Welcome to GrievanceFlow!',
  '',
  "We're here to help you register and track your complaints.",
  '',
  'Please choose:',
  '1. Register Complaint',
  '2. Check Complaint Status',
].join('\n');

export const UNSUPPORTED_MEDIA_TEXT =
  'Only text messages are supported in this phase. Please send your complaint or reply using text only (send "Hi" for the main menu).';

/**
 * Pure deterministic menu-based WhatsApp chatbot state machine.
 * Handles greeting, complaint registration, confirmation, cancellation,
 * status checks, and unsupported media gracefully without paid AI calls.
 */
export function processChatbotTurn(input: ChatbotInput): ChatbotOutput {
  const msgType = input.messageType ?? 'text';
  if (msgType !== 'text') {
    return {
      nextStep: input.currentStep,
      nextDraftComplaint: input.draftComplaint,
      replyText: UNSUPPORTED_MEDIA_TEXT,
      sideEffect: { type: 'NONE' },
    };
  }

  const raw = input.messageText.trim();
  const upper = raw.toUpperCase();

  // Global reset / menu triggers
  if (!raw || upper === 'HI' || upper === 'HELLO' || upper === 'MENU' || upper === 'START') {
    return {
      nextStep: 'MENU_CHOICE',
      nextDraftComplaint: '',
      replyText: MENU_WELCOME_TEXT,
      sideEffect: { type: 'NONE' },
    };
  }

  // Direct complaint registration trigger ("REPORT")
  if (upper === 'REPORT') {
    return {
      nextStep: 'AWAITING_COMPLAINT_TEXT',
      nextDraftComplaint: '',
      replyText: 'Please describe your complaint in detail.',
      sideEffect: { type: 'NONE' },
    };
  }

  // Global status shortcut
  if (upper === 'STATUS' || upper === 'TRACK') {
    return {
      nextStep: 'AWAITING_STATUS_TICKET_ID',
      nextDraftComplaint: '',
      replyText: 'Please enter your complaint ID.',
      sideEffect: { type: 'NONE' },
    };
  }

  // Direct status lookup if user types "STATUS GRV-1001"
  const inlineStatusMatch = upper.match(/^(?:STATUS|TRACK)\s+(GRV-[0-9]{4,8})$/);
  if (inlineStatusMatch) {
    return {
      nextStep: 'IDLE',
      nextDraftComplaint: '',
      replyText: '',
      sideEffect: { type: 'LOOKUP_STATUS', ticketId: inlineStatusMatch[1] },
    };
  }

  switch (input.currentStep) {
    case 'IDLE': {
      if (BLUEPRINT_LIMITS.TICKET_ID_REGEX.test(upper)) {
        return {
          nextStep: 'IDLE',
          nextDraftComplaint: '',
          replyText: '',
          sideEffect: { type: 'LOOKUP_STATUS', ticketId: upper },
        };
      }
      return {
        nextStep: 'MENU_CHOICE',
        nextDraftComplaint: '',
        replyText: MENU_WELCOME_TEXT,
        sideEffect: { type: 'NONE' },
      };
    }

    case 'MENU_CHOICE': {
      if (raw === '1' || upper === 'REGISTER' || upper === 'REGISTER COMPLAINT') {
        return {
          nextStep: 'AWAITING_COMPLAINT_TEXT',
          nextDraftComplaint: '',
          replyText: 'Please describe your complaint in detail.',
          sideEffect: { type: 'NONE' },
        };
      }
      if (raw === '2' || upper === 'CHECK' || upper === 'CHECK COMPLAINT STATUS') {
        return {
          nextStep: 'AWAITING_STATUS_TICKET_ID',
          nextDraftComplaint: '',
          replyText: 'Please enter your complaint ID.',
          sideEffect: { type: 'NONE' },
        };
      }
      return {
        nextStep: 'MENU_CHOICE',
        nextDraftComplaint: '',
        replyText: 'Invalid choice. Please reply with 1 to Register Complaint or 2 to Check Complaint Status.',
        sideEffect: { type: 'NONE' },
      };
    }

    case 'AWAITING_COMPLAINT_TEXT': {
      if (raw.length < BLUEPRINT_LIMITS.DESCRIPTION_MIN) {
        return {
          nextStep: 'AWAITING_COMPLAINT_TEXT',
          nextDraftComplaint: '',
          replyText: `Please provide at least ${BLUEPRINT_LIMITS.DESCRIPTION_MIN} characters describing your complaint.`,
          sideEffect: { type: 'NONE' },
        };
      }
      const trimmedDraft = raw.slice(0, BLUEPRINT_LIMITS.DESCRIPTION_MAX);
      return {
        nextStep: 'AWAITING_CONFIRMATION',
        nextDraftComplaint: trimmedDraft,
        replyText: [
          'Please confirm your complaint:',
          '',
          trimmedDraft,
          '',
          'Reply:',
          '1. Submit',
          '2. Cancel',
        ].join('\n'),
        sideEffect: { type: 'NONE' },
      };
    }

    case 'AWAITING_CONFIRMATION': {
      if (raw === '1' || upper === 'SUBMIT' || upper === 'YES' || upper === 'CONFIRM') {
        const draft = input.draftComplaint.trim();
        if (draft.length < BLUEPRINT_LIMITS.DESCRIPTION_MIN) {
          return {
            nextStep: 'AWAITING_COMPLAINT_TEXT',
            nextDraftComplaint: '',
            replyText: 'Your draft complaint was empty. Please describe your complaint in detail.',
            sideEffect: { type: 'NONE' },
          };
        }
        const { category, priority } = classifyComplaint(draft);
        return {
          nextStep: 'IDLE',
          nextDraftComplaint: '',
          replyText: '',
          sideEffect: {
            type: 'CREATE_COMPLAINT',
            description: draft,
            category,
            priority,
          },
        };
      }
      if (raw === '2' || upper === 'CANCEL' || upper === 'NO') {
        return {
          nextStep: 'IDLE',
          nextDraftComplaint: '',
          replyText: 'Complaint registration cancelled. Send "Hi" anytime to start again.',
          sideEffect: { type: 'NONE' },
        };
      }
      return {
        nextStep: 'AWAITING_CONFIRMATION',
        nextDraftComplaint: input.draftComplaint,
        replyText: 'Please reply 1 to Submit or 2 to Cancel.',
        sideEffect: { type: 'NONE' },
      };
    }

    case 'AWAITING_STATUS_TICKET_ID': {
      if (!BLUEPRINT_LIMITS.TICKET_ID_REGEX.test(upper)) {
        return {
          nextStep: 'AWAITING_STATUS_TICKET_ID',
          nextDraftComplaint: '',
          replyText: 'Invalid complaint ID format. Please enter an ID like GRV-1001, or reply "Hi" for the main menu.',
          sideEffect: { type: 'NONE' },
        };
      }
      return {
        nextStep: 'IDLE',
        nextDraftComplaint: '',
        replyText: '',
        sideEffect: { type: 'LOOKUP_STATUS', ticketId: upper },
      };
    }
  }
}

export function formatTicketCreatedReply(ticketId: string): string {
  return [
    'Your complaint has been registered successfully.',
    '',
    `Complaint ID: ${ticketId}`,
    'Status: Pending',
    '',
    'Our team will review your complaint.',
    '',
    'Keep your complaint ID for future reference.',
  ].join('\n');
}

/**
 * Formats a status lookup reply while strictly enforcing sender ownership.
 * Never discloses another customer's complaint details.
 */
export function formatStatusLookupReply(
  requestedTicketId: string,
  senderPhoneNormalized: string,
  complaint: Pick<Complaint, 'ticketId' | 'customerPhone' | 'status' | 'resolutionNotes'> | null
): string {
  if (!complaint || complaint.customerPhone !== senderPhoneNormalized) {
    return `No complaint found matching ${requestedTicketId} for your WhatsApp number. Please verify your complaint ID and try again.`;
  }

  if (complaint.status === 'Pending') {
    return [
      `Complaint ID: ${complaint.ticketId}`,
      'Current status: Pending',
      '',
      'Your complaint is in queue and will be assigned shortly.',
    ].join('\n');
  }

  if (complaint.status === 'In Progress') {
    return [
      `Complaint ID: ${complaint.ticketId}`,
      'Current status: In Progress',
      '',
      'Our team is working on your complaint.',
    ].join('\n');
  }

  return [
    `Complaint ID: ${complaint.ticketId}`,
    'Current status: Resolved',
    '',
    `Resolution: ${complaint.resolutionNotes}`,
  ].join('\n');
}
