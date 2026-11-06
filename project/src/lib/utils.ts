export const PRIORITY_CONFIG = {
  standard: { label: 'Standard', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', multiplier: 1 },
  routine: { label: 'Routine', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500', multiplier: 1 },
  urgent: { label: 'Urgent', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', multiplier: 1.5 },
  STAT: { label: 'STAT', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', multiplier: 2 },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', multiplier: 3 },
  emergency: { label: 'Emergency', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', multiplier: 3 },
} as const;

export const STATUS_CONFIG = {
  posted: { label: 'Posted', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  assigned: { label: 'Assigned', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  picked_up: { label: 'Picked Up', color: 'bg-cyan-100 text-cyan-700', dot: 'bg-cyan-500' },
  in_transit: { label: 'In Transit', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
} as const;

const FALLBACK_PRIORITY = { label: 'Unknown', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', multiplier: 1 };
const FALLBACK_STATUS = { label: 'Unknown', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

export function priorityConfig(key: string) {
  return (PRIORITY_CONFIG as Record<string, typeof FALLBACK_PRIORITY>)[key] ?? FALLBACK_PRIORITY;
}

export function statusConfig(key: string) {
  return (STATUS_CONFIG as Record<string, typeof FALLBACK_STATUS>)[key] ?? FALLBACK_STATUS;
}

export const PACKAGE_TYPES = [
  { value: 'medication', label: 'Medication' },
  { value: 'lab_specimen', label: 'Lab Specimen' },
  { value: 'medical_equipment', label: 'Medical Equipment' },
  { value: 'documents', label: 'Documents' },
  { value: 'blood_product', label: 'Blood Product' },
  { value: 'other', label: 'Other' },
];

export const TEMP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'ambient', label: 'Ambient' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'frozen', label: 'Frozen' },
];

export const VEHICLE_TYPES = ['Car', 'Van', 'Motorcycle', 'Box Truck'];

export function formatMoney(n: number | string | null | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function calculatePrice(
  distanceMiles: number | string,
  priority: keyof typeof PRIORITY_CONFIG,
  settings: { key: string; value: string }[]
): number {
  const basePerMile = parseFloat(settings.find((s) => s.key === 'base_price_per_mile')?.value || '2.50');
  const multiplierKey = `priority_multiplier_${priority.toLowerCase()}`;
  const multiplier = parseFloat(settings.find((s) => s.key === multiplierKey)?.value || '1.0');
  const miles = Math.max(Number(distanceMiles), 1);
  return Math.round(miles * basePerMile * multiplier * 100) / 100;
}

export function calculateCommission(grossAmount: number | string, settings: { key: string; value: string }[]): {
  commissionAmount: number;
  driverPayout: number;
  commissionRate: number;
} {
  const rate = parseFloat(settings.find((s) => s.key === 'commission_rate')?.value || '0.10');
  const gross = Number(grossAmount);
  const commissionAmount = Math.round(gross * rate * 100) / 100;
  const driverPayout = Math.round((gross - commissionAmount) * 100) / 100;
  return { commissionAmount, driverPayout, commissionRate: rate };
}

export const PLATFORM_FEE_RATE = 0.10;

export function driverPayout(gross: number | string | null | undefined): number {
  const g = Number(gross ?? 0);
  const commission = Math.round(g * PLATFORM_FEE_RATE * 100) / 100;
  return Math.round((g - commission) * 100) / 100;
}

export function generateBolNumber(): string {
  const date = new Date();
  const ymd = date.getFullYear().toString() + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `BOL-${ymd}-${rand}`;
}

export function generatePodNumber(): string {
  const date = new Date();
  const ymd = date.getFullYear().toString() + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `POD-${ymd}-${rand}`;
}
