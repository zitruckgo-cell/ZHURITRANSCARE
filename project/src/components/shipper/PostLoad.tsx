import { useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, Snowflake, Calendar, Clock, DollarSign, Weight, Plus, Trash2, MapPin, GripVertical } from 'lucide-react';
import { supabase, type Delivery, type AppSetting, type DeliveryStop } from '../../lib/supabase';
import { priorityConfig, PACKAGE_TYPES, TEMP_OPTIONS, formatMoney, calculatePrice, generateBolNumber } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

export function PostLoad({ settings, onCreated }: { settings: AppSetting[]; onCreated: () => void }) {
  const { user, profile } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bolNumber, setBolNumber] = useState('');
  const [intermediateStops, setIntermediateStops] = useState<Array<{
    name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string; notes: string;
  }>>([]);

  const [form, setForm] = useState({
    pickup_name: '', pickup_address: '', pickup_city: '', pickup_state: '', pickup_zip: '', pickup_contact: '',
    delivery_name: '', delivery_address: '', delivery_city: '', delivery_state: '', delivery_zip: '', delivery_contact: '',
    package_type: 'medication', package_description: '', priority: 'standard' as Delivery['priority'],
    temperature_control: 'none' as Delivery['temperature_control'], weight_lbs: 1, distance_miles: 10,
    auto_assigned: true,
    pickup_datetime: '', delivery_deadline: '', offered_rate: 0, special_requirements: '', is_urgent: false,
    document_urls: [] as string[],
  });

  const update = (key: string, value: string | number | boolean | string[]) => setForm((p) => ({ ...p, [key]: value }));
  const calculatedPrice = calculatePrice(form.distance_miles, form.priority, settings);
  const finalPrice = Number(form.offered_rate) > 0 ? Number(form.offered_rate) : calculatedPrice;

  const addStop = () => setIntermediateStops((p) => [...p, { name: '', address: '', city: '', state: '', zip: '', contact: '', scheduled_at: '', notes: '' }]);
  const removeStop = (idx: number) => setIntermediateStops((p) => p.filter((_, i) => i !== idx));
  const updateStop = (idx: number, key: string, value: string) => setIntermediateStops((p) => p.map((s, i) => i === idx ? { ...s, [key]: value } : s));

  const handleSubmit = async () => {
    setSubmitting(true);
    const bol = generateBolNumber();
    setBolNumber(bol);
    const { data: deliveryData, error } = await supabase.from('deliveries').insert({
      pickup_name: form.pickup_name, pickup_address: form.pickup_address, pickup_city: form.pickup_city,
      pickup_state: form.pickup_state, pickup_zip: form.pickup_zip, pickup_contact: form.pickup_contact,
      delivery_name: form.delivery_name, delivery_address: form.delivery_address, delivery_city: form.delivery_city,
      delivery_state: form.delivery_state, delivery_zip: form.delivery_zip, delivery_contact: form.delivery_contact,
      package_type: form.package_type, package_description: form.package_description || null,
      priority: form.priority, temperature_control: form.temperature_control,
      weight_lbs: Number(form.weight_lbs), distance_miles: Number(form.distance_miles),
      max_bid_amount: finalPrice, calculated_price: calculatedPrice,
      status: 'posted', shipper_id: user?.id, auto_assigned: form.auto_assigned,
      pickup_datetime: form.pickup_datetime || null, delivery_deadline: form.delivery_deadline || null,
      offered_rate: Number(form.offered_rate) || null, special_requirements: form.special_requirements || null,
      shipper_instructions: profile?.special_instructions || null,
      is_urgent: form.is_urgent, document_urls: form.document_urls,
      bol_number: bol,
    }).select().single();
    if (error) { setSubmitting(false); alert('Failed: ' + error.message); return; }

    if (deliveryData && intermediateStops.length > 0) {
      const stopsToInsert = [] as Array<{ delivery_id: string; stop_number: number; stop_type: string; name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string | null; notes: string | null }>;
      // Stop 1 = pickup, last = delivery, middle = intermediate
      stopsToInsert.push({
        delivery_id: deliveryData.id, stop_number: 1, stop_type: 'pickup',
        name: form.pickup_name, address: form.pickup_address, city: form.pickup_city,
        state: form.pickup_state, zip: form.pickup_zip, contact: form.pickup_contact,
        scheduled_at: form.pickup_datetime || null, notes: null,
      });
      intermediateStops.forEach((s, i) => {
        if (s.name && s.address && s.city) {
          stopsToInsert.push({
            delivery_id: deliveryData.id, stop_number: i + 2, stop_type: 'intermediate',
            name: s.name, address: s.address, city: s.city, state: s.state, zip: s.zip,
            contact: s.contact, scheduled_at: s.scheduled_at || null, notes: s.notes || null,
          });
        }
      });
      const lastStop = stopsToInsert.length + 1;
      stopsToInsert.push({
        delivery_id: deliveryData.id, stop_number: lastStop, stop_type: 'delivery',
        name: form.delivery_name, address: form.delivery_address, city: form.delivery_city,
        state: form.delivery_state, zip: form.delivery_zip, contact: form.delivery_contact,
        scheduled_at: form.delivery_deadline || null, notes: null,
      });
      await supabase.from('delivery_stops').insert(stopsToInsert);
    }

    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => onCreated(), 1500);
  };

  if (success) {
    return (
      <div className="card p-10 text-center max-w-2xl mx-auto animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Load Posted!</h2>
        <p className="text-slate-600">Your load is now live and accepting bids.</p>
        <p className="text-sm text-slate-500 mt-2">Offered rate: <span className="font-semibold text-slate-700">{formatMoney(finalPrice)}</span></p>
        <p className="text-sm text-slate-500 mt-1">BOL Number: <span className="font-mono font-semibold text-slate-700">{bolNumber}</span></p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Post a Load</h1>
      <p className="text-slate-500 mb-6">Enter your delivery details to get bids from drivers</p>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            <div className={`text-sm font-medium hidden sm:block ${step >= s ? 'text-slate-900' : 'text-slate-400'}`}>
              {s === 1 ? 'Pickup' : s === 2 ? 'Stops & Drop-off' : s === 3 ? 'Package' : 'Schedule & Rate'}
            </div>
            {s < 4 && <div className={`flex-1 h-0.5 rounded ${step > s ? 'bg-primary-600' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold text-slate-900">Pickup Location</h2>
            <div><label className="label">Facility / Pharmacy Name</label><input className="input" value={form.pickup_name} onChange={(e) => update('pickup_name', e.target.value)} placeholder="e.g. MedFirst Pharmacy" /></div>
            <div><label className="label">Street Address</label><input className="input" value={form.pickup_address} onChange={(e) => update('pickup_address', e.target.value)} placeholder="1234 Peachtree St NE" /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><label className="label">City</label><input className="input" value={form.pickup_city} onChange={(e) => update('pickup_city', e.target.value)} placeholder="Atlanta" /></div>
              <div><label className="label">State</label><input className="input" value={form.pickup_state} onChange={(e) => update('pickup_state', e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" /></div>
              <div><label className="label">ZIP</label><input className="input" value={form.pickup_zip} onChange={(e) => update('pickup_zip', e.target.value)} placeholder="30309" /></div>
            </div>
            <div><label className="label">Contact Phone</label><input className="input" value={form.pickup_contact} onChange={(e) => update('pickup_contact', e.target.value)} placeholder="(404) 555-0101" /></div>
            <div className="flex justify-end pt-2"><button onClick={() => setStep(2)} disabled={!form.pickup_name || !form.pickup_address || !form.pickup_city} className="btn-primary">Continue <ArrowRight className="w-4 h-4" /></button></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            {/* Intermediate Stops Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Intermediate Stops</h2>
                  <p className="text-sm text-slate-500">Add stops between pickup and final delivery (optional)</p>
                </div>
              </div>
              {intermediateStops.length === 0 ? (
                <button onClick={addStop} className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 text-slate-400 hover:border-primary-300 hover:text-primary-600 transition-all flex flex-col items-center gap-2">
                  <Plus className="w-5 h-5" />
                  <span className="text-sm font-medium">Add a stop</span>
                </button>
              ) : (
                <div className="space-y-3">
                  {intermediateStops.map((stop, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                          <MapPin className="w-3.5 h-3.5 text-primary-500" />
                          Stop {idx + 1}
                        </div>
                        <button onClick={() => removeStop(idx)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div><label className="label">Stop Name / Facility</label><input className="input" value={stop.name} onChange={(e) => updateStop(idx, 'name', e.target.value)} placeholder="e.g. Clinic - Lab Pickup" /></div>
                      <div><label className="label">Street Address</label><input className="input" value={stop.address} onChange={(e) => updateStop(idx, 'address', e.target.value)} placeholder="789 Medical Center Dr" /></div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div><label className="label">City</label><input className="input" value={stop.city} onChange={(e) => updateStop(idx, 'city', e.target.value)} placeholder="Smyrna" /></div>
                        <div><label className="label">State</label><input className="input" value={stop.state} onChange={(e) => updateStop(idx, 'state', e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" /></div>
                        <div><label className="label">ZIP</label><input className="input" value={stop.zip} onChange={(e) => updateStop(idx, 'zip', e.target.value)} placeholder="30080" /></div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className="label">Contact Phone</label><input className="input" value={stop.contact} onChange={(e) => updateStop(idx, 'contact', e.target.value)} placeholder="(404) 555-0200" /></div>
                        <div><label className="label">Scheduled Time (optional)</label><input type="datetime-local" className="input" value={stop.scheduled_at} onChange={(e) => updateStop(idx, 'scheduled_at', e.target.value)} /></div>
                      </div>
                      <div><label className="label">Notes (optional)</label><input className="input" value={stop.notes} onChange={(e) => updateStop(idx, 'notes', e.target.value)} placeholder="e.g. Pick up lab samples only" /></div>
                    </div>
                  ))}
                  <button onClick={addStop} className="w-full border-2 border-dashed border-slate-200 rounded-xl py-3 text-slate-400 hover:border-primary-300 hover:text-primary-600 transition-all flex items-center justify-center gap-2 text-sm font-medium">
                    <Plus className="w-4 h-4" /> Add another stop
                  </button>
                </div>
              )}
            </div>

            {/* Final Delivery Location */}
            <div className="border-t border-slate-200 pt-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Final Delivery Location</h2>
              <div><label className="label">Recipient Name / Facility</label><input className="input" value={form.delivery_name} onChange={(e) => update('delivery_name', e.target.value)} placeholder="e.g. Patient - J. Anderson" /></div>
              <div><label className="label">Street Address</label><input className="input" value={form.delivery_address} onChange={(e) => update('delivery_address', e.target.value)} placeholder="555 Lenox Rd NE Apt 12B" /></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label className="label">City</label><input className="input" value={form.delivery_city} onChange={(e) => update('delivery_city', e.target.value)} placeholder="Atlanta" /></div>
                <div><label className="label">State</label><input className="input" value={form.delivery_state} onChange={(e) => update('delivery_state', e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" /></div>
                <div><label className="label">ZIP</label><input className="input" value={form.delivery_zip} onChange={(e) => update('delivery_zip', e.target.value)} placeholder="30324" /></div>
              </div>
              <div><label className="label">Contact Phone</label><input className="input" value={form.delivery_contact} onChange={(e) => update('delivery_contact', e.target.value)} placeholder="(404) 555-0301" /></div>
            </div>
            <div className="flex justify-between pt-2"><button onClick={() => setStep(1)} className="btn-secondary"><ArrowLeft className="w-4 h-4" /> Back</button><button onClick={() => setStep(3)} disabled={!form.delivery_name || !form.delivery_address || !form.delivery_city} className="btn-primary">Continue <ArrowRight className="w-4 h-4" /></button></div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-semibold text-slate-900">Load Type & Details</h2>
            <div>
              <label className="label">Load Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PACKAGE_TYPES.map((pt) => (
                  <button key={pt.value} onClick={() => update('package_type', pt.value)} className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.package_type === pt.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{pt.label}</button>
                ))}
              </div>
            </div>
            <div><label className="label">Description (optional)</label><textarea className="input min-h-[80px] resize-none" value={form.package_description} onChange={(e) => update('package_description', e.target.value)} placeholder="e.g. Insulin prescription - requires cold chain" /></div>
            <div>
              <label className="label">Priority Level</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys({ standard: 1, urgent: 1, STAT: 1, critical: 1 }) as Delivery['priority'][]).map((p) => {
                  const cfg = priorityConfig(p);
                  return (
                    <button key={p} onClick={() => update('priority', p)} className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.priority === p ? 'border-primary-500 ring-2 ring-primary-200' : 'border-slate-200 hover:border-slate-300'} ${cfg.color}`}>{cfg.label}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label">Temperature Control</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TEMP_OPTIONS.map((t) => (
                  <button key={t.value} onClick={() => update('temperature_control', t.value)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.temperature_control === t.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{t.value !== 'none' && <Snowflake className="w-4 h-4" />} {t.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label"><Weight className="w-3.5 h-3.5 inline mr-1" />Weight (lbs)</label><input type="number" min="0.1" step="0.1" className="input" value={form.weight_lbs} onChange={(e) => update('weight_lbs', parseFloat(e.target.value) || 0)} /></div>
              <div><label className="label">Distance (miles)</label><input type="number" min="1" step="1" className="input" value={form.distance_miles} onChange={(e) => update('distance_miles', parseFloat(e.target.value) || 1)} /></div>
            </div>
            <div><label className="label">Special Requirements (optional)</label><textarea className="input min-h-[60px] resize-none" value={form.special_requirements} onChange={(e) => update('special_requirements', e.target.value)} placeholder="e.g. Signature required on delivery, handle with care" /></div>
            <div className="flex justify-between pt-2"><button onClick={() => setStep(2)} className="btn-secondary"><ArrowLeft className="w-4 h-4" /> Back</button><button onClick={() => setStep(4)} className="btn-primary">Continue <ArrowRight className="w-4 h-4" /></button></div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-lg font-semibold text-slate-900">Schedule & Rate</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label"><Calendar className="w-3.5 h-3.5 inline mr-1" />Pickup Date & Time</label><input type="datetime-local" className="input" value={form.pickup_datetime} onChange={(e) => update('pickup_datetime', e.target.value)} /></div>
              <div><label className="label"><Clock className="w-3.5 h-3.5 inline mr-1" />Delivery Deadline</label><input type="datetime-local" className="input" value={form.delivery_deadline} onChange={(e) => update('delivery_deadline', e.target.value)} /></div>
            </div>
            <div>
              <label className="label">Delivery Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => update('is_urgent', false)} className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${!form.is_urgent ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}>Standard</button>
                <button onClick={() => update('is_urgent', true)} className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.is_urgent ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}>Urgent</button>
              </div>
            </div>
            <div>
              <label className="label"><DollarSign className="w-3.5 h-3.5 inline mr-1" />Offered Rate (leave 0 for auto-calculate)</label>
              <input type="number" min="0" step="0.01" className="input" value={form.offered_rate} onChange={(e) => update('offered_rate', parseFloat(e.target.value) || 0)} placeholder="0.00" />
              <p className="text-xs text-slate-400 mt-1">System suggests {formatMoney(calculatedPrice)} based on distance and priority</p>
            </div>
            <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-primary-700">Final Rate</div>
                  <div className="text-xs text-primary-600">{priorityConfig(form.priority).label} · {form.distance_miles} miles</div>
                </div>
                <div className="text-2xl font-bold text-primary-700">{formatMoney(finalPrice)}</div>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.auto_assigned} onChange={(e) => update('auto_assigned', e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-slate-700">Auto-assign to nearest available driver</span>
            </label>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(3)} className="btn-secondary"><ArrowLeft className="w-4 h-4" /> Back</button>
              <button onClick={handleSubmit} disabled={submitting} className="btn-accent">{submitting ? 'Posting...' : 'Post Load'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
