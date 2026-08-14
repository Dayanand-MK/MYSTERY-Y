import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface SecurityEventDetails {
  event_type: string;
  attempt_number: number;
  max_attempts: number;
  route: string;
  timestamp: string;
  user_agent: string;
  visibility_state: string;
  fullscreen: boolean;
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
      return 'CONTEXT MENU ATTEMPT DETECTED';
    case 'window_blur':
      return 'WINDOW / APPLICATION SWITCH DETECTED';
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

  // Stable references for event listeners to avoid stale closures or constant listener re-attaching
  const teamIdRef = useRef(teamId);
  const sessionIdRef = useRef(sessionId);
  const isTerminatedRef = useRef(isTerminated);
  const isLockedRef = useRef(isLocked);
  const violationsRef = useRef(violations);
  const activeWarningRef = useRef(activeWarning);

  // Deduplication & in-flight guards (1000ms debounce)
  const isHandlingIncidentRef = useRef(false);
  const lastIncidentTimestampRef = useRef(0);
  const isMountedRef = useRef(true);

  // Keep refs in sync
  useEffect(() => {
    teamIdRef.current = teamId;
    sessionIdRef.current = sessionId;
    isTerminatedRef.current = isTerminated;
    isLockedRef.current = isLocked;
    violationsRef.current = violations;
    activeWarningRef.current = activeWarning;
  }, [teamId, sessionId, isTerminated, isLocked, violations, activeWarning]);

  // Check authoritative session and admin override status from Supabase
  const checkSessionStatus = useCallback(async () => {
    const currentTeamId = teamIdRef.current;
    const currentSessionId = sessionIdRef.current;
    if (!currentTeamId && !currentSessionId) return null;

    try {
      if (currentSessionId) {
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('status, ended_at')
          .eq('id', currentSessionId)
          .maybeSingle();

        if (sessData && sessData.status === 'terminated') {
          setIsTerminated(true);
          return null;
        }
      }

      if (currentTeamId) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('status')
          .eq('id', currentTeamId)
          .maybeSingle();

        if (teamData && (teamData.status === 'disqualified' || teamData.status === 'terminated')) {
          setIsTerminated(true);
          return null;
        }
      }

      // Check for supervisor override unlock
      if (currentTeamId) {
        const { data: actionData } = await supabase
          .from('disciplinary_actions')
          .select('id, action, created_at')
          .eq('team_id', currentTeamId)
          .eq('action', 'override_unlock')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return actionData;
      }
      return null;
    } catch (err) {
      console.warn('[SECURITY] Failed to check session status:', err);
      return null;
    }
  }, []);

  // Sync initial violations from DB on load
  const loadLogs = useCallback(async () => {
    const currentTeamId = teamIdRef.current;
    const currentSessionId = sessionIdRef.current;
    if (!currentTeamId || !currentSessionId) return;

    try {
      const latestUnlockAction = await checkSessionStatus();

      const { data: logsData, error } = await supabase
        .from('security_logs')
        .select('id, event_type, created_at, admin_action, is_reviewed')
        .eq('team_id', currentTeamId)
        .order('created_at', { ascending: true });

      if (!error && logsData) {
        const rawCount = logsData.length;
        const cappedCount = Math.min(3, rawCount);
        setViolations(cappedCount);

        let isCurrentlyUnlocked = false;
        if (latestUnlockAction) {
          const unlockTime = new Date(latestUnlockAction.created_at).getTime();
          const logsAfterUnlock = logsData.filter(
            (l: any) => new Date(l.created_at).getTime() > unlockTime
          );

          if (logsAfterUnlock.length === 0) {
            isCurrentlyUnlocked = true;
          }
        }

        setIsAdminUnlocked(isCurrentlyUnlocked);

        const acknowledgedIds: string[] = JSON.parse(
          localStorage.getItem(`mystery_y_ack_logs_${currentSessionId}`) || '[]'
        );

        const unacknowledged = logsData.filter((log: any) => !acknowledgedIds.includes(log.id));

        if (rawCount >= 3) {
          if (isCurrentlyUnlocked) {
            setIsLocked(false);
            if (activeWarningRef.current === 'block') {
              setActiveWarning(null);
              isHandlingIncidentRef.current = false;
            }
          } else {
            setIsLocked(true);
            setActiveWarning('block');
            setLastEvent('MAXIMUM SECURITY ATTEMPTS REACHED (3/3)');
            isHandlingIncidentRef.current = true;
          }
        } else if (unacknowledged.length > 0 && !activeWarningRef.current) {
          const latestLog = unacknowledged[unacknowledged.length - 1];
          setLastEvent(mapEventTypeToLabel(latestLog.event_type));
          isHandlingIncidentRef.current = true;

          if (cappedCount === 1) {
            setActiveWarning('warn_1');
          } else if (cappedCount === 2) {
            setActiveWarning('warn_2');
          }
        }
      }
    } catch (err) {
      console.error('[SECURITY] Failed to sync security logs:', err);
    }
  }, [checkSessionStatus]);

  // Realtime & polling lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (teamId && sessionId) {
      loadLogs();
    }

    const channelName = `sec-monitor-${sessionId || 'active'}-${Date.now()}`;
    const secChannel = supabase
      .channel(channelName)
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

    // Fallback polling interval every 6s
    const pollInterval = setInterval(() => {
      if (teamIdRef.current && sessionIdRef.current) {
        loadLogs();
      }
    }, 6000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      supabase.removeChannel(secChannel);
    };
  }, [loadLogs, checkSessionStatus, teamId, sessionId]);

  // Centralized, authoritative security incident handler
  const handleSecurityIncident = async (
    eventType: string,
    severity: 'low' | 'medium' | 'high' = 'medium',
    clientEventId?: string
  ) => {
    const currentTeamId = teamIdRef.current;
    const currentSessionId = sessionIdRef.current;

    // Guard: Only monitor when an active team/session is loaded
    if (!currentTeamId || !currentSessionId) return;
    if (isTerminatedRef.current) return;

    // Deduplication check: drop duplicate events occurring within 1000ms
    const now = Date.now();
    if (isHandlingIncidentRef.current && activeWarningRef.current) {
      console.debug('[SECURITY] Dropped duplicate event (warning overlay already open):', eventType);
      return;
    }
    if (now - lastIncidentTimestampRef.current < 1000) {
      console.debug('[SECURITY] Dropped duplicate event within debounce window (<1000ms):', eventType);
      return;
    }

    lastIncidentTimestampRef.current = now;
    isHandlingIncidentRef.current = true;

    // Determine current attempt capped at 3
    const nextAttempt = Math.min(3, violationsRef.current + 1);

    // 1. Immediate optimistic UI feedback (zero delay popup for participant)
    const displayLabel = mapEventTypeToLabel(eventType);
    setLastEvent(displayLabel);
    setViolations(nextAttempt);

    if (nextAttempt === 1) {
      setActiveWarning('warn_1');
    } else if (nextAttempt === 2) {
      setActiveWarning('warn_2');
    } else {
      setActiveWarning('block');
      setIsLocked(true);
      setIsAdminUnlocked(false);
    }

    console.debug(`[SECURITY] Event detected: ${eventType} | Attempt: ${nextAttempt}/3`);

    const details: SecurityEventDetails = {
      event_type: eventType,
      attempt_number: nextAttempt,
      max_attempts: 3,
      route: window.location.pathname,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      visibility_state: document.visibilityState,
      fullscreen: !!document.fullscreenElement,
    };

    const eventId =
      clientEventId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);

    try {
      const insertPayload: any = {
        team_id: currentTeamId,
        session_id: currentSessionId,
        event_type: eventType,
        details,
        severity: nextAttempt >= 3 ? 'high' : severity,
        is_reviewed: false,
      };

      if (eventId) {
        insertPayload.client_event_id = eventId;
      }

      const { data: insertResult, error } = await supabase.from('security_logs').insert(insertPayload);
      if (error && !error.message.includes('unique') && !error.message.includes('duplicate')) {
        console.error('[SECURITY] Error inserting security log to Supabase:', error);
      } else {
        console.debug('[SECURITY] Successfully inserted log into Supabase security_logs');
      }

      // Reconcile authoritative count from Supabase
      const { data: allLogs } = await supabase
        .from('security_logs')
        .select('id, event_type')
        .eq('team_id', currentTeamId);

      if (allLogs) {
        const authoritativeCount = Math.min(3, allLogs.length);
        setViolations(authoritativeCount);
        if (authoritativeCount >= 3) {
          setIsLocked(true);
          setActiveWarning('block');
        }
      }

      if (onDisciplinaryAlert) {
        onDisciplinaryAlert(severity, `SECURITY INCIDENT: ${displayLabel} (${nextAttempt}/3)`);
      }
    } catch (err) {
      console.error('[SECURITY] Error logging security incident:', err);
    }
  };

  // Browser event listeners — attached once on mount
  useEffect(() => {
    // 1. Tab Switch (visibilitychange)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleSecurityIncident('tab_switch', 'medium');
      }
    };

    // 2. Window Blur (Application / focus switch, ignored if visibility is already hidden)
    const handleBlur = () => {
      if (document.visibilityState !== 'hidden') {
        handleSecurityIncident('window_blur', 'medium');
      }
    };

    // 3. Fullscreen Exit (fullscreenchange)
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
  }, []); // Stable listener registration

  // Dismiss modal overlay
  const dismissWarning = async () => {
    const currentTeamId = teamIdRef.current;
    const currentSessionId = sessionIdRef.current;

    if (activeWarningRef.current !== 'block') {
      try {
        if (currentTeamId && currentSessionId) {
          const { data } = await supabase
            .from('security_logs')
            .select('id')
            .eq('team_id', currentTeamId);

          if (data) {
            const currentAck: string[] = JSON.parse(
              localStorage.getItem(`mystery_y_ack_logs_${currentSessionId}`) || '[]'
            );
            const newAck = Array.from(new Set([...currentAck, ...data.map((l: any) => l.id)]));
            localStorage.setItem(`mystery_y_ack_logs_${currentSessionId}`, JSON.stringify(newAck));
          }
        }
      } catch (err) {
        console.error('[SECURITY] Failed to acknowledge warning:', err);
      }

      setActiveWarning(null);
      isHandlingIncidentRef.current = false;
    }
  };

  // Supervisor in-person PIN clearance override
  const handleAdminOverrideUnlock = async () => {
    const currentTeamId = teamIdRef.current;
    const currentSessionId = sessionIdRef.current;

    setIsLocked(false);
    setActiveWarning(null);
    setIsAdminUnlocked(true);
    isHandlingIncidentRef.current = false;

    try {
      if (currentSessionId) {
        await supabase
          .from('investigation_sessions')
          .update({ status: 'active' })
          .eq('id', currentSessionId);
      }

      if (currentTeamId) {
        await supabase.from('disciplinary_actions').insert({
          team_id: currentTeamId,
          session_id: currentSessionId,
          action: 'override_unlock',
          reason: 'Supervisor In-Person Clearance Override',
          created_by: 'b2ece65e-d728-4220-a40f-66f3234caeef',
        });
      }
    } catch (e) {
      console.warn('[SECURITY] Could not record override log:', e);
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
