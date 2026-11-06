import { useState } from 'react';
import { Shield, FileText, X } from 'lucide-react';

export const DISCLAIMER_TEXT = `Disclaimer of Usage

ZITRUCKGO is a marketplace platform that connects shippers who need items transported with independent drivers who provide transportation services. ZITRUCKGO does not employ, supervise, or control any shipper or driver using this platform.

1. Marketplace Role. ZITRUCKGO is solely a marketplace for equal opportunity. We provide the technology to facilitate connections between shippers and drivers. We are not a carrier, broker, freight forwarder, or logistics provider.

2. No Liability for Damages. ZITRUCKGO is not responsible for any damages, losses, delays, theft, spoilage, or harm to goods, persons, or property that may occur during transport. Shippers and drivers are solely responsible for insuring their own goods and activities.

3. Accountability Between Parties. Shippers and drivers are accountable to each other for the fulfillment, quality, and safety of every transaction. Any disputes, claims, or disagreements regarding a delivery must be resolved directly between the shipper and the driver involved.

4. No Responsibility for Conduct. ZITRUCKGO is not responsible for the attitudes, behavior, professionalism, or actions of any driver or shipper on the platform. We do not guarantee the performance, reliability, or character of any user.

5. Independent Contractors. All drivers using ZITRUCKGO are independent contractors, not employees or agents of ZITRUCKGO. All shippers are independent businesses or individuals acting on their own behalf.

6. Assumption of Risk. By using this platform, all users accept full responsibility for their interactions and transactions. ZITRUCKGO disclaims all liability arising from the use of this platform.

7. Compliance. Users are responsible for complying with all applicable laws, regulations, and licensing requirements relevant to their activities on the platform.

By creating an account and using ZITRUCKGO, you acknowledge that you have read and understood this disclaimer and agree to its terms.`;

export function DisclaimerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative card max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center"><Shield className="w-5 h-5 text-primary-600" /></div>
          <h2 className="text-lg font-bold text-slate-900">Disclaimer of Usage</h2>
        </div>
        <div className="prose prose-sm max-w-none">
          {DISCLAIMER_TEXT.split('\n\n').map((para, i) => (
            <p key={i} className={`text-sm text-slate-600 mb-3 ${i === 0 ? 'font-semibold text-slate-800' : ''}`}>{para}</p>
          ))}
        </div>
        <button onClick={onClose} className="btn-primary mt-4">I Understand</button>
      </div>
    </div>
  );
}

export function DisclaimerLink({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1 text-xs hover:underline ${className}`}>
        <FileText className="w-3 h-3" /> Disclaimer of Usage
      </button>
      <DisclaimerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DisclaimerAgreement({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <label className="flex items-start gap-2.5 cursor-pointer mt-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 shrink-0"
        />
        <span className="text-xs text-slate-500 leading-relaxed">
          I have read and agree to the{' '}
          <button type="button" onClick={() => setModalOpen(true)} className="text-primary-600 font-medium hover:underline inline-flex items-center gap-0.5">
            <FileText className="w-3 h-3" /> Disclaimer of Usage
          </button>
          . I understand ZITRUCKGO is a marketplace only and is not responsible for damages, driver/shipper conduct, or disputes between parties.
        </span>
      </label>
      <DisclaimerModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
