import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, ShieldCheck, X } from 'lucide-react';
import { useGrievanceData } from '../context/GrievanceContext';
import { useToast } from '../context/ToastContext';
import {
  formatStatusLookupReply,
  formatTicketCreatedReply,
  processChatbotTurn,
} from '../shared/chatbotEngine';
import type { ConversationStep } from '../shared/types';
import { normalizePhone } from '../shared/whatsappSecurity';

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot';
  text: string;
  timestamp: string;
}

interface WhatsAppSimulatorDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const WhatsAppSimulatorDrawer: React.FC<WhatsAppSimulatorDrawerProps> = ({
  open,
  onClose,
}) => {
  const { complaints, createIntakeComplaint, canWrite } = useGrievanceData();
  const { pushToast } = useToast();

  const [phoneInput, setPhoneInput] = useState('+15554829103');
  const [step, setStep] = useState<ConversationStep>('IDLE');
  const [draftComplaint, setDraftComplaint] = useState('');
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'sim-intro',
      sender: 'bot',
      text: 'WhatsApp Intake Simulator ready. Send "Hi" to begin or "STATUS" to track an existing ticket.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  if (!open) return null;

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || submitting) return;

    const normalizedPhone = normalizePhone(phoneInput);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      pushToast({
        title: 'Invalid phone number',
        description: 'Enter a 7-15 digit phone number to simulate a WhatsApp sender.',
        variant: 'error',
      });
      return;
    }

    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      { id: `c-${Date.now()}`, sender: 'customer', text: trimmed, timestamp: timeLabel },
    ]);
    setInputText('');

    const turn = processChatbotTurn({
      currentStep: step,
      draftComplaint,
      messageText: trimmed,
      messageType: 'text',
    });

    setStep(turn.nextStep);
    setDraftComplaint(turn.nextDraftComplaint);

    let botReply = turn.replyText;

    if (turn.sideEffect.type === 'CREATE_COMPLAINT') {
      if (!canWrite) {
        botReply =
          'Read-Only Reviewer accounts cannot persist new complaints. Switch to an Admin account or Demo Supervisor.';
      } else {
        setSubmitting(true);
        try {
          const created = await createIntakeComplaint({
            customerPhone: normalizedPhone,
            description: turn.sideEffect.description,
            category: turn.sideEffect.category,
            priority: turn.sideEffect.priority,
            source: 'simulator',
          });
          botReply = formatTicketCreatedReply(created.ticketId);
          pushToast({
            title: `New Ticket ${created.ticketId}`,
            description: 'Complaint created and added to the live dashboard.',
            variant: 'success',
          });
        } catch (err) {
          botReply = `Unable to register complaint: ${err instanceof Error ? err.message : 'Error'}`;
        } finally {
          setSubmitting(false);
        }
      }
    } else if (turn.sideEffect.type === 'LOOKUP_STATUS') {
      const targetTicket = turn.sideEffect.ticketId;
      const found = complaints.find((c) => c.ticketId.toUpperCase() === targetTicket.toUpperCase()) ?? null;
      botReply = formatStatusLookupReply(targetTicket, normalizedPhone, found);
    }

    setMessages((prev) => [
      ...prev,
      { id: `b-${Date.now()}-${Math.random()}`, sender: 'bot', text: botReply, timestamp: timeLabel },
    ]);
  };

  const quickReplies = [
    'Hi',
    '1',
    'Water supply has not been working since morning.',
    'STATUS',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="WhatsApp Chatbot Simulator"
    >
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                WhatsApp Intake Simulator
              </h2>
              <p className="text-xs text-slate-500">Deterministic menu bot · Text-only Phase 1</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close WhatsApp Simulator"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <label htmlFor="sim-phone" className="block text-xs font-medium text-slate-600">
            Simulated Customer WhatsApp Number
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="sim-phone"
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
              placeholder="+15554829103"
            />
            <button
              type="button"
              onClick={() => {
                setStep('IDLE');
                setDraftComplaint('');
                setMessages([
                  {
                    id: `reset-${Date.now()}`,
                    sender: 'bot',
                    text: 'Session reset. Send "Hi" to open the GrievanceFlow menu.',
                    timestamp: new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                ]);
              }}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Reset
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            <span>Status checks verify sender phone ownership automatically.</span>
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-[#FAF9F6] p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'customer' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={
                  m.sender === 'customer'
                    ? 'max-w-[82%] rounded-xl rounded-br-sm bg-teal-700 px-3.5 py-2.5 text-sm text-white'
                    : 'max-w-[85%] rounded-xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800'
                }
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                <p
                  className={`mt-1 text-right font-mono text-[10px] ${
                    m.sender === 'customer' ? 'text-teal-100' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-200 bg-white p-3.5">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {quickReplies.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => void sendMessage(qr)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-teal-600/40 hover:bg-teal-50 hover:text-teal-800"
              >
                {qr.length > 26 ? `${qr.slice(0, 24)}...` : qr}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(inputText);
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="sim-message-input" className="sr-only">
              Type a simulated WhatsApp message
            </label>
            <input
              id="sim-message-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder='Type "Hi", "1", or complaint text...'
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || !inputText.trim()}
              aria-label="Send simulated WhatsApp message"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
