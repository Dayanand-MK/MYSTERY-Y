import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface SecurityEventDetails {
  event_type: string;
  attempt_number: number;
  current_route: string;
  timestamp: string;
  fullscreen_active: boolean;
  visibility_state: string;
  user_agent: string;
}

export const mapEventTypeToLabel = (type: string): string => {
  const norm = type.toLowerCase();
  switch (norm) {
    case 'fullscreen_exit':
      return 'FULLSCREEN EXIT DETECTED';
    case 'copy_attempt':
      return 'COPY ATTEMPT DETECTED';
    case 'paste_attempt':
      return 'PASTE ATTEMPT DETECTED';
    case 'cut_attempt':
      return 'CUT ATTEMPT DETECTED';
    case 'context_menu':
      return 'RIGHT-CLICK CONTEXT MENU BLOCKED';
    case 'window_blur':
      return 'WINDOW / FOCUS LOSS DETECTED';
    case 'tab_switch':
    case 'tab_blur':
    default:
      return 'TAB SWITCH DETECTED';
  }
};

export function useSecurityMonitor(
  teamId: string | null | undefined,
  sessionId: string | null | undefined,
  onDisciplinaryAlert?: (severity: string, msg: string) => void
) {
  const [violations, setViolations] = useState(0);
  const [activeWarning, setActiveWarning] = useState<'warn_1' | 'warn_2' | 'block' | null>(null);
  const [lastEvent, setLastEvent] = useState<string>('TAB SWITCH DETECTED');
  const [isLocked, setIsLocked] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  // De-duplication guards
  const isHandlingIncidentRef = useRef(false);
  const lastIncidentTimestampRef = useRef(0);
  const isMountedRef = useRef(true);

  // Check if session has admin unlock or termination
  const checkSessionStatus = useCallback(async () => {
    if (!sessionId && !teamId) return;

    try {
      if (sessionId) {
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('status, ended_at')
          .eq('id', sessionId)
          .maybeSingle();

        if (sessData) {
          if (sessData.status === 'terminated') {
            setIsTerminated(true);
            return;
          }
        }
      }

      if (teamId) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('status')
          .eq('id', teamId)
          .maybeSingle();

        if (teamData && (teamData.status === 'disqualified' || teamData.status === 'terminated')) {
          setIsTerminated(true);
          return;
        }
      }

      // Check if admin explicitly unlocked this session in disciplinary/audit logs
      const { data: actionData } = await supabase
        .from('disciplinary_actions')
        .select('id, action, reason')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (actionData && actionData.action === 'override_unlock') {
        setIsAdminUnlocked(true);
        setIsLocked(false);
      }
    } catch (err) {
      console.warn('[MYSTERY-Y][SECURITY] Failed to check session status:', err);
    }
  }, [teamId, sessionId]);

  // Sync initial violations from DB on load
  const loadLogs = useCallback(async () => {
    if (!teamId || !sessionId) return;

    try {
      await checkSessionStatus();

      const { data, error } = await supabase
        .from('security_logs')
        .select('id, event_type, created_at, admin_action, is_reviewed')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const count = data.length;
        setViolations(count);

        // Check for admin unlock in logs
        const hasAdminUnlock = data.some((l: any) =>
          l.admin_action && l.admin_action.toLowerCase().includes('allow continue')
        );

        if (hasAdminUnlock) {
          setIsAdminUnlocked(true);
        }

        // Check local storage acknowledged log IDs
        const acknowledgedIds: string[] = JSON.parse(
          localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
        );

        const unacknowledged = data.filter((log: any) => !acknowledgedIds.includes(log.id));

        if (count >= 3 && !hasAdminUnlock) {
          setActiveWarning('block');
          setIsLocked(true);
          setLastEvent('SECURITY REVIEW REQUIRED (3/3)');
          isHandlingIncidentRef.current = true;
        } else if (unacknowledged.length > 0) {
          const latestLog = unacknowledged[unacknowledged.length - 1];
          setLastEvent(mapEventTypeToLabel(latestLog.event_type));
          isHandlingIncidentRef.current = true;

          if (count === 1) {
            setActiveWarning('warn_1');
          } else if (count === 2) {
            setActiveWarning('warn_2');
          }
        } else {
          setActiveWarning(null);
          isHandlingIncidentRef.current = false;
        }
      }
    } catch (err) {
      console.error('[MYSTERY-Y][SECURITY] Failed to sync security logs', err);
    }
  }, [teamId, sessionId, checkSessionStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    loadLogs();

    // Listen to real-time updates for security logs and session status
    const secChannel = supabase
      .channel(`sec-monitor-${sessionId || 'global'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', table: 'security_logs' }, () => {
        loadLogs();
      })
      .on('postgres_changes', { event: '*', table: 'investigation_sessions' }, () => {
        checkSessionStatus();
      })
      .on('postgres_changes', { event: '*', table: 'disciplinary_actions' }, () => {
        checkSessionStatus();
      })
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(secChannel);
    };
  }, [loadLogs, checkSessionStatus, sessionId]);

  // Unified violation logger with strict de-duplication
  const logViolation = async (
    eventType: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
    clientEventId?: string
  ) => {
    if (!teamId || !sessionId) return;
    if (isTerminated) return;

    // Strict De-duplication: 1 user action = 1 incident
    const now = Date.now();
    if (isHandlingIncidentRef.current) {
      console.debug('[MYSTERY-Y][SECURITY] Ignored duplicate event (warning currently active):', eventType);
      return;
    }
    if (now - lastIncidentTimestampRef.current < 800) {
      console.debug('[MYSTERY-Y][SECURITY] Ignored duplicate event within cooldown window (<800ms):', eventType);
      return;
    }

    lastIncidentTimestampRef.current = now;
    isHandlingIncidentRef.current = true;

    const currentAttempt = violations + 1;

    const details: SecurityEventDetails = {
      event_type: eventType,
      attempt_number: currentAttempt,
      current_route: window.location.pathname,
      timestamp: new Date().toISOString(),
      fullscreen_active: !!document.fullscreenElement,
      visibility_state: document.visibilityState,
      user_agent: navigator.userAgent,
    };

    const eventId =
      clientEventId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);

    try {
      const insertPayload: any = {
        team_id: teamId,
        session_id: sessionId,
        event_type: eventType,
        details,
        severity: currentAttempt >= 3 ? 'high' : severity,
        is_reviewed: false,
      };

      if (eventId) {
        insertPayload.client_event_id = eventId;
      }

      console.debug('[MYSTERY-Y][SECURITY] Logging security incident:', eventType, '| Attempt:', currentAttempt);

      const { data: inserted, error } = await supabase.from('security_logs').insert(insertPayload);

      if (error && !error.message.includes('unique') && !error.message.includes('duplicate')) {
        console.error('[MYSTERY-Y][SECURITY] Failed to write security log:', error);
      }

      // Fetch authoritative total violations from DB
      const { data: allLogs } = await supabase
        .from('security_logs')
        .select('id, event_type')
        .eq('team_id', teamId);

      const newTotal = allLogs ? allLogs.length : currentAttempt;
      setViolations(newTotal);

      const displayLabel = mapEventTypeToLabel(eventType);
      setLastEvent(displayLabel);

      if (newTotal === 1) {
        setActiveWarning('warn_1');
      } else if (newTotal === 2) {
        setActiveWarning('warn_2');
      } else if (newTotal >= 3) {
        setActiveWarning('block');
        setIsLocked(true);
      }

      if (onDisciplinaryAlert) {
        onDisciplinaryAlert(severity, `SECURITY INCIDENT: ${displayLabel} (${newTotal}/3)`);
      }
    } catch (err) {
      console.error('[MYSTERY-Y][SECURITY] Error logging security incident:', err);
    }
  };

  // Event Listeners for Tab Switch, Fullscreen Exit, Clipboard
  useEffect(() => {
    if (!teamId || !sessionId) return;

    // 1. Visibility change (Primary tab-switch detector)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        logViolation('tab_switch', 'medium');
      }
    };

    // 2. Window Blur (Secondary focus loss detector, ignored if visibility is already hidden)
    const handleBlur = () => {
      if (document.visibilityState !== 'hidden') {
        logViolation('window_blur', 'medium');
      }
    };

    // 3. Fullscreen exit detector (Triggers only when exiting fullscreen)
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logViolation('fullscreen_exit', 'high');
      }
    };

    // 4. Clipboard tampering
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

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [teamId, sessionId, violations, isTerminated]);

  // Dismiss modal overlay
  const dismissWarning = async () => {
    if (activeWarning !== 'block') {
      try {
        const { data, error } = await supabase
          .from('security_logs')
          .select('id')
          .eq('team_id', teamId);

        if (!error && data) {
          const currentAck: string[] = JSON.parse(
            localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
          );
          const newAck = Array.from(new Set([...currentAck, ...data.map((l: any) => l.id)]));
          localStorage.setItem(`mystery_y_ack_logs_${sessionId}`, JSON.stringify(newAck));
        }
      } catch (err) {
        console.error('[MYSTERY-Y][SECURITY] Failed to acknowledge warning:', err);
      }

      setActiveWarning(null);
      isHandlingIncidentRef.current = false;
    }
  };

  // Supervisor in-person or admin override unlock
  const handleAdminOverrideUnlock = async () => {
    setIsLocked(false);
    setActiveWarning(null);
    setIsAdminUnlocked(true);
    isHandlingIncidentRef.current = false;

    try {
      if (sessionId) {
        await supabase
          .from('investigation_sessions')
          .update({ status: 'active' })
          .eq('id', sessionId);
      }

      await supabase.from('disciplinary_actions').insert({
        team_id: teamId,
        session_id: sessionId,
        action: 'override_unlock',
        reason: 'Supervisor In-Person Clearance Override',
        created_by: 'b2ece65e-d728-4220-a40f-66f3234caeef', // Admin reference
      });
    } catch (e) {
      console.warn('Could not record override log:', e);
    }
  };

  return {
    violations,
    activeWarning,
    lastEvent,
    isLocked,
    isTerminated,
    isAdminUnlocked,
    dismissWarning,
    handleAdminOverrideUnlock,
    logCustomViolation: logViolation,
  };
}
