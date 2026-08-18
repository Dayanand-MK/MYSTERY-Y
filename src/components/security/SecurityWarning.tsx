import React, { useState } from 'react';
import { ShieldAlert, Lock, AlertTriangle, Maximize2, RefreshCw } from 'lucide-react';

export interface SecurityWarningProps {
  type: 'warn_1' | 'warn_2' | 'block';
  violations: number;
  onDismiss: () => void;
  onReturnFullscreen?: () => Promise<void> | void;
  eventType?: string;
}

export default function SecurityWarning({
  type,
  violations,
  onDismiss,
  onReturnFullscreen,
  eventType = 'TAB SWITCH DETECTED'
}: SecurityWarningProps) {
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [isRestoringFs, setIsRestoringFs] = useState(false);

  const isFullscreenExit = eventType.toUpperCase().includes('FULLSCREEN');
  const cappedAttempts = Math.min(3, Math.max(1, violations));

  const handleAction = async () => {
    if (isFullscreenExit && onReturnFullscreen) {
      setIsRestoringFs(true);
      setFullscreenFailed(false);
      try {
        await onReturnFullscreen();
        if (!document.fullscreenElement) {
          // If still not fullscreen after attempt
          setFullscreenFailed(true);
        }
      } catch (err) {
        console.warn('Fullscreen restore failed', err);
        setFullscreenFailed(true);
      } finally {
        setIsRestoringFs(false);
      }
    } else {
      onDismiss();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 font-mono select-none">
      
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
          {type === 'block' ? 'SECURITY REVIEW REQUIRED' : isFullscreenExit ? 'SECURITY INTERRUPTION' : 'SECURITY WARNING'}
        </h1>
        
        <div className="text-xs font-bold text-detective-alert uppercase tracking-widest mb-4 flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          {type === 'block' ? 'MAXIMUM SECURITY ATTEMPTS REACHED' : 'SECURITY INCIDENT DETECTED'}
        </div>

        {/* Description Details */}
        <div className="text-sm text-stone-300 leading-relaxed mb-6 space-y-3 font-mono">
          <p className="text-[11px] uppercase text-detective-muted">
            {type === 'block'
              ? 'Security violation limit reached. Your investigation session has been locked. Please wait for an event administrator to review your session.'
              : isFullscreenExit ? 'Fullscreen mode was exited. Your investigation has been temporarily paused.' : 'Investigation session integrity protocol triggered.'}
          </p>

          <div className="bg-black/70 border border-detective-crimson/40 px-3 py-2.5 rounded text-xs font-bold text-detective-alert uppercase tracking-wider">
            {eventType}
          </div>

          <div className="text-sm font-bold tracking-widest text-white bg-black/40 py-1.5 px-3 rounded border border-detective-border">
            SECURITY ATTEMPT: <span className={type === 'block' || cappedAttempts >= 3 ? 'text-detective-crimson' : 'text-detective-amber'}>{cappedAttempts} / 3</span>
          </div>

          {fullscreenFailed && (
            <div className="bg-detective-crimson/15 border border-detective-crimson text-detective-alert p-2.5 rounded text-xs font-bold uppercase">
              ⚠ Fullscreen could not be restored. Please try again.
            </div>
          )}

          <p className="text-xs text-detective-text pt-1">
            {type === 'block' ? (
              <span className="text-stone-400">
                An administrator must review your session before you can continue. Please wait for supervisor clearance.
              </span>
            ) : isFullscreenExit ? (
              <span className="text-stone-300">
                Fullscreen mode is mandatory during the investigation. Return to fullscreen to continue.
              </span>
            ) : (
              <span className="text-stone-300">
                Departing the investigation tab or copying/pasting is strictly monitored.
              </span>
            )}
          </p>
        </div>

        {/* Bottom Actions */}
        {type !== 'block' ? (
          <button
            onClick={handleAction}
            disabled={isRestoringFs}
            className="w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-3 rounded uppercase font-bold tracking-widest text-xs transition-all shadow-[0_0_15px_rgba(211,47,47,0.3)] hover:shadow-[0_0_20px_rgba(211,47,47,0.5)] cursor-pointer disabled:opacity-50"
          >
            {isRestoringFs ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> [ RESTORING FULLSCREEN... ]
              </>
            ) : isFullscreenExit ? (
              fullscreenFailed ? (
                <>
                  <Maximize2 className="w-4 h-4" /> [ RETRY FULLSCREEN ]
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" /> [ RETURN TO INVESTIGATION ]
                </>
              )
            ) : (
              '[ CONTINUE ]'
            )}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-detective-crimson/15 border border-detective-crimson rounded p-3 text-xs text-detective-alert font-bold uppercase tracking-wider">
              [ SESSION LOCKED ]
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
