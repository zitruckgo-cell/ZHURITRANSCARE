import { useState } from 'react';
import { X, Send, MessageSquare, Phone, Mail, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

type Recipient = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
};

export function SendMessageModal({
  recipient,
  onClose,
  onSent,
}: {
  recipient: Recipient;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!message.trim() || !user?.id) return;
    setSending(true);
    setError(null);

    const { error: msgError } = await supabase.from('messages').insert({
      sender_id: user.id,
      recipient_id: recipient.id,
      delivery_id: null,
      body: message.trim(),
    });

    if (msgError) {
      setError(msgError.message);
      setSending(false);
      return;
    }

    if (recipient.phone) {
      await supabase.from('notifications').insert({
        recipient_id: recipient.id,
        recipient_contact: recipient.phone,
        channel: 'sms',
        subject: `New message from Zhuri Transcare`,
        body: message.trim(),
        related_type: 'message',
        status: 'pending',
      });
    }

    setSent(true);
    setSending(false);
    if (onSent) onSent();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-w-md w-full p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100">
          <X className="w-5 h-5" />
        </button>

        {sent ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Message Sent</h3>
            <p className="text-sm text-slate-500 mb-4">
              Your message has been delivered to {recipient.full_name}.
              {recipient.phone && ' They will also receive an SMS notification.'}
            </p>
            <button onClick={onClose} className="btn-primary w-full">Close</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Send Message</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">To <span className="font-semibold text-slate-700">{recipient.full_name}</span></p>

            <div className="flex flex-wrap gap-2 mb-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">
                <Mail className="w-3.5 h-3.5" /> {recipient.email}
              </div>
              {recipient.phone && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">
                  <Phone className="w-3.5 h-3.5" />
                  <a href={`tel:${recipient.phone}`} className="hover:text-primary-600 hover:underline transition-colors">{recipient.phone}</a>
                  <a href={`sms:${recipient.phone}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium hover:bg-emerald-100 transition-colors">
                    <MessageSquare className="w-2.5 h-2.5" /> Text
                  </a>
                </div>
              )}
            </div>

            <label className="label">Message</label>
            <textarea
              className="input min-h-[120px] resize-none mb-4"
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : (<><Send className="w-4 h-4" /> Send Message</>)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
