import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface SecurityEventDetails {
  path: string;
  timestamp: string;
}

export function useSecurityMonitor(
  teamId: string | null | undefined,
  sessionId: string | null | undefined,
  onDisciplinaryAlert?: (severity: string, msg: string) => void
) {
  const [violations, setViolations] = useState(0);
  const [activeWarning, setActiveWarning] = useState<'warn_1' | 'warn_2' | 'block' | null>(null);
  const [lastEvent, setLastEvent] = useState<string>('TAB SWITCH DETECTED');

  const isDepartedRef = useRef(false);

  const mapEventTypeToLabel = (type: string) => {
    switch (type) {
      case 'copy_attempt':
        return 'CLIPBOARD COPY DETECTED';
      case 'paste_attempt':
        return 'CLIPBOARD PASTE DETECTED';
      case 'cut_attempt':
        return 'CLIPBOARD CUT DETECTED';
      case 'context_menu':
        return 'RIGHT-CLICK CONTEXT MENU BLOCKED';
      case 'tab_switch':
      case 'window_blur':
      case 'tab_blur':
      default:
        return 'TAB SWITCH DETECTED';
    }
  };

  // Sync initial violations from DB on load
  useEffect(() => {
    if (!teamId || !sessionId) return;

    async function loadLogs() {
      try {
        const { data, error } = await supabase
          .from('security_logs')
          .select('id, event_type')
          .eq('team_id', teamId)
          .eq('session_id', sessionId);

        if (!error && data) {
          const totalViolations = data.length;
          setViolations(totalViolations);

          // Get the list of already acknowledged violations for this session from local storage
          const acknowledgedIds = JSON.parse(
            localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
          );

          // Find the first unacknowledged violation
          const unacknowledged = data.filter((log: any) => !acknowledgedIds.includes(log.id));

          if (unacknowledged.length > 0) {
            // There is an unacknowledged violation!
            const latestLog = unacknowledged[unacknowledged.length - 1];
            setLastEvent(mapEventTypeToLabel(latestLog.event_type));
            
            isDepartedRef.current = true; // Lock events since warning is active

            if (totalViolations === 1) {
              setActiveWarning('warn_1');
            } else if (totalViolations === 2) {
              setActiveWarning('warn_2');
            } else if (totalViolations >= 3) {
              setActiveWarning('block');
            }
          } else {
            setActiveWarning(null);
            isDepartedRef.current = false;
          }
        }
      } catch (err) {
        console.error('Failed to sync security logs', err);
      }
    }
    loadLogs();
  }, [teamId, sessionId]);

  const logViolation = async (eventType: string, severity: 'low' | 'medium' | 'high' = 'low') => {
    if (!teamId || !sessionId) return;

    const details: SecurityEventDetails = {
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Insert security log record
      const { data, error } = await supabase.from('security_logs').insert({
        team_id: teamId,
        session_id: sessionId,
        event_type: eventType,
        details,
        severity,
        is_reviewed: false
      });

      if (error) {
        console.error('Database failed to write security log', error);
        return;
      }

      // 2. Fetch updated list of logs to derive the authoritative count
      const { data: allLogs, error: fetchError } = await supabase
        .from('security_logs')
        .select('id, event_type')
        .eq('team_id', teamId)
        .eq('session_id', sessionId);

      if (!fetchError && allLogs) {
        const nextViolations = allLogs.length;
        setViolations(nextViolations);
        setLastEvent(mapEventTypeToLabel(eventType));

        // Determine warning overlay level
        if (nextViolations === 1) {
          setActiveWarning('warn_1');
        } else if (nextViolations === 2) {
          setActiveWarning('warn_2');
        } else if (nextViolations >= 3) {
          setActiveWarning('block');
        }
      }

      if (onDisciplinaryAlert) {
        onDisciplinaryAlert(severity, `VIOLATION DETECTED: ${eventType.toUpperCase()}`);
      }
    } catch (err) {
      console.error('Error logging violation', err);
    }
  };

  useEffect(() => {
    if (!teamId || !sessionId) return;

    // A. Detect Window Blur (defocus) — user leaves the window
    const handleBlur = () => {
      if (isDepartedRef.current) return;
      isDepartedRef.current = true;
      logViolation('tab_switch', 'medium');
    };

    // B. Detect Tab Switches / Hidden Pages
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (isDepartedRef.current) return;
        isDepartedRef.current = true;
        logViolation('tab_switch', 'medium');
      } else if (document.visibilityState === 'visible') {
        // User has returned to the tab — clear departure flag
        // The warning overlay will still show; isDepartedRef just controls event dedup
        isDepartedRef.current = false;
      }
    };

    // C. Detect Focus return (user clicks back to window)
    const handleFocus = () => {
      // Reset departure flag so the NEXT departure counts as a new event
      isDepartedRef.current = false;
    };

    // D. Detect Copy
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('copy_attempt', 'low');
    };

    // E. Detect Paste
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('paste_attempt', 'low');
    };

    // F. Detect Cut
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('cut_attempt', 'low');
    };

    // G. Detect Right-Click Context Menu
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolation('context_menu', 'low');
    };

    // Attach Event Listeners
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [teamId, sessionId]);

  const dismissWarning = async () => {
    if (activeWarning !== 'block') {
      try {
        const { data, error } = await supabase
          .from('security_logs')
          .select('id')
          .eq('team_id', teamId)
          .eq('session_id', sessionId);

        if (!error && data) {
          const currentAck = JSON.parse(
            localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
          );
          const newAck = Array.from(new Set([...currentAck, ...data.map((l: any) => l.id)]));
          localStorage.setItem(`mystery_y_ack_logs_${sessionId}`, JSON.stringify(newAck));
        }
      } catch (err) {
        console.error('Failed to acknowledge warning', err);
      }
      
      setActiveWarning(null);
      isDepartedRef.current = false;
    }
  };

  return {
    violations,
    activeWarning,
    lastEvent,
    dismissWarning,
    logCustomViolation: logViolation
  };
}
