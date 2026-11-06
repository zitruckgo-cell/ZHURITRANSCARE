import { useState, useEffect } from 'react';
import {
  ArrowLeft, Truck, Package, User, Mail, Phone, MapPin,
  Car, Eye, EyeOff, Building, Home, CheckCircle, Loader2, AlertCircle, X,
  Shield,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from './Logo';
import { VEHICLE_TYPES } from '../lib/utils';
import { DisclaimerAgreement } from './Disclaimer';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual';

export function AuthPage({ setView, initialMode = 'register' }: { setView: (v: View) => void; initialMode?: 'login' | 'register' }) {
  const { signIn, signUp, adminSignUp, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [roles, setRoles] = useState<string[]>(['shipper']);
  const [vehicleType, setVehicleType] = useState('Car');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'error' | 'info'; msg: string } | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleRole = (role: string) => {
    if (role === 'admin') {
      setRoles(prev => prev.includes('admin') ? [] : ['admin']);
      return;
    }
    setRoles(prev => prev.includes(role)
      ? prev.filter(r => r !== 'admin' && r !== role)
      : [...prev.filter(r => r !== 'admin'), role]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setToast(null);

    if (!email.trim() || !password) {
      const msg = 'Email and password are required';
      setError(msg);
      setToast({ type: 'error', msg });
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim() || !phone.trim()) {
        const msg = 'Name and phone are required';
        setError(msg);
        setToast({ type: 'error', msg });
        return;
      }
      if (roles.length === 0) {
        const msg = 'Select at least one role';
        setError(msg);
        setToast({ type: 'error', msg });
        return;
      }
      if (password.length < 8) {
        const msg = 'Password must be at least 8 characters long';
        setError(msg);
        setToast({ type: 'error', msg });
        return;
      }
      if (!agreed) {
        const msg = 'You must agree to the Disclaimer of Usage to register';
        setError(msg);
        setToast({ type: 'error', msg });
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email.trim(), password);
        if (err) {
          setError(err);
          setToast({ type: 'error', msg: err });
        } else {
          setToast({ type: 'info', msg: 'Login successful! Loading your dashboard...' });
        }
      } else if (roles.includes('admin')) {
        const { error: err } = await adminSignUp(email.trim(), password, fullName.trim(), phone.trim());
        if (err) {
          setError(err);
          setToast({ type: 'error', msg: err });
        } else {
          setSuccess(true);
        }
      } else {
        const { error: err } = await signUp(email.trim(), password, {
          full_name: fullName.trim(),
          phone: phone.trim(),
          roles,
          business_name: businessName || undefined,
          business_address: businessAddress || undefined,
          address: address || undefined,
          city: city || undefined,
          state: stateVal || undefined,
          zip_code: zipCode || undefined,
          vehicle_type: roles.includes('driver') ? vehicleType : undefined,
          vehicle_plate: roles.includes('driver') ? vehiclePlate : undefined,
          service_area: roles.includes('driver') ? serviceArea || undefined : undefined,
        });
        if (err) {
          setError(err);
          setToast({ type: 'error', msg: err });
        } else {
          setSuccess(true);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(msg);
      setToast({ type: 'error', msg });
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = roles.includes('admin') ? 'Admin' : roles.length === 2 ? 'Shipper & Driver' : roles[0] === 'shipper' ? 'Shipper' : 'Driver';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1845] via-[#0d1f5c] to-[#102572] flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex items-center justify-between">
        <Logo size={40} />
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm text-blue-200 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {toast && (
        <div className={`fixed top-20 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border max-w-sm animate-[slideIn_0.3s_ease-out] ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" /> : <Loader2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500 animate-spin" />}
          <p className="text-sm font-medium">{toast.msg}</p>
          <button onClick={() => setToast(null)} className="ml-auto -mr-1 -mt-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a1845]/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 sm:p-10 max-w-md w-full mx-4 shadow-2xl text-center animate-[scaleIn_0.4s_ease-out]">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 rounded-full bg-emerald-100 animate-[ping_1s_ease-out]" />
              <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Registration Successful!</h2>
            <p className="text-sm text-slate-500 mb-1">Welcome to Zhuri Transcare, {fullName.split(' ')[0] || 'there'}.</p>
            <p className="text-sm text-slate-500 mb-6">Your {roleLabel} account has been created and you're being redirected to your dashboard.</p>
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#0d1f5c]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading your dashboard...
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-5xl">
          <div className="flex gap-1 p-1 bg-white/10 backdrop-blur-sm rounded-xl mb-6 max-w-xs mx-auto border border-white/20">
            <button type="button" onClick={() => { setMode('register'); setError(null); setToast(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'register' ? 'bg-white text-[#0d1f5c] shadow-lg' : 'text-blue-200 hover:text-white'}`}>
              Register
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null); setToast(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-white text-[#0d1f5c] shadow-lg' : 'text-blue-200 hover:text-white'}`}>
              Login
            </button>
          </div>

          {error && (
            <div className="mb-4 max-w-2xl mx-auto p-3 rounded-lg bg-red-500/20 border border-red-400/30 text-sm text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'register' ? (
              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-7 shadow-2xl border border-white/20">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-[#0d1f5c] flex items-center justify-center">
                      <User className="w-4.5 h-4.5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Personal & Address</h2>
                  </div>
                  <div className="space-y-3.5">
                    <div>
                      <label className="label">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-10" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Anderson" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-10" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(404) 555-0101" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Street Address</label>
                      <div className="relative">
                        <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-10" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1234 Peachtree St NE" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="label">City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Atlanta" /></div>
                      <div><label className="label">State</label><input className="input" value={stateVal} onChange={(e) => setStateVal(e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" /></div>
                      <div><label className="label">ZIP</label><input className="input" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="30309" /></div>
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="email" className="input pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} className="input pl-10 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Use a strong, unique password (min 8 characters).</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-7 shadow-2xl border border-white/20">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-[#0d1f5c] flex items-center justify-center">
                      <Package className="w-4.5 h-4.5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Role & Details</h2>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="label">Register as</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => toggleRole('shipper')} className={`flex items-center gap-1.5 px-2 py-3 rounded-xl border text-sm font-medium transition-all ${roles.includes('shipper') ? 'border-[#0d1f5c] bg-blue-50 text-[#0d1f5c]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                          <Package className="w-4 h-4" /> Shipper
                        </button>
                        <button type="button" onClick={() => toggleRole('driver')} className={`flex items-center gap-1.5 px-2 py-3 rounded-xl border text-sm font-medium transition-all ${roles.includes('driver') ? 'border-[#0d1f5c] bg-blue-50 text-[#0d1f5c]' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                          <Truck className="w-4 h-4" /> Driver
                        </button>
                        <button type="button" onClick={() => toggleRole('admin')} className={`flex items-center gap-1.5 px-2 py-3 rounded-xl border text-sm font-medium transition-all ${roles.includes('admin') ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                          <Shield className="w-4 h-4" /> Admin
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">Select a role. Shipper, Driver, and Admin can be combined. If you already have an account, signing up with the same email and password will add the new role to your existing account.</p>
                    </div>

                    {roles.includes('shipper') && !roles.includes('admin') && (
                      <div className="space-y-3 p-3.5 rounded-xl bg-blue-50/50 border border-blue-100">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0d1f5c] uppercase tracking-wide">
                          <Building className="w-3.5 h-3.5" /> Business Info (Optional)
                        </div>
                        <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business / Facility Name" />
                        <input className="input" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} placeholder="Business Address (if different)" />
                      </div>
                    )}

                    {roles.includes('driver') && !roles.includes('admin') && (
                      <div className="space-y-3 p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                          <Truck className="w-3.5 h-3.5" /> Driver Info
                        </div>
                        <div>
                          <label className="label">Vehicle Type</label>
                          <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
                            {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Vehicle Plate</label>
                          <div className="relative">
                            <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input className="input pl-10" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="ABC-1234" />
                          </div>
                        </div>
                        <div>
                          <label className="label">Service Area</label>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input className="input pl-10" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="Atlanta, GA" />
                          </div>
                        </div>
                      </div>
                    )}

                    {roles.length === 0 && (
                      <div className="text-center py-8 text-sm text-slate-400">Select at least one role to continue</div>
                    )}

                    <DisclaimerAgreement checked={agreed} onChange={setAgreed} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
                  <div className="text-center mb-6">
                    <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={56} height={56} className="rounded-full mx-auto mb-4 shadow-lg" />
                    <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
                    <p className="text-sm text-slate-500 mt-1">Sign in to your Zhuri Transcare account</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="label">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="email" className="input pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Password</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} className="input pl-10 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-center">
              <button type="submit" disabled={loading || authLoading} className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-white text-[#0d1f5c] font-semibold text-sm hover:bg-blue-50 transition-all active:scale-95 shadow-xl disabled:opacity-60 min-w-[200px]">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
