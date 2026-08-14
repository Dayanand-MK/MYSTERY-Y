import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ParticipantTeam {
  id: string;
  name: string;
  team_id_label: string;
  case_id: string;
  status?: string;
}

export interface ParticipantSessionData {
  id: string;
  started_at: string;
  status: string;
  team_id: string;
  case_id: string;
}

export interface CaseData {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  video_path: string | null;
  briefing_media_type: 'none' | 'video' | 'audio';
  briefing_media_url: string | null;
  briefing_title: string;
  briefing_text: string | null;
  duration_limit: number;
  total_marks: number;
  status: string;
}

export interface SubmissionData {
  id: string;
  submission_id_label: string;
  started_at: string;
  submitted_at: string | null;
  duration: number | null;
  score: number | null;
  is_finalized: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 12_000;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useParticipantSession() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [team, setTeam] = useState<ParticipantTeam | null>(null);
  const [session, setSession] = useState<ParticipantSessionData | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Backward-compat alias: true while not yet ready
  const loading = status === 'idle' || status === 'loading';

  const restoreAttempt = useRef(0);

  // ── Clear everything ───────────────────────────────────────────────────────
  const clearSession = useCallback(() => {
    setTeam(null);
    setSession(null);
    setCaseInfo(null);
    setSubmission(null);
    setError(null);
    setStatus('idle');
    localStorage.removeItem('mystery_y_team');
    localStorage.removeItem('mystery_y_session');
    localStorage.removeItem('mystery_y_team_id');
    localStorage.removeItem('mystery_y_session_id');
    localStorage.removeItem('mystery_y_submission_id');
    localStorage.removeItem('mystery_y_access_code_id');
  }, []);

