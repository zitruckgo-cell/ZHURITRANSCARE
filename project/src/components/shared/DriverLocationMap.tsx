import { useState, useEffect } from 'react';
import { MapPin, Navigation, ExternalLink, Clock } from 'lucide-react';
import { supabase, type Profile } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';

/**
 * Shows a driver's live GPS location with an embedded map and realtime updates.
 * Subscribes to profile changes for the given driver so the location refreshes
 * automatically as the driver broadcasts new coordinates.
 */
export function DriverLocationMap({ driver }: { driver: Profile }) {
  const [profile, setProfile] = useState<Profile>(driver);

  useEffect(() => {
    setProfile(driver);
    if (!driver.latitude || !driver.longitude) return;

    const channel = supabase
      .channel(`driver-loc-${driver.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${driver.id}` },
        (payload) => setProfile(payload.new as Profile),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver]);

  const hasLocation = profile.latitude != null && profile.longitude != null;
  const lat = Number(profile.latitude);
  const lng = Number(profile.longitude);
  const delta = 0.01;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
  const googleMapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

  if (!hasLocation) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-700">Location not available</div>
          <div className="text-xs text-slate-400">
            {profile.is_online ? 'Waiting for GPS signal...' : 'Driver is not currently broadcasting location'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-slate-200">
        <iframe
          title="Driver location"
          src={mapUrl}
          className="w-full h-48"
          style={{ border: 0 }}
          loading="lazy"
        />
        <div className="absolute top-2 left-2 px-2.5 py-1.5 rounded-lg bg-white/95 shadow-md flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          Updated {profile.location_updated_at ? timeAgo(profile.location_updated_at) : 'unknown'}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <Navigation className="w-3.5 h-3.5" /> Google Maps
          </a>
          <a
            href={fullMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open
          </a>
        </div>
      </div>
      <div className="text-xs text-slate-400 font-mono">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>
    </div>
  );
}
