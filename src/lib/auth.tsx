import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, type Profile, type AdminUser } from './supabase';

type SignUpMetadata = {
  full_name: string;
  phone: string;
  roles: string[];
  business_name?: string;
  business_address?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
  service_area?: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  adminUser: AdminUser | null;
  loading: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ error: string | null }>;
  adminSignUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initialLoad = useRef(true);

  const loadProfile = useCallback(async (uid: string) => {
    const [adminRes, profRes] = await Promise.all([
      supabase.from('admin_users').select('*').eq('id', uid).maybeSingle(),
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    ]);

    if (adminRes.error) {
      console.error('Admin check error:', adminRes.error.message);
      setAdminUser(null);
    } else {
      setAdminUser(adminRes.data as AdminUser | null);
    }

    if (profRes.error) {
      console.error('Profile load error:', profRes.error.message);
      setProfile(null);
    } else {
      setProfile(profRes.data as Profile | null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) {
        console.error('getSession error:', error.message);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setLoading(false);
        initialLoad.current = false;
      }
    }).catch((e) => {
      console.error('getSession exception:', e);
      if (mounted) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED') {
        setSession((prev) => {
          if (prev && newSession && prev.access_token === newSession.access_token) return prev;
          return newSession;
        });
        return;
      }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setAdminUser(null);
        setLoading(false);
        initialLoad.current = false;
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSession((prev) => {
          if (prev && newSession && prev.access_token === newSession.access_token) return prev;
          return newSession;
        });
        setUser((prev) => {
          if (prev && newSession?.user && prev.id === newSession.user.id && prev.updated_at === newSession.user.updated_at) return prev;
          return newSession?.user ?? null;
        });
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      if (!initialLoad.current) setLoading(false);
      return;
    }
    let mounted = true;
    if (initialLoad.current) setLoading(true);
    loadProfile(userId).finally(() => {
      if (mounted) {
        setLoading(false);
        initialLoad.current = false;
      }
    });
    return () => { mounted = false; };
  }, [userId, loadProfile]);

  const signUp = useCallback(async (email: string, password: string, metadata: SignUpMetadata) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: metadata.full_name,
            phone: metadata.phone,
            roles: metadata.roles,
          },
        },
      });

      if (error && (error as { code?: string }).code === 'user_already_exists') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          return { error: 'An account with this email already exists. Please sign in with your password to add a new role, or use a different email.' };
        }

        const { data: existing } = await supabase
          .from('profiles')
          .select('*')
          .maybeSingle();

        if (existing) {
          const existingRoles: string[] = existing.roles || [];
          const merged = Array.from(new Set([...existingRoles, ...metadata.roles]));
          const update: Record<string, unknown> = { roles: merged };

          if (metadata.roles.includes('driver')) {
            if (metadata.vehicle_type) update.vehicle_type = metadata.vehicle_type;
            if (metadata.vehicle_plate) update.vehicle_plate = metadata.vehicle_plate;
            if (metadata.service_area) update.service_area = metadata.service_area;
          }
          if (metadata.roles.includes('shipper')) {
            if (metadata.business_name) update.business_name = metadata.business_name;
            if (metadata.business_address) update.business_address = metadata.business_address;
          }
          if (!existing.address && metadata.address) update.address = metadata.address;
          if (!existing.city && metadata.city) update.city = metadata.city;
          if (!existing.state && metadata.state) update.state = metadata.state;
          if (!existing.zip_code && metadata.zip_code) update.zip_code = metadata.zip_code;

          await supabase.from('profiles').update(update).eq('id', existing.id);
        }
        return { error: null };
      }

      if (error) return { error: error.message };

      if (data.user) {
        await new Promise((r) => setTimeout(r, 200));
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            business_name: metadata.business_name || null,
            business_address: metadata.business_address || null,
            address: metadata.address || null,
            city: metadata.city || null,
            state: metadata.state || null,
            zip_code: metadata.zip_code || null,
            vehicle_type: metadata.vehicle_type || null,
            vehicle_plate: metadata.vehicle_plate || null,
            service_area: metadata.service_area || null,
          })
          .eq('id', data.user.id);
        if (updateError) {
          console.warn('Profile update deferred:', updateError.message);
        }
      }
      return { error: null };
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { error: 'Network error: Unable to connect to the server. Please check your internet connection and try again.' };
      }
      return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
    }
  }, []);

  const adminSignUp = useCallback(async (email: string, password: string, fullName: string, phone: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ email, password, full_name: fullName, phone }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { error: data.error || 'Failed to create admin account' };
      }
      // Auto sign-in after successful admin registration
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        return { error: data.existing_user
          ? 'Admin role added to your existing account, but sign-in failed. Please sign in with your existing password.'
          : `Admin account created, but auto sign-in failed. Please sign in manually. (${signInError.message})` };
      }
      return { error: null };
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { error: 'Network error: Unable to connect to the server. Please check your internet connection and try again.' };
      }
      return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { error: 'Network error: Unable to connect to the server. Please check your internet connection and try again.' };
      }
      return { error: err instanceof Error ? err.message : 'An unexpected error occurred' };
    }
  }, []);

  const signOut = useCallback(async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setAdminUser(null);
    setLoading(false);
    initialLoad.current = true;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        Object.keys(window.localStorage).forEach((key) => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            window.localStorage.removeItem(key);
          }
        });
      }
    } catch (e) {
      console.error('LocalStorage clear error:', e);
    }
    try {
      if (document?.cookie) {
        document.cookie.split(';').forEach((c) => {
          const name = c.split('=')[0].trim();
          if (name) {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          }
        });
      }
    } catch (e) {
      console.error('Cookie clear error:', e);
    }
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const value = useMemo(() => ({
    session,
    user,
    profile,
    adminUser,
    loading,
    isAdmin: !!adminUser,
    signUp,
    adminSignUp,
    signIn,
    signOut,
    refreshProfile,
  }), [session, user, profile, adminUser, loading, signUp, adminSignUp, signIn, signOut, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
