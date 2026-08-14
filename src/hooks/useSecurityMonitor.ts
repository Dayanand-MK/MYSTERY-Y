import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type WarningType = 'warn_1' | 'warn_2' | 'block';
type SecurityEventType = 'TAB_SWITCH' | 'WINDOW_BLUR' | 'COPY_ATTEMPT' | 'PASTE_ATTEMPT' | 'CUT_ATTEMPT' | 'CONTEXT_MENU' | 'FULLSCREEN_EXIT' | 'MULTIPLE_SESSION';
const MAX_VIOLATIONS = 3;

export const mapEventTypeToLabel = (type: string) => ({
  TAB_SWITCH: 'TAB SWITCH DETECTED', WINDOW_BLUR: 'WINDOW / APPLICATION SWITCH DETECTED',
  COPY_ATTEMPT: 'COPY ATTEMPT DETECTED', PASTE_ATTEMPT: 'PASTE ATTEMPT DETECTED',
  CUT_ATTEMPT: 'CUT ATTEMPT DETECTED', CONTEXT_MENU: 'CONTEXT MENU ATTEMPT DETECTED',
  FULLSCREEN_EXIT: 'FULLSCREEN EXIT DETECTED', MULTIPLE_SESSION: 'MULTIPLE SESSION DETECTED',
}[type.toUpperCase()] || 'SECURITY EVENT DETECTED');

