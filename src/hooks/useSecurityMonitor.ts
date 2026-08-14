import { useEffect, useState, useRef, useCallback } from 'react';
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

  const isAwayRef = useRef(false);
  const waitingForAckRef = useRef(false);

  const mapEventTypeToLabel = (type: string) => {
    switch (type) {
      case 'fullscreen_exit':
        return 'FULLSCREEN EXIT DETECTED';
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

  const isDepartureEvent = (type: string) => {
    return type === 'tab_switch' || type === 'window_blur' || type === 'tab_blur';
  };

  // Sync initial violations from DB on load
  const loadLogs = useCallback(async () => {
    if (!teamId || !sessionId) return;

    try {
      const { data, error } = await supabase
        .from('security_logs')
        .select('id, event_type, created_at')
        .eq('team_id', teamId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        // Filter strictly for departure violations (tab_switch / window_blur)
        const departureLogs = data.filter((log: any) => isDepartureEvent(log.event_type));
        const totalDepartureViolations = departureLogs.length;
        setViolations(totalDepartureViolations);

        // Check local storage acknowledged log IDs
        const acknowledgedIds = JSON.parse(
          localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
        );

        // Find unacknowledged departure violations
        const unacknowledged = departureLogs.filter((log: any) => !acknowledgedIds.includes(log.id));

        if (totalDepartureViolations >= 3) {
          setActiveWarning('block');
          isAwayRef.current = true;
          waitingForAckRef.current = true;
          setLastEvent('SECURITY REVIEW REQUIRED — MULTIPLE TAB SWITCHES');
        } else if (unacknowledged.length > 0) {
          const latestLog = unacknowledged[unacknowledged.length - 1];
          setLastEvent(mapEventTypeToLabel(latestLog.event_type));
          isAwayRef.current = true;
          waitingForAckRef.current = true;

          if (totalDepartureViolations === 1) {
            setActiveWarning('warn_1');
          } else if (totalDepartureViolations === 2) {
            setActiveWarning('warn_2');
          }
        } else {
          setActiveWarning(null);
          isAwayRef.current = false;
          waitingForAckRef.current = false;
        }
      }
    } catch (err) {
      console.error('Failed to sync security logs', err);
    }
  }, [teamId, sessionId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const logViolation = async (
    eventType: string,
    severity: 'low' | 'medium' | 'high' = 'low',
    clientEventId?: string
  ) => {
    if (!teamId || !sessionId) return;

    const details: SecurityEventDetails = {
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    };

    const eventId = clientEventId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);

    try {
      // 1. Insert security log record with client_event_id idempotency
      const insertPayload: any = {
        team_id: teamId,
        session_id: sessionId,
        event_type: eventType,
        details,
        severity,
        is_reviewed: false,
      };

      if (eventId) {
        insertPayload.client_event_id = eventId;
      }

      const { error } = await supabase.from('security_logs').insert(insertPayload);

      if (error) {
        // If unique constraint error on client_event_id, ignore gracefully as duplicate event
        if (!error.message.includes('unique constraint') && !error.message.includes('duplicate key')) {
          console.error('Database failed to write security log', error);
        }
      }

      // 2. Fetch updated list of logs to derive authoritative departure count
      const { data: allLogs, error: fetchError } = await supabase
        .from('security_logs')
        .select('id, event_type')
        .eq('team_id', teamId)
        .eq('session_id', sessionId);

      if (!fetchError && allLogs) {
        const departureLogs = allLogs.filter((l: any) => isDepartureEvent(l.event_type));
        const nextViolations = departureLogs.length;

        if (isDepartureEvent(eventType)) {
          setViolations(nextViolations);
          setLastEvent(mapEventTypeToLabel(eventType));

          if (nextViolations === 1) {
            setActiveWarning('warn_1');
          } else if (nextViolations === 2) {
            setActiveWarning('warn_2');
          } else if (nextViolations >= 3) {
            setActiveWarning('block');
          }
        }
      }

      if (onDisciplinaryAlert) {
        onDisciplinaryAlert(severity, `SECURITY MONITOR: ${eventType.toUpperCase()}`);
      }
    } catch (err) {
      console.error('Error logging violation', err);
    }
  };

  useEffect(() => {
    if (!teamId || !sessionId) return;

    // Visibility change handler — primary departure signal
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (isAwayRef.current || waitingForAckRef.current) return;
        isAwayRef.current = true;
        const clientEventId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
        logViolation('tab_switch', 'medium', clientEventId);
      } else if (document.visibilityState === 'visible') {
        // Returning to tab: keep warning mounted if set, but set waitingForAck
        if (activeWarning) {
          waitingForAckRef.current = true;
        }
      }
    };

    // Blur event — secondary departure signal (ignored if already away via visibilityState)
    const handleBlur = () => {
      if (isAwayRef.current || waitingForAckRef.current) return;
      isAwayRef.current = true;
      const clientEventId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined;
      logViolation('window_blur', 'medium', clientEventId);
    };

    // Focus event
    const handleFocus = () => {
      // If no warning pending, reset away flag
      if (!waitingForAckRef.current && !activeWarning) {
        isAwayRef.current = false;
      }
    };

    // Fullscreen change monitor — log FULLSCREEN_EXIT without incrementing tab switch 3/3 count
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logViolation('fullscreen_exit', 'medium');
      }
    };

    // Copy / Paste / Cut / Context Menu — logged without increasing tab switch count
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('copy_attempt', 'low');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('paste_attempt', 'low');
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logViolation('cut_attempt', 'low');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logViolation('context_menu', 'low');
    };

    // Register event listeners
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [teamId, sessionId, activeWarning]);

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
      isAwayRef.current = false;
      waitingForAckRef.current = false;
    }
  };

  return {
    violations,
    activeWarning,
    lastEvent,
    dismissWarning,
    logCustomViolation: logViolation,
  };
}
