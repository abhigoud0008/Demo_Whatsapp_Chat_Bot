import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_WELCOME_TEXT,
  UNSUPPORTED_MEDIA_TEXT,
  formatStatusLookupReply,
  formatTicketCreatedReply,
  processChatbotTurn,
} from './chatbotEngine.ts';

test('customer greeting Hi shows main menu and sets MENU_CHOICE', () => {
  const res = processChatbotTurn({
    currentStep: 'IDLE',
    draftComplaint: '',
    messageText: 'Hi',
  });
  assert.equal(res.nextStep, 'MENU_CHOICE');
  assert.equal(res.replyText, MENU_WELCOME_TEXT);
  assert.equal(res.sideEffect.type, 'NONE');
});

test('full complaint registration flow emits CREATE_COMPLAINT with deterministic classification', () => {
  const step1 = processChatbotTurn({
    currentStep: 'MENU_CHOICE',
    draftComplaint: '',
    messageText: '1',
  });
  assert.equal(step1.nextStep, 'AWAITING_COMPLAINT_TEXT');

  const step2 = processChatbotTurn({
    currentStep: step1.nextStep,
    draftComplaint: step1.nextDraftComplaint,
    messageText: 'Water supply has not been working since morning.',
  });
  assert.equal(step2.nextStep, 'AWAITING_CONFIRMATION');
  assert.equal(step2.nextDraftComplaint, 'Water supply has not been working since morning.');
  assert.match(step2.replyText, /1\. Submit/);

  const step3 = processChatbotTurn({
    currentStep: step2.nextStep,
    draftComplaint: step2.nextDraftComplaint,
    messageText: '1',
  });
  assert.equal(step3.nextStep, 'IDLE');
  assert.equal(step3.sideEffect.type, 'CREATE_COMPLAINT');
  if (step3.sideEffect.type === 'CREATE_COMPLAINT') {
    assert.equal(step3.sideEffect.category, 'Water Supply');
    assert.equal(step3.sideEffect.priority, 'High');
    assert.equal(step3.sideEffect.description, 'Water supply has not been working since morning.');
  }

  const ack = formatTicketCreatedReply('GRV-1001');
  assert.match(ack, /Complaint ID: GRV-1001/);
  assert.match(ack, /Status: Pending/);
});

test('STATUS flow asks for ticket ID and enforces sender ownership', () => {
  const step1 = processChatbotTurn({
    currentStep: 'IDLE',
    draftComplaint: '',
    messageText: 'STATUS',
  });
  assert.equal(step1.nextStep, 'AWAITING_STATUS_TICKET_ID');
  assert.equal(step1.replyText, 'Please enter your complaint ID.');

  const step2 = processChatbotTurn({
    currentStep: step1.nextStep,
    draftComplaint: '',
    messageText: 'GRV-1001',
  });
  assert.equal(step2.nextStep, 'IDLE');
  assert.deepEqual(step2.sideEffect, { type: 'LOOKUP_STATUS', ticketId: 'GRV-1001' });

  // Owner lookup succeeds
  const ownerReply = formatStatusLookupReply('GRV-1001', '+15551234567', {
    ticketId: 'GRV-1001',
    customerPhone: '+15551234567',
    status: 'In Progress',
    resolutionNotes: '',
  });
  assert.match(ownerReply, /Current status: In Progress/);

  // Cross-customer lookup NEVER discloses complaint details
  const crossCustomerReply = formatStatusLookupReply('GRV-1001', '+15559990000', {
    ticketId: 'GRV-1001',
    customerPhone: '+15551234567',
    status: 'In Progress',
    resolutionNotes: '',
  });
  assert.doesNotMatch(crossCustomerReply, /In Progress/);
  assert.match(crossCustomerReply, /No complaint found/);
});

test('unsupported media returns Phase 1 text-only notice without resetting state', () => {
  const res = processChatbotTurn({
    currentStep: 'AWAITING_COMPLAINT_TEXT',
    draftComplaint: '',
    messageText: '',
    messageType: 'image',
  });
  assert.equal(res.nextStep, 'AWAITING_COMPLAINT_TEXT');
  assert.equal(res.replyText, UNSUPPORTED_MEDIA_TEXT);
  assert.equal(res.sideEffect.type, 'NONE');
});

test('Hi -> REPORT -> complaint description -> 1 emits CREATE_COMPLAINT', () => {
  const s1 = processChatbotTurn({ currentStep: 'IDLE', draftComplaint: '', messageText: 'Hi' });
  assert.equal(s1.nextStep, 'MENU_CHOICE');

  const s2 = processChatbotTurn({
    currentStep: s1.nextStep,
    draftComplaint: s1.nextDraftComplaint,
    messageText: 'REPORT',
  });
  assert.equal(s2.nextStep, 'AWAITING_COMPLAINT_TEXT');
  assert.match(s2.replyText, /describe your complaint/i);

  const s3 = processChatbotTurn({
    currentStep: s2.nextStep,
    draftComplaint: s2.nextDraftComplaint,
    messageText: 'Streetlight pole #9 near Sector 2 is completely out.',
  });
  assert.equal(s3.nextStep, 'AWAITING_CONFIRMATION');

  const s4 = processChatbotTurn({
    currentStep: s3.nextStep,
    draftComplaint: s3.nextDraftComplaint,
    messageText: '1',
  });
  assert.equal(s4.nextStep, 'IDLE');
  assert.equal(s4.sideEffect.type, 'CREATE_COMPLAINT');
});
