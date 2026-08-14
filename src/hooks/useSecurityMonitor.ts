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

  // De-duplication and in-flight guards
  const isHandlingIncidentRef = useRef(false);
  const lastIncidentTimestampRef = useRef(0);
  const isMountedRef = useRef(true);

  // Check authoritative session and admin override status
  const checkSessionStatus = useCallback(async () => {
    if (!sessionId && !teamId) return;

    try {
      if (sessionId) {
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('status, ended_at')
          .eq('id', sessionId)
          .maybeSingle();

        if (sessData && sessData.status === 'terminated') {
          setIsTerminated(true);
          return;
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

      // Check if admin cleared/unlocked this team in disciplinary actions
      const { data: actionData } = await supabase
        .from('disciplinary_actions')
        .select('id, action, created_at')
        .eq('team_id', teamId)
        .eq('action', 'override_unlock')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return actionData;
    } catch (err) {
      console.warn('[MYSTERY-Y][SECURITY] Failed to check session status:', err);
      return null;
    }
  }, [teamId, sessionId]);

  // Sync initial violations from DB on load
  const loadLogs = useCallback(async () => {
    if (!teamId || !sessionId) return;

    try {
      const latestUnlockAction = await checkSessionStatus();

      const { data: logsData, error } = await supabase
        .from('security_logs')
        .select('id, event_type, created_at, admin_action, is_reviewed')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true });

      if (!error && logsData) {
        const rawCount = logsData.length;
        // Strict cap at 3
        const cappedCount = Math.min(3, rawCount);
        setViolations(cappedCount);

        // Check if there is an active unlock
        let isCurrentlyUnlocked = false;
        if (latestUnlockAction) {
          const unlockTime = new Date(latestUnlockAction.created_at).getTime();
          // Check if any log occurred AFTER this unlock
          const logsAfterUnlock = logsData.filter(
            (l: any) => new Date(l.created_at).getTime() > unlockTime
          );

          if (logsAfterUnlock.length === 0) {
            isCurrentlyUnlocked = true;
          }
        }

        setIsAdminUnlocked(isCurrentlyUnlocked);

        // Check local storage acknowledged log IDs
        const acknowledgedIds: string[] = JSON.parse(
          localStorage.getItem(`mystery_y_ack_logs_${sessionId}`) || '[]'
        );

        const unacknowledged = logsData.filter((log: any) => !acknowledgedIds.includes(log.id));

        if (rawCount >= 3) {
          if (isCurrentlyUnlocked) {
            setIsLocked(false);
            setActiveWarning(null);
            isHandlingIncidentRef.current = false;
          } else {
            setIsLocked(true);
            setActiveWarning('block');
            setLastEvent('MAXIMUM SECURITY ATTEMPTS REACHED (3/3)');
            isHandlingIncidentRef.current = true;
          }
        } else if (unacknowledged.length > 0) {
          const latestLog = unacknowledged[unacknowledged.length - 1];
          setLastEvent(mapEventTypeToLabel(latestLog.event_type));
          isHandlingIncidentRef.current = true;

          if (cappedCount === 1) {
            setActiveWarning('warn_1');
          } else if (cappedCount === 2) {
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

    // Realtime channel listener for instant synchronization
    const secChannel = supabase
      .channel(`sec-monitor-${sessionId || 'global'}-${Date.now()}`)
      .on('postgres_changes', { event: '*', table: 'security_logs' }, () => {
        loadLogs();
      })
      .on('postgres_changes', { event: '*', table: 'investigation_sessions' }, () => {
        checkSessionStatus();
      })
      .on('postgres_changes', { event: '*', table: 'disciplinary_actions' }, () => {
        loadLogs();
      })
      .subscribe();

    return () => {
      isMountedRef.current = false;
      supabase.removeChannel(secChannel);
    };
  }, [loadLogs, checkSessionStatus, sessionId]);

  // Centralized security incident handler
  const handleSecurityIncident = async (
    eventType: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
    clientEventId?: string
  ) => {
    if (!teamId || !sessionId) return;
    if (isTerminated) return;

    // Strict De-duplication: Ignore events if warning is already up or within cooldown (<800ms)
    const now = Date.now();
    if (isHandlingIncidentRef.current) {
      console.debug('[MYSTERY-Y][SECURITY] Ignored duplicate event (modal active):', eventType);
      return;
    }
    if (now - lastIncidentTimestampRef.current < 800) {
      console.debug('[MYSTERY-Y][SECURITY] Ignored duplicate event within cooldown (<800ms):', eventType);
      return;
    }

    lastIncidentTimestampRef.current = now;
    isHandlingIncidentRef.current = true;

    // Determine current display attempt capped at 3
    const nextAttempt = Math.min(3, violations + 1);

    const details: SecurityEventDetails = {
      event_type: eventType,
      attempt_number: nextAttempt,
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
        severity: nextAttempt >= 3 ? 'high' : severity,
        is_reviewed: false,
      };

      if (eventId) {
        insertPayload.client_event_id = eventId;
      }

      console.debug('[MYSTERY-Y][SECURITY] Authoritative incident logged:', eventType, '| Attempt:', nextAttempt);

      await supabase.from('security_logs').insert(insertPayload);

      // Fetch authoritative total logs from DB
      const { data: allLogs } = await supabase
        .from('security_logs')
        .select('id, event_type')
        .eq('team_id', teamId);

      const rawCount = allLogs ? allLogs.length : nextAttempt;
      const cappedCount = Math.min(3, rawCount);
      setViolations(cappedCount);

      const displayLabel = mapEventTypeToLabel(eventType);
      setLastEvent(displayLabel);

      if (cappedCount === 1) {
        setActiveWarning('warn_1');
      } else if (cappedCount === 2) {
        setActiveWarning('warn_2');
      } else if (cappedCount >= 3 || rawCount >= 3) {
        // Strict 3-strike lock
        setActiveWarning('block');
        setIsLocked(true);
        setIsAdminUnlocked(false);
      }

      if (onDisciplinaryAlert) {
        onDisciplinaryAlert(severity, `SECURITY INCIDENT: ${displayLabel} (${cappedCount}/3)`);
      }
    } catch (err) {
      console.error('[MYSTERY-Y][SECURITY] Error logging security incident:', err);
    }
  };

  // Browser event listeners
  useEffect(() => {
    if (!teamId || !sessionId || isTerminated) return;

    // 1. Tab Switch (Primary detector)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleSecurityIncident('tab_switch', 'medium');
      }
    };

    // 2. Window / Focus Loss (Secondary, ignored if already visibility hidden)
    const handleBlur = () => {
      if (document.visibilityState !== 'hidden') {
        handleSecurityIncident('window_blur', 'medium');
      }
    };

    // 3. Fullscreen Exit (Authoritative browser fullscreenchange listener)
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        handleSecurityIncident('fullscreen_exit', 'high');
      }
    };

    // 4. Clipboard tampering
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      handleSecurityIncident('copy_attempt', 'low');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleSecurityIncident('paste_attempt', 'low');
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      handleSecurityIncident('cut_attempt', 'low');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleSecurityIncident('context_menu', 'low');
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

  // Supervisor in-person PIN clearance override
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
        created_by: 'b2ece65e-d728-4220-a40f-66f3234caeef',
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
    logCustomViolation: handleSecurityIncident,
  };
}
