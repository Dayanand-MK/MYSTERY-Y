import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { isMockMode } from '../../lib/supabase';
import { Shield, Eye, EyeOff, Loader, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { adminLogin, adminError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    const success = await adminLogin(email, password);
    setIsSubmitting(false);

    if (success) {
      navigate('/admin');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-detective-dark px-4 font-mono cctv-overlay">
      <div className="max-w-sm w-full border border-detective-border rounded bg-detective-panel shadow-2xl p-8 relative overflow-hidden">
        
        {/* Border detail overlay */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-detective-crimson"></div>

        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex justify-center bg-detective-crimson/10 p-3 rounded-full border border-detective-crimson/30 mb-3 text-detective-alert animate-pulse-subtle">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-bold uppercase tracking-wider text-white">
            Command Entrance
          </h1>
          <span className="text-[10px] text-detective-muted uppercase tracking-widest block mt-0.5">
            Mystery Y Administration
          </span>
        </div>

        {/* Error Advisory */}
        {adminError && (
          <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-3 rounded text-[11px] mb-5 uppercase leading-normal">
            <strong>Access Denied:</strong> {adminError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Email Operator ID</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vh13155_ml23@velhightech.com"
              required
              className="w-full bg-black/40 border border-detective-border rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-detective-crimson"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Secret Clearance Key</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Clearance Key"
                required
                className="w-full bg-black/40 border border-detective-border rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-detective-crimson pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-detective-muted hover:text-white"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-2.5 rounded font-bold uppercase tracking-wider text-xs border border-detective-crimson/50 hover:shadow-[0_0_12px_rgba(211,47,47,0.35)] transition-all duration-300 disabled:opacity-50 mt-6"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" /> Verifying Clearance...
              </>
            ) : (
              'Authenticate Link'
            )}
          </button>
        </form>

        {/* System Connection Status */}
        <div className="mt-8 pt-4 border-t border-detective-border/40 text-[10px] text-detective-muted leading-relaxed flex items-center justify-between">
          <span className="uppercase tracking-wider">Auth Backend:</span>
          {isMockMode ? (
            <span className="inline-flex items-center gap-1 text-detective-amber font-bold uppercase">
              <ShieldAlert className="w-3 h-3" /> Local Simulation
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-detective-green font-bold uppercase">
              <CheckCircle2 className="w-3 h-3" /> Supabase Live
            </span>
          )}
        </div>

        {/* Exit back to landing */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-[10px] text-detective-muted hover:text-white underline decoration-dotted"
          >
            Return to Public Gateway
          </button>
        </div>

      </div>
    </div>
  );
}