  // ── Main restore function ──────────────────────────────────────────────────
  const restoreSession = useCallback(async () => {
    const attemptId = ++restoreAttempt.current;
    console.debug('[MYSTERY-Y][SESSION] Starting session restoration, attempt', attemptId);
    setStatus('loading');
    setError(null);

    const doRestore = async () => {
      // ── Step 1: Read stored identifiers ─────────────────────────────────
      const storedTeamStr  = localStorage.getItem('mystery_y_team');
      const storedSessStr  = localStorage.getItem('mystery_y_session');
      const storedTeamId   = localStorage.getItem('mystery_y_team_id');
      const storedSessId   = localStorage.getItem('mystery_y_session_id');

      let targetTeamId: string | null = null;
      let targetSessId: string | null = null;

      if (storedTeamStr) {
        try { targetTeamId = JSON.parse(storedTeamStr).id; }
        catch { targetTeamId = storedTeamStr; }
      } else if (storedTeamId) {
        targetTeamId = storedTeamId;
      }

      if (storedSessStr) {
        try { targetSessId = JSON.parse(storedSessStr).id; }
        catch { targetSessId = storedSessStr; }
      } else if (storedSessId) {
        targetSessId = storedSessId;
      }

      // No team in storage → participant not registered
      if (!targetTeamId) {
        console.debug('[MYSTERY-Y][SESSION] No team in storage — not registered');
        setTeam(null);
        setSession(null);
        setCaseInfo(null);
        setSubmission(null);
        setStatus('ready'); // ready-with-nulls; redirect guards in pages handle this
        return;
      }

      // ── Step 2: Validate team ──────────────────────────────────────────
      console.debug('[MYSTERY-Y][SESSION] Querying team:', targetTeamId);
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, status, team_id_label, case_id')
        .eq('id', targetTeamId)
        .maybeSingle();

      if (teamErr || !teamData) {
        console.warn('[MYSTERY-Y][SESSION] Stale or missing team — clearing');
        clearSession();
        setStatus('ready');
        return;
      }

      if (teamData.status === 'disqualified') {
        console.warn('[MYSTERY-Y][SESSION] Team disqualified');
        const disqTeam: ParticipantTeam = {
          id: teamData.id, name: teamData.name,
          team_id_label: teamData.team_id_label,
          case_id: teamData.case_id, status: 'disqualified',
        };
        setTeam(disqTeam);
        setError('TEAM DISQUALIFIED BY ADMINISTRATOR');
        setStatus('error');
        return;
      }

      const activeTeam: ParticipantTeam = {
        id: teamData.id, name: teamData.name,
        team_id_label: teamData.team_id_label,
        case_id: teamData.case_id, status: teamData.status,
      };
      setTeam(activeTeam);
      localStorage.setItem('mystery_y_team', JSON.stringify(activeTeam));
      localStorage.setItem('mystery_y_team_id', activeTeam.id);

      // ── Step 3: Fetch case details ─────────────────────────────────────
      console.debug('[MYSTERY-Y][SESSION] Querying case:', activeTeam.case_id);
      const { data: cData } = await supabase
        .from('cases')
        .select('*')
        .eq('id', activeTeam.case_id)
        .maybeSingle();

      if (cData) setCaseInfo(cData as CaseData);

      // ── Step 4: Locate investigation session ───────────────────────────
      let activeSession: ParticipantSessionData | null = null;

      // Try the stored session ID first
      if (targetSessId) {
        console.debug('[MYSTERY-Y][SESSION] Looking up stored session:', targetSessId);
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status, team_id, case_id')
          .eq('id', targetSessId)
          .maybeSingle();
        if (sessData) activeSession = sessData as ParticipantSessionData;
      }

      // Fallback: latest session for this team
      if (!activeSession) {
        console.debug('[MYSTERY-Y][SESSION] Fallback: querying latest session for team');
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status, team_id, case_id')
          .eq('team_id', activeTeam.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessData) activeSession = sessData as ParticipantSessionData;
      }

      if (activeSession) {
        console.debug('[MYSTERY-Y][SESSION] Session found:', activeSession.id, '| status:', activeSession.status);
        setSession(activeSession);
        localStorage.setItem('mystery_y_session', JSON.stringify(activeSession));
        localStorage.setItem('mystery_y_session_id', activeSession.id);
      } else {
        console.debug('[MYSTERY-Y][SESSION] No session found for this team');
        setSession(null);
        localStorage.removeItem('mystery_y_session');
        localStorage.removeItem('mystery_y_session_id');
      }

      // ── Step 5: Locate submission ──────────────────────────────────────
      const storedSubId = localStorage.getItem('mystery_y_submission_id');

      let activeSub: SubmissionData | null = null;

      // Try stored submission id first
      if (storedSubId) {
        const { data: subData } = await supabase
          .from('submissions')
          .select('id, submission_id_label, started_at, submitted_at, duration, score, is_finalized')
          .eq('id', storedSubId)
          .maybeSingle();
        if (subData) activeSub = subData as SubmissionData;
      }

      // Fallback: query by team+case
      if (!activeSub) {
        const { data: subData } = await supabase
          .from('submissions')
          .select('id, submission_id_label, started_at, submitted_at, duration, score, is_finalized')
          .eq('team_id', activeTeam.id)
          .eq('case_id', activeTeam.case_id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subData) activeSub = subData as SubmissionData;
      }

      if (activeSub) {
        setSubmission(activeSub);
        localStorage.setItem('mystery_y_submission_id', activeSub.id);
        console.debug('[MYSTERY-Y][SESSION] Submission found:', activeSub.id);
      } else {
        setSubmission(null);
        console.debug('[MYSTERY-Y][SESSION] No submission found');
      }

      setStatus('ready');
      console.debug('[MYSTERY-Y][SESSION] Restoration complete — team:', activeTeam.id, '| session:', activeSession?.id ?? 'none');
    };

    // Race against a hard 12-second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Session restoration timed out. Please check your connection.')),
        SESSION_TIMEOUT_MS
      )
    );

    try {
      await Promise.race([doRestore(), timeoutPromise]);
    } catch (err: any) {
      if (restoreAttempt.current !== attemptId) return; // ignore stale attempt
      const msg: string = err?.message || 'Failed to restore investigation session';
      console.error('[MYSTERY-Y][SESSION] Error:', msg);
      setError(msg);
      setStatus('error');
    }
  }, [clearSession]);

  // Auto-run on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return {
    status,
    loading,          // backward-compat alias
    team,
    session,
    caseInfo,
    submission,
    error,
    restoreSession,
    clearSession,
    setSession,
    setTeam,
    setCaseInfo,
    setSubmission,
  };
}
