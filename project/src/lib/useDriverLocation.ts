import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

/**
 * Broadcasts the driver's GPS coordinates to their profile row at a fixed interval
 * while they have an active delivery. Stops broadcasting when the component unmounts
 * or when `active` is false.
 */
export function useDriverLocation(driverId: string | undefined, active: boolean) {
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!driverId || !active) return;
    if (!navigator.geolocation) return;

    const sendUpdate = (lat: number, lng: number) => {
      supabase
        .from('profiles')
        .update({
          latitude: lat,
          longitude: lng,
          location_updated_at: new Date().toISOString(),
          is_online: true,
        })
        .eq('id', driverId)
        .then();
    };

    const onError = () => {
      // Silently ignore — driver may have denied location
    };

    // Send an immediate ping, then watch position
    navigator.geolocation.getCurrentPosition(
      (pos) => sendUpdate(pos.coords.latitude, pos.coords.longitude),
      onError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => sendUpdate(pos.coords.latitude, pos.coords.longitude),
      onError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Mark offline when stopping
      supabase
        .from('profiles')
        .update({ is_online: false })
        .eq('id', driverId)
        .then();
    };
  }, [driverId, active]);
}
