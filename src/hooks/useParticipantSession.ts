import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
  const [team, setTeam] = useState<ParticipantTeam | null>(null);
  const [session, setSession] = useState<ParticipantSessionData | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setTeam(null);
    setSession(null);
    setCaseInfo(null);
    setSubmission(null);
    setError(null);
    localStorage.removeItem('mystery_y_team');
    localStorage.removeItem('mystery_y_session');
    localStorage.removeItem('mystery_y_team_id');
    localStorage.removeItem('mystery_y_session_id');
    localStorage.removeItem('mystery_y_submission_id');
    localStorage.removeItem('mystery_y_access_code_id');
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch non-sensitive session identifiers from storage
      const storedTeamStr = localStorage.getItem('mystery_y_team');
      const storedSessionStr = localStorage.getItem('mystery_y_session');
      const storedTeamId = localStorage.getItem('mystery_y_team_id');
      const storedSessionId = localStorage.getItem('mystery_y_session_id');

      let targetTeamId: string | null = null;
      let targetSessionId: string | null = null;

      if (storedTeamStr) {
        try {
          const parsed = JSON.parse(storedTeamStr);
          targetTeamId = parsed.id;
        } catch (e) {
          // Fallback to plain string id
          targetTeamId = storedTeamStr;
        }
      } else if (storedTeamId) {
        targetTeamId = storedTeamId;
      }

      if (storedSessionStr) {
        try {
          const parsed = JSON.parse(storedSessionStr);
          targetSessionId = parsed.id;
        } catch (e) {
          targetSessionId = storedSessionStr;
        }
      } else if (storedSessionId) {
        targetSessionId = storedSessionId;
      }

      if (!targetTeamId) {
        setTeam(null);
        setSession(null);
        setCaseInfo(null);
        setSubmission(null);
        setLoading(false);
        return;
      }

      // 2. Validate team against database
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, status, team_id_label, case_id')
        .eq('id', targetTeamId)
        .maybeSingle();

      if (teamErr || !teamData) {
        console.warn('Stale team session detected, clearing.');
        clearSession();
        setLoading(false);
        return;
      }

      if (teamData.status === 'disqualified') {
        setError('TEAM DISQUALIFIED BY ADMINISTRATOR');
        setTeam({
          id: teamData.id,
          name: teamData.name,
          team_id_label: teamData.team_id_label,
          case_id: teamData.case_id,
          status: 'disqualified',
        });
        setLoading(false);
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
      const { data: cData } = await supabase
        .from('cases')
        .select('*')
        .eq('id', activeTeam.case_id)
        .maybeSingle();

      if (cData) {
        setCaseInfo(cData as CaseData);
      }

      // 4. Validate or locate active session for this team & case
      let activeSession: ParticipantSessionData | null = null;

      if (targetSessionId) {
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status, team_id, case_id')
          .eq('id', targetSessionId)
          .maybeSingle();

        if (sessData) {
          activeSession = sessData as ParticipantSessionData;
        }
      }

      // Fallback: look up latest active session for team in DB
      if (!activeSession) {
        const { data: sessData } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status, team_id, case_id')
          .eq('team_id', activeTeam.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessData) {
          activeSession = sessData as ParticipantSessionData;
        }
      }

      if (activeSession) {
        setSession(activeSession);
        localStorage.setItem('mystery_y_session', JSON.stringify(activeSession));
        localStorage.setItem('mystery_y_session_id', activeSession.id);
      } else {
        setSession(null);
      }

      // 5. Check if submission exists for this team & case
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

    } catch (err: any) {
      console.error('Session restoration error:', err);
      setError(err.message || 'Failed to restore session');
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return {
    team,
    session,
    caseInfo,
    submission,
    loading,
    error,
    restoreSession,
    clearSession,
    setSession,
    setTeam,
  };
}
