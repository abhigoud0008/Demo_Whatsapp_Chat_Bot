import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export type LegalPageKind = 'privacy' | 'terms' | 'deletion';

const CONTACT = 'abhinaygarvandula@gmail.com';

const CONTENT: Record<LegalPageKind, { title: string; summary: string; sections: { heading: string; paragraphs: string[]; bullets?: string[] }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    summary: 'How GrievanceFlow handles information provided through its WhatsApp complaint management demonstration.',
    sections: [
      { heading: 'Who operates this service', paragraphs: [
        'GrievanceFlow is a complaint-management demonstration presented under Abhinay Tech Solutions. For privacy questions, contact the operator at the email shown below.',
        'This notice describes the current text-based demonstration. Details of any future production deployment for a client should be updated to name the actual data controller and reflect that client’s practices.'
      ] },
      { heading: 'Information collected', paragraphs: [
        'When you interact with the connected WhatsApp service, it may process your WhatsApp phone number, display name if supplied by WhatsApp, the text of your complaint, message identifiers, timestamps, complaint reference number, complaint status, and communications about the resolution.',
        'Administrator accounts may use an email address, username, access role, and activity records. This demonstration is designed for text complaints; images, video and voice evidence are not part of the current text-only demo.'
      ] },
      { heading: 'Why we use information', paragraphs: [
        'Information is used to receive and track complaints, generate ticket references, show reports to authorized administrators, send progress or resolution replies, prevent duplicate webhook processing, maintain security, and troubleshoot the service.'
      ] },
      { heading: 'Service providers and data sharing', paragraphs: [
        'The application uses the Meta WhatsApp Business Platform to send and receive messages and Google Firebase / Cloud Firestore to manage complaint and administrative information. Netlify hosts the website and backend functions. These providers may process relevant data to deliver their services.',
        'Complaint details are intended to be accessible only to personnel authorized to manage the relevant complaints. We do not describe the demo as a public complaint directory.'
      ] },
      { heading: 'Retention and deletion', paragraphs: [
        'Complaint records and operational logs may be kept for as long as reasonably needed to support complaint handling, security, and applicable legal obligations. No fixed retention period is promised for this demonstration.',
        'You can request access, correction, or deletion by contacting the email below. We will review and process requests subject to identity verification, legitimate security needs and applicable law. Details of the procedure appear on the Data Deletion page.'
      ] },
      { heading: 'Security and your choices', paragraphs: [
        'The administrative interface uses authenticated access and authorization controls. No online system can guarantee absolute security; please do not send payment-card data, passwords, government ID numbers, or other highly sensitive information in a demo complaint.',
        'You can stop messaging the WhatsApp number at any time. Provider-level information may also be governed by WhatsApp, Google and Netlify privacy policies.'
      ] },
      { heading: 'Updates', paragraphs: [
        'We may revise this notice as the service changes. The current version is dated November 24, 2026. Material changes should be communicated through an updated page.'
      ] }
    ]
  },
  terms: {
    title: 'Terms of Service',
    summary: 'Conditions for using the GrievanceFlow demonstration and its complaint-management features.',
    sections: [
      { heading: 'Service scope', paragraphs: [
        'GrievanceFlow is a demonstration of a WhatsApp-based grievance reporting and administrative workflow. It supports receiving text complaints, generating references, reviewing case statuses, and sending messages when the connected platform permits.',
        'The demo is not an emergency reporting channel or a guaranteed response service.'
      ] },
      { heading: 'Acceptable use', paragraphs: [
        'Use this service only for lawful, genuine testing or complaint submission. Do not submit abusive, misleading or unlawful material, attempt to access other users’ complaints, probe the service for vulnerabilities without authorization, or upload sensitive records unnecessarily.'
      ] },
      { heading: 'Availability and messaging', paragraphs: [
        'Access depends on third-party services, including WhatsApp, Firebase and Netlify. Messages may be delayed, restricted or not delivered by third-party platform rules. Submitting a complaint does not guarantee a specific resolution or response time.'
      ] },
      { heading: 'Administrator responsibilities', paragraphs: [
        'Authorized administrators should use their own credentials, keep them confidential, access only information needed for assigned work, and handle complaints in accordance with applicable privacy and security obligations.'
      ] },
      { heading: 'Changes and limitations', paragraphs: [
        'Features may be changed, paused or removed during testing. Nothing on this page removes rights or remedies that cannot lawfully be excluded. Any live client deployment should replace these demo terms with terms suitable for the actual operator and jurisdiction.'
      ] },
      { heading: 'Contact', paragraphs: [
        'For questions regarding this demonstration, contact the email below. Last updated November 24, 2026.'
      ] }
    ]
  },
  deletion: {
    title: 'Data Deletion Instructions',
    summary: 'How to request removal of personal information associated with a GrievanceFlow complaint.',
    sections: [
      { heading: 'How to submit a request', paragraphs: [
        'Email the address below with the subject “GrievanceFlow Data Deletion Request”. Mention the complaint ID (if available), the WhatsApp phone number used for the complaint, and whether you want deletion or correction. Please do not include your password, payment details, or identity document in the initial email.'
      ] },
      { heading: 'What happens next', paragraphs: [
        'The operator will review the request, may ask for minimal information to verify that you control the relevant account or complaint, and identify records associated with the request.',
        'Where appropriate, the operator will delete or de-identify complaint records and related data within their control, or explain why certain information must be retained for a legal, security, or recordkeeping reason. A confirmation or explanation will be sent to the request email.'
      ] },
      { heading: 'Limits of deletion', paragraphs: [
        'Deleting information from GrievanceFlow does not automatically erase messages from your personal WhatsApp chat or independent records maintained by Meta, Google, Netlify, or another participant. Their own privacy and retention procedures may apply.',
        'The demonstration does not currently provide a self-service delete button. Please use the email request process described above.'
      ] },
      { heading: 'Contact', paragraphs: [
        'For questions or to follow up on a deletion request, contact the email below. Last updated November 24, 2026.'
      ] }
    ]
  }
};

export const PublicLegalPage: React.FC<{ kind: LegalPageKind }> = ({ kind }) => {
  const entry = CONTENT[kind];
  useEffect(() => {
    const previous = document.title;
    document.title = `${entry.title} | GrievanceFlow`;
    return () => { document.title = previous; };
  }, [entry.title]);

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-5">
          <Link to="/" className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></span>
            GrievanceFlow
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm font-medium text-teal-800 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Information & policies</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">{entry.title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{entry.summary}</p>
        <article className="mt-8 space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          {entry.sections.map(section => (
            <section key={section.heading}>
              <h2 className="font-display text-lg font-semibold text-slate-900">{section.heading}</h2>
              {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700">{paragraph}</p>)}
            </section>
          ))}
          <section className="rounded-xl bg-teal-50 p-5">
            <h2 className="font-display text-lg font-semibold text-slate-900">Contact the operator</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Abhinay Tech Solutions · Email: <a className="break-all font-medium text-teal-800 underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
          </section>
        </article>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-6">
        <nav aria-label="Policy navigation" className="mx-auto flex max-w-4xl flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
          <Link className="hover:text-teal-800 hover:underline" to="/privacy-policy">Privacy Policy</Link>
          <Link className="hover:text-teal-800 hover:underline" to="/terms-of-service">Terms of Service</Link>
          <Link className="hover:text-teal-800 hover:underline" to="/data-deletion">Data Deletion</Link>
        </nav>
      </footer>
    </div>
  );
};