/** Listeners become effective only after an active investigation enters fullscreen. */
export function useSecurityMonitor(teamId: string | null | undefined, sessionId: string | null | undefined, fullscreenMonitoringActive: boolean) {
  const [violations, setViolations] = useState(0);
  const [activeWarning, setActiveWarning] = useState<WarningType | null>(null);
  const [lastEvent, setLastEvent] = useState('TAB SWITCH DETECTED');
  const [isLocked, setIsLocked] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const contextRef = useRef({ teamId, sessionId, fullscreenMonitoringActive });
  const inFlightRef = useRef(false);
  const lastEventAtRef = useRef(0);
  const fullscreenWasActiveRef = useRef(false);
  const wasLockedRef = useRef(false);
  const trackedSessionRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    contextRef.current = { teamId, sessionId, fullscreenMonitoringActive };
    if (trackedSessionRef.current !== sessionId) {
      trackedSessionRef.current = sessionId;
      fullscreenWasActiveRef.current = false;
      wasLockedRef.current = false;
      setViolations(0);
      setIsLocked(false);
      setActiveWarning(null);
      setSessionRestored(false);
    }
    // Do not assume fullscreen is active just because monitoring is active.
    // Only a real browser fullscreen state can arm an exit violation.
    if (fullscreenMonitoringActive && document.fullscreenElement) fullscreenWasActiveRef.current = true;
  }, [teamId, sessionId, fullscreenMonitoringActive]);

  const applyResult = useCallback((result: any) => {
    const attempt = Number(result.attempt_number);
    const locked = Boolean(result.locked) || attempt >= MAX_VIOLATIONS;
    setViolations(Math.min(MAX_VIOLATIONS, attempt));
    setLastEvent(mapEventTypeToLabel(result.event_type));
    setIsLocked(locked);
    setActiveWarning(locked ? 'block' : attempt === 1 ? 'warn_1' : 'warn_2');
    console.debug('[SECURITY DEBUG] RPC success');
    console.debug(`[SECURITY DEBUG] Attempt: ${attempt}/${MAX_VIOLATIONS}`);
    console.debug('[SECURITY DEBUG] Warning opened');
  }, []);

  const loadSecurityState = useCallback(async () => {
    const { sessionId: currentSessionId } = contextRef.current;
    if (!currentSessionId) return;
    const [logsResult, sessionResult] = await Promise.all([
      supabase.from('security_logs').select('id').eq('session_id', currentSessionId),
      supabase.from('investigation_sessions').select('status').eq('id', currentSessionId).maybeSingle(),
    ]);
    if (logsResult.error || sessionResult.error) return console.error('[SECURITY ERROR] Unable to load security state.', logsResult.error || sessionResult.error);
    const count = logsResult.data?.length || 0;
    const locked = sessionResult.data?.status === 'locked';
    setViolations(Math.min(MAX_VIOLATIONS, count));
    setIsLocked(locked);
    if (wasLockedRef.current && !locked && sessionResult.data?.status === 'active') {
      setActiveWarning(null);
      setSessionRestored(true);
    }
    wasLockedRef.current = locked;
  }, []);

  const recordSecurityViolation = useCallback(async (eventType: SecurityEventType) => {
    const { teamId: currentTeamId, sessionId: currentSessionId, fullscreenMonitoringActive: monitoring } = contextRef.current;
    if (!currentTeamId || !currentSessionId || !monitoring || isLocked) return;
    const now = Date.now();
    if (inFlightRef.current || now - lastEventAtRef.current < 750) return console.debug('[SECURITY DEBUG] Duplicate candidate ignored:', eventType);
    inFlightRef.current = true;
    lastEventAtRef.current = now;
    console.debug('[SECURITY DEBUG] Recording violation...');
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user && !localStorage.getItem('mystery_y_sim_teams')) console.error('[SECURITY ERROR] Unable to resolve participant session: authenticated user is null.');
      const { data, error } = await supabase.rpc('record_security_violation', {
        p_team_id: currentTeamId, p_session_id: currentSessionId, p_event_type: eventType,
        p_client_event_id: crypto.randomUUID(),
        p_details: { route: window.location.pathname, timestamp: new Date().toISOString(), user_agent: navigator.userAgent, visibility_state: document.visibilityState, fullscreen: Boolean(document.fullscreenElement) },
      });
      if (error || !data?.success) return console.error('[SECURITY ERROR]', error || data?.error || 'Security violation was not recorded.');
      applyResult(data);
    } catch (error) {
      console.error('[SECURITY ERROR]', error);
    } finally { inFlightRef.current = false; }
  }, [applyResult, isLocked]);

  useEffect(() => {
    console.debug('[SECURITY DEBUG] Monitor mounted');
    console.debug('[SECURITY DEBUG] Investigation active:', Boolean(teamId && sessionId));
    console.debug('[SECURITY DEBUG] Fullscreen monitoring active:', fullscreenMonitoringActive);
  }, [teamId, sessionId, fullscreenMonitoringActive]);

  useEffect(() => {
    const onVisibilityChange = () => {
      console.debug(`[SECURITY DEBUG] visibilitychange: ${document.visibilityState}`);
      if (document.visibilityState === 'hidden') { console.debug('[SECURITY DEBUG] Candidate event: TAB_SWITCH'); void recordSecurityViolation('TAB_SWITCH'); }
    };
    const onBlur = () => window.setTimeout(() => {
      if (document.visibilityState === 'visible') { console.debug('[SECURITY DEBUG] Blur detected'); console.debug('[SECURITY DEBUG] Candidate event: WINDOW_BLUR'); void recordSecurityViolation('WINDOW_BLUR'); }
    }, 80);
    const onFullscreenChange = () => {
      const fullscreenActive = Boolean(document.fullscreenElement);
      const wasFullscreen = fullscreenWasActiveRef.current;
      console.debug('[SECURITY DEBUG] Fullscreen change detected');
      console.debug('[SECURITY DEBUG] Fullscreen state:', fullscreenActive);
      if (fullscreenActive) {
        fullscreenWasActiveRef.current = true;
        return;
      }
      // Clear before the async RPC starts so duplicate fullscreenchange events
      // for the same exit cannot create another log or warning.
      fullscreenWasActiveRef.current = false;
      if (wasFullscreen) { console.debug('[SECURITY DEBUG] Candidate event: FULLSCREEN_EXIT'); void recordSecurityViolation('FULLSCREEN_EXIT'); }
    };
    const onCopy = (event: ClipboardEvent) => { event.preventDefault(); void recordSecurityViolation('COPY_ATTEMPT'); };
    const onPaste = (event: ClipboardEvent) => { event.preventDefault(); void recordSecurityViolation('PASTE_ATTEMPT'); };
    const onCut = (event: ClipboardEvent) => { event.preventDefault(); void recordSecurityViolation('CUT_ATTEMPT'); };
    const onContextMenu = (event: MouseEvent) => { event.preventDefault(); void recordSecurityViolation('CONTEXT_MENU'); };
    document.addEventListener('visibilitychange', onVisibilityChange); window.addEventListener('blur', onBlur); document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy); document.addEventListener('paste', onPaste); document.addEventListener('cut', onCut); document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange); window.removeEventListener('blur', onBlur); document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy); document.removeEventListener('paste', onPaste); document.removeEventListener('cut', onCut); document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [recordSecurityViolation]);

  useEffect(() => {
    void loadSecurityState();
    const channel = supabase.channel(`security-monitor-${sessionId || 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_logs', filter: `session_id=eq.${sessionId}` }, loadSecurityState)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'investigation_sessions', filter: `id=eq.${sessionId}` }, loadSecurityState)
      .subscribe();
    const poll = window.setInterval(loadSecurityState, 6000);
    return () => { window.clearInterval(poll); supabase.removeChannel(channel); };
  }, [loadSecurityState, sessionId]);

  return { violations, activeWarning, lastEvent, isLocked, isTerminated: false, sessionRestored, dismissWarning: () => { if (!isLocked) setActiveWarning(null); }, dismissSessionRestored: () => setSessionRestored(false), recordSecurityViolation };
}
