import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowRight, Truck, Package, CheckCircle2, X, Clock, MapPin,
  Navigation, MessageSquare, Phone, Camera, PenLine, Paperclip, ShieldCheck, RotateCcw,
} from 'lucide-react';
import {
  supabase, type Delivery, type TrackingEvent, type Payment, type DeliveryStop,
} from '../../lib/supabase';
import { fetchStopsForDelivery } from '../../lib/stops';
import {
  statusConfig, timeAgo, formatMoney, formatDate, generatePodNumber, driverPayout,
} from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';
import { AdminScopePicker } from '../AdminScopePicker';

export function ActiveDelivery() {
  const { user, isAdmin } = useAuth();
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [tracking, setTracking] = useState<Record<string, TrackingEvent[]>>({});
  const [paymentMap, setPaymentMap] = useState<Record<string, Payment | null>>({});
  const [loading, setLoading] = useState(true);
  const { toast, setToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [podModal, setPodModal] = useState<Delivery | null>(null);
  const [stops, setStops] = useState<DeliveryStop[]>([]);

  const load = useCallback(async () => {
    const driverFilter = isAdmin ? scopeDriverId : user?.id;
    let query = supabase.from('deliveries')
      .select('*, shipper:profiles!deliveries_shipper_id_fkey(*)')
      .in('status', ['assigned', 'picked_up', 'in_transit'])
      .order('created_at', { ascending: false });
    if (driverFilter) query = query.eq('driver_id', driverFilter);
    const { data } = await query;
    const dels = (data as Delivery[]) || [];
    setDeliveries(dels);
    if (dels.length > 0 && !selectedId) setSelectedId(dels[0].id);

    if (dels.length > 0) {
      const s = await fetchStopsForDelivery(dels[0].id);
      setStops(s);
    }

    const trackingMap: Record<string, TrackingEvent[]> = {};
    const payMap: Record<string, Payment | null> = {};
    await Promise.all(dels.map(async (d) => {
      const [evtRes, payRes] = await Promise.all([
        supabase.from('tracking_events').select('*').eq('delivery_id', d.id).order('created_at', { ascending: true }),
        supabase.from('payments').select('*').eq('delivery_id', d.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      trackingMap[d.id] = (evtRes.data as TrackingEvent[]) || [];
      payMap[d.id] = (payRes.data as Payment) || null;
    }));
    setTracking(trackingMap);
    setPaymentMap(payMap);
    setLoading(false);
  }, [user?.id, isAdmin, scopeDriverId, selectedId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (deliveries.length === 0) return;
    const deliveryIds = deliveries.map((d) => d.id);
    const channel = supabase.channel('driver-active-payments')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, (payload) => {
        const updated = payload.new as Payment;
        if (deliveryIds.includes(updated.delivery_id)) {
          setPaymentMap((prev) => ({ ...prev, [updated.delivery_id]: updated }));
          if (updated.status === 'paid' || updated.status === 'released') {
            setToast({ type: 'success', msg: "You're cleared to go! Head to the pickup location." });
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, (payload) => {
        const inserted = payload.new as Payment;
        if (deliveryIds.includes(inserted.delivery_id)) {
          setPaymentMap((prev) => ({ ...prev, [inserted.delivery_id]: inserted }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [deliveries]);

  const advance = async (d: Delivery, action: string) => {
    const flow: Record<string, { status: Delivery['status']; label: string }> = {
      'arrived_pickup': { status: 'assigned', label: 'Arrived at Pickup' },
      'picked_up': { status: 'picked_up', label: 'Picked Up' },
      'start_delivery': { status: 'in_transit', label: 'Start Delivery' },
      'arrived_delivery': { status: 'in_transit', label: 'Arrived at Delivery' },
      'complete': { status: 'delivered', label: 'Complete Delivery' },
    };
    const next = flow[action];
    if (!next) return;
    if (action === 'arrived_pickup' || action === 'picked_up') {
      const pay = paymentMap[d.id];
      if (!pay || (pay.status !== 'paid' && pay.status !== 'released')) {
        setToast({ type: 'error', msg: 'Please wait for confirmation before starting pickup.' });
        return;
      }
    }
    const updates: Record<string, unknown> = { status: next.status };
    if (action === 'picked_up') updates.pickup_time = new Date().toISOString();
    if (action === 'complete') updates.delivered_time = new Date().toISOString();
    await supabase.from('deliveries').update(updates).eq('id', d.id);
    await supabase.from('tracking_events').insert({
      delivery_id: d.id, status: next.label, location: `${d.delivery_city}, ${d.delivery_state}`,
      notes: `Driver action: ${next.label}`,
    });
    setToast({ type: 'success', msg: next.label });
    if (action === 'complete') {
      setPodModal(d);
    }
    load();
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  if (deliveries.length === 0) {
    return (
      <div>
        {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Active Delivery</h1>
        <p className="text-slate-500 mb-6">Track your current delivery in real-time</p>
        <div className="card p-12 text-center">
          <Navigation className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No active deliveries right now</p>
          <p className="text-xs text-slate-400 mt-1">Accept a load from Find Loads to start</p>
        </div>
      </div>
    );
  }

  const selected = deliveries.find((d) => d.id === selectedId) || deliveries[0];
  const events = tracking[selected.id] || [];
  const intermediateStops = stops.filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return');
  const sc = statusConfig(selected.status);

  const STEPS = [
    { key: 'assigned', label: 'Pickup', icon: MapPin },
    { key: 'picked_up', label: 'Picked Up', icon: Package },
    { key: 'in_transit', label: 'In Transit', icon: Truck },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  ];
  const currentStepIdx = STEPS.findIndex((s) => s.key === selected.status);

  return (
    <div>
      <Toast toast={toast} />
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Active Delivery</h1>
      <p className="text-slate-500 mb-6">Real-time tracking and delivery management</p>

      {deliveries.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {deliveries.map((d) => (
            <button key={d.id} onClick={() => setSelectedId(d.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${selectedId === d.id ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {d.pickup_name} → {d.delivery_name}
            </button>
          ))}
        </div>
      )}

      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {selected.bol_number && <span className="text-sm font-mono text-slate-400">{selected.bol_number}</span>}
            {selected.pod_number && <span className="text-sm font-mono text-emerald-600">{selected.pod_number}</span>}
            <span className={`badge ${sc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot} animate-pulse`} /> {sc.label}</span>
          </div>
          <span className="font-bold text-slate-900">{formatMoney(driverPayout(selected.calculated_price || selected.max_bid_amount))} <span className="text-xs font-normal text-slate-400">after fee</span></span>
        </div>

        <div className="flex items-center justify-between mb-6 px-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isDone = i < currentStepIdx;
            const isCurrent = i === currentStepIdx;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50' : 'bg-slate-100 text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-medium ${isDone || isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIdx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-primary-50">
            <div className="text-xs font-semibold text-primary-600 uppercase mb-2 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Pickup</div>
            <div className="font-medium text-slate-900 text-sm">{selected.pickup_name}</div>
            <div className="text-xs text-slate-600 mt-1">{selected.pickup_address}, {selected.pickup_city}, {selected.pickup_state} {selected.pickup_zip}</div>
            <div className="text-xs text-slate-500 mt-1">{selected.pickup_contact}</div>
          </div>
          {intermediateStops.map((s, i) => (
            <div key={s.id} className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-xs font-semibold text-amber-600 uppercase mb-2 flex items-center gap-1">{s.stop_type === 'return' ? <><RotateCcw className="w-3.5 h-3.5" /> Return Stop</> : <><MapPin className="w-3.5 h-3.5" /> Stop {i + 1}</>}</div>
              <div className="font-medium text-slate-900 text-sm">{s.name}</div>
              <div className="text-xs text-slate-600 mt-1">{s.address}, {s.city}, {s.state} {s.zip}</div>
              <div className="text-xs text-slate-500 mt-1">{s.contact}</div>
              {s.notes && <div className="text-xs text-slate-500 mt-1">Notes: {s.notes}</div>}
            </div>
          ))}
          <div className="p-4 rounded-xl bg-emerald-50">
            <div className="text-xs font-semibold text-emerald-600 uppercase mb-2 flex items-center gap-1"><Navigation className="w-3.5 h-3.5" /> Drop-off</div>
            <div className="font-medium text-slate-900 text-sm">{selected.delivery_name}</div>
            <div className="text-xs text-slate-600 mt-1">{selected.delivery_address}, {selected.delivery_city}, {selected.delivery_state} {selected.delivery_zip}</div>
            <div className="text-xs text-slate-500 mt-1">{selected.delivery_contact}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{selected.package_type.replace('_', ' ')}</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{selected.weight_lbs} lbs</span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 capitalize">{selected.temperature_control}</span>
          {selected.distance_miles && <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">{selected.distance_miles} mi</span>}
          {selected.special_requirements && <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700">Special: {selected.special_requirements}</span>}
          {selected.shipper_instructions && <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700">Shipper: {selected.shipper_instructions}</span>}
        </div>

        {selected.shipper && (
          <div className="flex items-center gap-2 mb-6 p-3 rounded-xl bg-slate-50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xs">{selected.shipper.full_name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900">{selected.shipper.full_name}</div>
              {selected.shipper.phone && <div className="text-xs text-slate-500">{selected.shipper.phone}</div>}
            </div>
            {selected.shipper.phone && (
              <a href={`tel:${selected.shipper.phone}`} className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-emerald-200 transition-all">
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button onClick={() => window.location.hash = '#messages'} className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 hover:bg-primary-200 transition-all">
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        )}

        {(() => {
          const pay = paymentMap[selected.id];
          const fundsReady = pay && (pay.status === 'paid' || pay.status === 'released');
          if (selected.status === 'assigned' && !fundsReady) {
            return (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-amber-800">Waiting for confirmation</div>
                  <div className="text-xs text-amber-700 mt-0.5">Please wait for confirmation before starting your pickup. You'll be notified once you're cleared to go.</div>
                </div>
              </div>
            );
          }
          if (selected.status === 'assigned' && fundsReady) {
            return (
              <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-emerald-800">You're cleared to go</div>
                  <div className="text-xs text-emerald-700 mt-0.5">Confirmation received. You can now head to the pickup location.</div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className="flex flex-wrap gap-2">
          {selected.status === 'assigned' && (
            <>
              <button onClick={() => advance(selected, 'arrived_pickup')} disabled={!paymentMap[selected.id] || (paymentMap[selected.id]?.status !== 'paid' && paymentMap[selected.id]?.status !== 'released')} className="btn-accent text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <MapPin className="w-4 h-4" /> Arrived at Pickup
              </button>
              <button onClick={() => advance(selected, 'picked_up')} disabled={!paymentMap[selected.id] || (paymentMap[selected.id]?.status !== 'paid' && paymentMap[selected.id]?.status !== 'released')} className="btn-accent text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <Package className="w-4 h-4" /> Picked Up
              </button>
            </>
          )}
          {selected.status === 'picked_up' && (
            <button onClick={() => advance(selected, 'start_delivery')} className="btn-accent text-sm">
              <Truck className="w-4 h-4" /> Start Delivery
            </button>
          )}
          {selected.status === 'in_transit' && (
            <>
              <button onClick={() => advance(selected, 'arrived_delivery')} className="btn-accent text-sm">
                <MapPin className="w-4 h-4" /> Arrived at Delivery
              </button>
              <button onClick={() => advance(selected, 'complete')} className="btn-accent text-sm">
                <CheckCircle2 className="w-4 h-4" /> Complete Delivery
              </button>
            </>
          )}
          <a href={`https://maps.google.com/?q=${encodeURIComponent(`${selected.delivery_address}, ${selected.delivery_city}, ${selected.delivery_state}`)}`}
            target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all active:scale-95">
            <Navigation className="w-4 h-4" /> Navigate
          </a>
        </div>
      </div>

      {events.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Tracking History</h3>
          <div className="space-y-3">
            {events.map((evt, i) => (
              <div key={evt.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full ${i === events.length - 1 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {i < events.length - 1 && <div className="w-0.5 h-6 bg-slate-200" />}
                </div>
                <div className="pb-2">
                  <div className="text-sm font-medium text-slate-900">{evt.status.replace(/_/g, ' ')}</div>
                  {evt.location && <div className="text-xs text-slate-500">{evt.location}</div>}
                  {evt.notes && <div className="text-xs text-slate-400">{evt.notes}</div>}
                  <div className="text-xs text-slate-400">{timeAgo(evt.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {podModal && <ProofOfDeliveryModal delivery={podModal} onClose={() => setPodModal(null)} onSubmitted={() => { setPodModal(null); setToast({ type: 'success', msg: 'Proof of delivery submitted!' }); }} />}
    </div>
  );
}

function ProofOfDeliveryModal({ delivery, onClose, onSubmitted }: { delivery: Delivery; onClose: () => void; onSubmitted: () => void }) {
  const { user } = useAuth();
  const [photoUrl, setPhotoUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsCoords(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
        () => setGpsCoords(null),
      );
    }
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('Camera access denied. You can upload a photo instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => () => stopCamera(), []);

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stopCamera();
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `pod-${delivery.id}-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadFile(file, setPhotoUrl, 'photo');
    }, 'image/jpeg', 0.85);
  };

  const uploadFile = async (file: File, setter: (url: string) => void, field: string) => {
    const fileName = `pod-${delivery.id}-${field}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
    const { data, error: upErr } = await supabase.storage.from('documents').upload(fileName, file);
    if (upErr) {
      setError('Upload failed: ' + upErr.message);
      return;
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(data.path);
    setter(urlData.publicUrl);
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void, field: string) => {
    const f = e.target.files?.[0];
    if (f) uploadFile(f, setter, field);
  };

  const getSigPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getSigPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getSigPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const endDraw = () => {
    if (drawingRef.current) {
      drawingRef.current = false;
      setHasSignature(true);
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
    setSignatureUrl('');
  };

  const saveSignature = async () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `pod-${delivery.id}-sig-${Date.now()}.png`, { type: 'image/png' });
      await uploadFile(file, setSignatureUrl, 'sig');
    }, 'image/png');
  };

  const submit = async () => {
    if (!photoUrl) {
      setError('Please capture or upload a delivery photo');
      return;
    }
    if (!signatureUrl && hasSignature) {
      await saveSignature();
    }
    if (!signatureUrl) {
      setError('Please capture a signature from the recipient');
      return;
    }
    setSubmitting(true);
    setError(null);
    const location = gpsCoords ? `GPS: ${gpsCoords}` : 'Location unavailable';
    const pod = generatePodNumber();
    const { error: err } = await supabase.from('deliveries').update({
      pod_photo_url: photoUrl || null,
      pod_signature_url: signatureUrl || null,
      pod_notes: notes || null,
      pod_submitted_at: new Date().toISOString(),
      pod_location: location,
      pod_number: pod,
    }).eq('id', delivery.id);
    setSubmitting(false);
    if (err) { setError(err.message); return; }

    if (photoUrl) {
      await supabase.from('documents').insert({
        delivery_id: delivery.id, uploader_id: user?.id,
        type: 'proof_of_delivery', name: `POD Photo - ${delivery.id.slice(0, 8)}`,
        file_url: photoUrl,
      });
    }
    if (signatureUrl) {
      await supabase.from('documents').insert({
        delivery_id: delivery.id, uploader_id: user?.id,
        type: 'proof_of_delivery', name: `POD Signature - ${delivery.id.slice(0, 8)}`,
        file_url: signatureUrl,
      });
    }
    onSubmitted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Proof of Delivery</h2>
        <p className="text-sm text-slate-500 mb-4">Capture a delivery photo and recipient signature to confirm delivery</p>
        <div className="space-y-5">
          <div>
            <label className="label"><Camera className="w-3.5 h-3.5 inline mr-1" />Delivery Photo</label>
            {photoUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200">
                <img src={photoUrl} alt="Delivery proof" className="w-full max-h-56 object-cover" />
                <button onClick={() => { setPhotoUrl(''); }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 shadow text-slate-600 hover:bg-white">
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-emerald-500 text-white text-xs font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Photo captured
                </div>
              </div>
            ) : cameraActive ? (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-slate-900">
                  <video ref={videoRef} autoPlay playsInline className="w-full max-h-56 object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
                <div className="flex gap-2">
                  <button onClick={capturePhoto} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all active:scale-95">
                    <Camera className="w-4 h-4" /> Capture Photo
                  </button>
                  <button onClick={stopCamera} className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={startCamera} className="w-full inline-flex items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all">
                  <Camera className="w-6 h-6" />
                  <span className="text-sm font-medium">Take Photo with Camera</span>
                </button>
                {cameraError && <p className="text-xs text-amber-600">{cameraError}</p>}
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="flex-1 h-px bg-slate-200" />or<span className="flex-1 h-px bg-slate-200" />
                </div>
                <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-all cursor-pointer">
                  <Paperclip className="w-4 h-4" /> Upload from File
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFileSelected(e, setPhotoUrl, 'photo')} />
                </label>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0"><PenLine className="w-3.5 h-3.5 inline mr-1" />Recipient Signature</label>
              {hasSignature && !signatureUrl && (
                <button onClick={saveSignature} className="text-xs text-emerald-600 font-semibold hover:text-emerald-700">
                  Save Signature
                </button>
              )}
              {(hasSignature || signatureUrl) && (
                <button onClick={clearSignature} className="text-xs text-slate-400 hover:text-red-500 font-medium">
                  Clear
                </button>
              )}
            </div>
            {signatureUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                <img src={signatureUrl} alt="Signature" className="w-full max-h-32 object-contain" />
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-emerald-500 text-white text-xs font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Signature saved
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-slate-200 bg-white overflow-hidden">
                <canvas
                  ref={sigCanvasRef}
                  width={500}
                  height={160}
                  className="w-full touch-none cursor-crosshair"
                  onPointerDown={startDraw}
                  onPointerMove={draw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                />
                {!hasSignature && (
                  <div className="text-center text-xs text-slate-400 py-1 border-t border-slate-100">
                    Have the recipient sign here with their finger or mouse
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">Delivery Notes</label>
            <textarea className="input min-h-[80px] resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about the delivery..." />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 text-xs text-slate-500 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {gpsCoords ? `GPS: ${gpsCoords}` : 'GPS location unavailable — timestamp will be recorded'}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={submit} disabled={submitting} className="btn-accent w-full">
            {submitting ? 'Submitting...' : 'Submit Proof of Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}
