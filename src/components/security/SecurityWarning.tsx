import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle, Key, Maximize2 } from 'lucide-react';

export interface SecurityWarningProps {
  type: 'warn_1' | 'warn_2' | 'block';
  violations: number;
  onDismiss: () => void;
  onAdminUnlock?: () => void;
  onReturnFullscreen?: () => void;
  eventType?: string;
}

export default function SecurityWarning({
  type,
  violations,
  onDismiss,
  onAdminUnlock,
  onReturnFullscreen,
  eventType = 'TAB SWITCH DETECTED'
}: SecurityWarningProps) {
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const isFullscreenExit = eventType.toUpperCase().includes('FULLSCREEN');

  const handleUnlockAttempt = (e: React.FormEvent) => {
    e.preventDefault();
    const validPins = ['admin123', 'Daya@2006', 'ADMIN', 'UNLOCK', 'ZEPHORIA2026'];
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

  const handleAction = () => {
    if (isFullscreenExit && onReturnFullscreen) {
      onReturnFullscreen();
    } else {
      onDismiss();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 font-mono select-none">
      
      {/* Scanline animation overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 overflow-hidden">
        <div className="w-full h-[3px] bg-red-600/40 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-scanline"></div>
      </div>

      <div className={`max-w-md w-full border-2 rounded-lg p-6 sm:p-8 text-center bg-detective-panel shadow-2xl relative z-20 ${
        type === 'block' ? 'border-detective-crimson bg-detective-panel' : 'border-detective-alert'
      }`}>
        
        {/* Warning Icon badge */}
        <div className="flex justify-center mb-5">
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
        <h1 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white mb-1.5">
          {type === 'block' ? 'SECURITY REVIEW REQUIRED' : 'SECURITY WARNING'}
        </h1>
        
        <div className="text-xs font-bold text-detective-alert uppercase tracking-widest mb-4 flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          {type === 'block' ? 'MAXIMUM SECURITY INCIDENTS REACHED' : 'SECURITY INCIDENT DETECTED'}
        </div>

        {/* Description Details */}
        <div className="text-sm text-stone-300 leading-relaxed mb-6 space-y-3 font-mono">
          <p className="text-[11px] uppercase text-detective-muted">
            {type === 'block'
              ? 'Investigation session has been temporarily locked.'
              : 'Investigation session integrity protocol triggered.'}
          </p>

          <div className="bg-black/70 border border-detective-crimson/40 px-3 py-2.5 rounded text-xs font-bold text-detective-alert uppercase tracking-wider">
            {eventType}
          </div>

          <div className="text-sm font-bold tracking-widest text-white bg-black/40 py-1.5 px-3 rounded border border-detective-border">
            SECURITY ATTEMPT: <span className={violations >= 3 ? 'text-detective-crimson' : 'text-detective-amber'}>{violations} / 3</span>
          </div>

          <p className="text-xs text-detective-text pt-1">
            {type === 'block' ? (
              <span className="text-stone-400">
                An administrator must review your session before you can continue. Please wait for supervisor clearance.
              </span>
            ) : isFullscreenExit ? (
              <span className="text-stone-300">
                Fullscreen mode is mandatory during the investigation. Please return to fullscreen to continue.
              </span>
            ) : (
              <span className="text-stone-300">
                Departing the investigation window or modifying clipboard content is strictly monitored.
              </span>
            )}
          </p>
        </div>

        {/* Bottom Actions */}
        {type !== 'block' ? (
          <button
            onClick={handleAction}
            className="w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-3 rounded uppercase font-bold tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(211,47,47,0.3)] hover:shadow-[0_0_20px_rgba(211,47,47,0.5)] cursor-pointer"
          >
            {isFullscreenExit ? (
              <>
                <Maximize2 className="w-4 h-4" /> [ RETURN TO FULLSCREEN ]
              </>
            ) : (
              '[ CONTINUE ]'
            )}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-detective-crimson/10 border border-detective-crimson/30 rounded p-3 text-[11px] text-detective-alert font-bold uppercase tracking-wider">
              [ SESSION LOCKED ]
            </div>

            <form onSubmit={handleUnlockAttempt} className="space-y-3 pt-3 border-t border-detective-border/40">
              <label className="block text-[10px] uppercase text-detective-muted font-bold flex items-center justify-center gap-1">
                <Key className="w-3.5 h-3.5 text-detective-amber" /> In-Person Supervisor Override PIN
              </label>

              {pinError && (
                <div className="text-[10px] text-red-400 font-bold uppercase">
                  Invalid Supervisor PIN. Try again.
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Supervisor PIN..."
                  className="w-full bg-black/60 border border-detective-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson"
                />
                <button
                  type="submit"
                  className="bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex-shrink-0 border border-detective-crimson/50 cursor-pointer"
                >
                  Override
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
