import { supabase, type DeliveryStop } from './supabase';

export async function fetchStopsForDeliveries(deliveryIds: string[]): Promise<Record<string, DeliveryStop[]>> {
  if (deliveryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('delivery_stops')
    .select('*')
    .in('delivery_id', deliveryIds)
    .order('delivery_id', { ascending: true })
    .order('stop_number', { ascending: true });
  if (error || !data) return {};
  const map: Record<string, DeliveryStop[]> = {};
  for (const s of data as DeliveryStop[]) {
    if (!map[s.delivery_id]) map[s.delivery_id] = [];
    map[s.delivery_id].push(s);
  }
  return map;
}

export async function fetchStopsForDelivery(deliveryId: string): Promise<DeliveryStop[]> {
  const { data, error } = await supabase
    .from('delivery_stops')
    .select('*')
    .eq('delivery_id', deliveryId)
    .order('stop_number', { ascending: true });
  if (error || !data) return [];
  return data as DeliveryStop[];
}
