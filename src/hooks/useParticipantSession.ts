import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export type SessionStatus = 'idle' | 'loading' | 'ready' | 'error';

const SESSION_TIMEOUT_MS = 12_000;

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
  submitted_at: string;
  duration: number;
  score: number;
  is_finalized: boolean;
}

export function useParticipantSession() {
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [team, setTeam] = useState<ParticipantTeam | null>(null);
  const [session, setSession] = useState<ParticipantSessionData | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kept for backward compat — mirrors status === 'loading'
  const loading = status === 'loading' || status === 'idle';

  const restoreAttempt = useRef(0);

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

  const restoreSession = useCallback(async () => {
    const attemptId = ++restoreAttempt.current;
    console.debug('[MYSTERY Y][SESSION] Starting session restoration, attempt', attemptId);
    setStatus('loading');
    setError(null);

    const doRestore = async () => {
      // 1. Read non-sensitive identifiers from storage
      const storedTeamStr = localStorage.getItem('mystery_y_team');
      const storedSessionStr = localStorage.getItem('mystery_y_session');
      const storedTeamId = localStorage.getItem('mystery_y_team_id');
      const storedSessionId = localStorage.getItem('mystery_y_session_id');

      let targetTeamId: string | null = null;
      let targetSessionId: string | null = null;

      if (storedTeamStr) {
        try { targetTeamId = JSON.parse(storedTeamStr).id; } catch { targetTeamId = storedTeamStr; }
      } else if (storedTeamId) {
        targetTeamId = storedTeamId;
      }

      if (storedSessionStr) {
        try { targetSessionId = JSON.parse(storedSessionStr).id; } catch { targetSessionId = storedSessionStr; }
      } else if (storedSessionId) {
        targetSessionId = storedSessionId;
      }

      if (!targetTeamId) {
        console.debug('[MYSTERY Y][SESSION] No stored team ID — participant not registered');
        setTeam(null);
        setSession(null);
        setCaseInfo(null);
        setSubmission(null);
        setStatus('ready'); // ready with nulls → redirect guards handle this
        return;
      }

      // 2. Validate team against database
      console.debug('[MYSTERY Y][SESSION] Querying team:', targetTeamId);
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, status, team_id_label, case_id')
        .eq('id', targetTeamId)
        .maybeSingle();

      if (teamErr || !teamData) {
        console.warn('[MYSTERY Y][SESSION] Stale or missing team — clearing session');
        clearSession();
        setStatus('ready');
        return;
      }

      if (teamData.status === 'disqualified') {
        console.warn('[MYSTERY Y][SESSION] Team is disqualified');
        setError('TEAM DISQUALIFIED BY ADMINISTRATOR');
        setTeam({ id: teamData.id, name: teamData.name, team_id_label: teamData.team_id_label, case_id: teamData.case_id, status: 'disqualified' });
        setStatus('error');
        return;
      }

      const activeTeam: ParticipantTeam = {
        id: teamData.id,
        name: teamData.name,
        team_id_label: teamData.team_id_label,
        case_id: teamData.case_id,
        status: teamData.status,
      };

      setTeam(activeTeam);
      localStorage.setItem('mystery_y_team', JSON.stringify(activeTeam));
      localStorage.setItem('mystery_y_team_id', activeTeam.id);

      // 3. Fetch Case Details
      console.debug('[MYSTERY Y][SESSION] Querying case:', activeTeam.case_id);
      const { data: cData } = await supabase
        .from('cases')
        .select('*')
        .eq('id', activeTeam.case_id)
        .maybeSingle();

      if (cData) setCaseInfo(cData as CaseData);

      // 4. Validate / locate active investigation session
      let activeSession: ParticipantSessionData | null = null;

      if (targetSessionId) {
        console.debug('[MYSTERY Y][SESSION] Querying stored session:', targetSessionId);
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status, team_id, case_id')
          .eq('id', targetSessionId)
          .maybeSingle();

        if (sessData) activeSession = sessData as ParticipantSessionData;
      }

      // Fallback: latest session for this team
      if (!activeSession) {
        console.debug('[MYSTERY Y][SESSION] Falling back to latest session for team');
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
        console.debug('[MYSTERY Y][SESSION] Session found:', activeSession.id);
        setSession(activeSession);
        localStorage.setItem('mystery_y_session', JSON.stringify(activeSession));
        localStorage.setItem('mystery_y_session_id', activeSession.id);
      } else {
        console.debug('[MYSTERY Y][SESSION] No active session found');
        setSession(null);
      }

      // 5. Check submission
      const { data: subData } = await supabase
        .from('submissions')
        .select('id, submission_id_label, started_at, submitted_at, duration, score, is_finalized')
        .eq('team_id', activeTeam.id)
        .eq('case_id', activeTeam.case_id)
        .maybeSingle();

      if (subData) {
        setSubmission(subData as SubmissionData);
        localStorage.setItem('mystery_y_submission_id', subData.id);
      } else {
        setSubmission(null);
      }

      setStatus('ready');
      console.debug('[MYSTERY Y][SESSION] Restoration complete — status: ready');
    };

    // Race restore logic against a 12-second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session restoration timed out after 12 seconds')), SESSION_TIMEOUT_MS)
    );

    try {
      await Promise.race([doRestore(), timeoutPromise]);
    } catch (err: any) {
      if (restoreAttempt.current !== attemptId) return; // stale attempt
      const msg = err?.message || 'Failed to restore session';
      console.error('[MYSTERY Y][SESSION] Restoration failed:', msg);
      setError(msg);
      setStatus('error');
    }
  }, [clearSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return {
    status,
    team,
    session,
    caseInfo,
    submission,
    loading, // backward compat alias
    error,
    restoreSession,
    clearSession,
    setSession,
    setTeam,
  };
}
