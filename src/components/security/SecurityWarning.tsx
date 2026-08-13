import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle, Key } from 'lucide-react';

interface SecurityWarningProps {
  type: 'warn_1' | 'warn_2' | 'block';
  violations: number;
  onDismiss: () => void;
  onAdminUnlock?: () => void;
  eventType?: string;
}

export default function SecurityWarning({
  type,
  violations,
  onDismiss,
  onAdminUnlock,
  eventType = 'TAB SWITCH DETECTED'
}: SecurityWarningProps) {
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const handleUnlockAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    const validPins = ['admin123', 'Daya@2006', 'ADMIN', 'UNLOCK'];
    if (validPins.includes(adminPin.trim())) {
      setPinError(false);
      if (onAdminUnlock) {
        onAdminUnlock();
      } else {
        onDismiss();
      }
    } else {
      setPinError(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 font-mono select-none">
      
      {/* Scanline animation overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 overflow-hidden">
        <div className="w-full h-[3px] bg-red-600/30 shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-scanline"></div>
      </div>

      <div className={`max-w-md w-full border-2 rounded p-8 text-center bg-detective-panel shadow-2xl relative z-20 ${
        type === 'block' ? 'border-detective-crimson' : 'border-detective-alert'
      }`}>
        
        {/* Warning Icon badge */}
        <div className="flex justify-center mb-6">
          {type === 'block' ? (
            <div className="bg-detective-crimson/15 p-4 rounded-full border border-detective-crimson animate-pulse text-detective-alert">
              <Lock className="w-12 h-12" />
            </div>
          ) : (
            <div className="bg-detective-alert/15 p-4 rounded-full border border-detective-alert animate-bounce text-detective-alert">
              <ShieldAlert className="w-12 h-12" />
            </div>
          )}
        </div>

        {/* Header Title */}
        <h1 className="text-xl md:text-2xl font-bold uppercase tracking-wider text-white mb-2">
          {type === 'block' ? 'SECURITY REVIEW REQUIRED' : 'SECURITY WARNING'}
        </h1>
        
        <div className="text-sm font-bold text-detective-alert uppercase tracking-widest mb-4 flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-4 h-4" /> ⚠ ATTENTION
        </div>

        {/* Description Words */}
        <div className="text-sm text-stone-300 leading-relaxed mb-6 space-y-3 font-mono">
          <p className="text-xs uppercase text-detective-muted">
            Investigation session monitoring detected
          </p>
          <div className="bg-black/60 border border-white/10 px-3 py-2 rounded text-xs font-bold text-white uppercase tracking-wider">
            {eventType}
          </div>
          <div className="text-sm font-bold tracking-widest text-detective-alert">
            ATTEMPT: {violations} / 3
          </div>
          <p className="text-xs text-detective-text pt-2">
            {type === 'block'
              ? 'Your session has been flagged for admin review.'
              : 'Please return to the investigation.'}
          </p>
        </div>

        {/* Bottom Actions Form/Button */}
        {type !== 'block' ? (
          <button
            onClick={onDismiss}
            className="w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-3 rounded uppercase font-bold tracking-widest text-xs transition-colors duration-200"
          >
            [ CONTINUE ]
          </button>
        ) : (
          <form onSubmit={handleUnlockAttempt} className="space-y-3 pt-4 border-t border-detective-crimson/30">
            <label className="block text-[10px] uppercase text-detective-alert font-bold flex items-center justify-center gap-1">
              <Key className="w-3.5 h-3.5" /> Enter Admin Clearance Unlock PIN
            </label>

            {pinError && (
              <div className="text-[10px] text-red-400 font-bold uppercase">
                Invalid Admin PIN. Try again.
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="password"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="Enter Admin PIN..."
                className="w-full bg-black/60 border border-detective-border rounded px-3 py-2.5 text-xs text-white focus:outline-none focus:border-detective-crimson"
              />
              <button
                type="submit"
                className="bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2.5 rounded text-xs font-bold uppercase tracking-wider flex-shrink-0 border border-detective-crimson/50"
              >
                Unlock
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
