import { useState, useEffect, createContext, useContext } from 'react';
import { supabase, isMockMode } from '../lib/supabase';

const SUPER_ADMIN_UUID = '13d593a7-1f40-4583-9979-9d9db465c320';
const SUPER_ADMIN_EMAIL = 'vh13155_ml23@velhightech.com';

export interface AdminProfile {
  id: string;
  email: string;
  role: 'super_admin' | 'evaluator' | 'coordinator';
}

export interface ParticipantTeam {
  id: string;
  name: string;
  team_id_label: string;
  case_id: string;
}

export interface ParticipantSession {
  id: string;
  started_at: string;
  status: string;
}

interface AuthContextType {
  // Admin auth
  adminUser: AdminProfile | null;
  isSuperAdmin: boolean;
  isAdminLoading: boolean;
  adminError: string | null;
  adminLogin: (email: string, password: string) => Promise<boolean>;
  adminLogout: () => Promise<void>;

  // Participant auth/session
  currentTeam: ParticipantTeam | null;
  currentSession: ParticipantSession | null;
  isParticipantLoading: boolean;
  participantError: string | null;
  registerTeam: (eventName: string, teamName: string, memberNames: string[], accessCode: string) => Promise<boolean>;
  beginInvestigation: () => Promise<boolean>;
  participantLogout: () => void;
  syncParticipantSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [adminUser, setAdminUser] = useState<AdminProfile | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [currentTeam, setCurrentTeam] = useState<ParticipantTeam | null>(null);
  const [currentSession, setCurrentSession] = useState<ParticipantSession | null>(null);
  const [isParticipantLoading, setIsParticipantLoading] = useState(true);
  const [participantError, setParticipantError] = useState<string | null>(null);

  // Computed: Is the current admin user the Super Admin?
  const isSuperAdmin =
    adminUser?.id === SUPER_ADMIN_UUID &&
    adminUser?.email === SUPER_ADMIN_EMAIL &&
    adminUser?.role === 'super_admin';

  // Initialize and check current sessions on load
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, role, status')
            .eq('id', session.user.id)
            .single();

          if (mounted && profile && profile.status !== 'disabled') {
            setAdminUser(profile as AdminProfile);
          }
        }
      } catch (err) {
        console.error('Failed initial auth session check', err);
      } finally {
        if (mounted) {
          setIsAdminLoading(false);
        }
      }
    }

    initAuth();

    // Listen to real Supabase Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, email, role, status')
              .eq('id', session.user.id)
              .single();

            if (profile && profile.status !== 'disabled') {
              setAdminUser(profile as AdminProfile);
            } else {
              setAdminUser(null);
            }
          } catch (err) {
            console.error('Failed to fetch profile on auth state change', err);
          }
        } else {
          setAdminUser(null);
        }
        setIsAdminLoading(false);
      }
    );

    // Check Participant Session from Local Storage and verify against database
    syncParticipantSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const syncParticipantSession = async () => {
    setIsParticipantLoading(true);
    setParticipantError(null);
    try {
      const storedTeamStr    = localStorage.getItem('mystery_y_team');
      const storedSessionStr = localStorage.getItem('mystery_y_session');

      if (!storedTeamStr) {
        setCurrentTeam(null);
        setCurrentSession(null);
        return;
      }

      const team = JSON.parse(storedTeamStr) as ParticipantTeam;

      // ── Verify team against DB ─────────────────────────────────────────────
      // Use maybeSingle() so zero rows returns null (not an error)
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, status, team_id_label, case_id')
        .eq('id', team.id)
        .maybeSingle();

      if (teamErr) {
        // DB error (e.g. RLS, network) — trust localStorage, do not clear
        console.warn('[MYSTERY-Y][SYNC] Team DB query failed (RLS/network), trusting localStorage:', teamErr.message);
        setCurrentTeam(team);
      } else if (!teamData) {
        // Row genuinely missing → stale localStorage, log out
        console.warn('[MYSTERY-Y][SYNC] Team not found in DB — clearing session');
        participantLogout();
        return;
      } else {
        // Row found — sync from DB
        const freshTeam: ParticipantTeam = {
          id: teamData.id,
          name: teamData.name,
          team_id_label: teamData.team_id_label,
          case_id: teamData.case_id,
        };
        if (teamData.status === 'disqualified') {
          setParticipantError('TEAM DISQUALIFIED BY ADMINISTRATOR');
          setCurrentTeam({ ...freshTeam } as any);
          return;
        }
        setCurrentTeam(freshTeam);
        localStorage.setItem('mystery_y_team', JSON.stringify(freshTeam));
      }

      // ── Verify session against DB ──────────────────────────────────────────
      if (storedSessionStr) {
        const session = JSON.parse(storedSessionStr) as ParticipantSession;

        const { data: sessionData, error: sessionErr } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status')
          .eq('id', session.id)
          .maybeSingle();

        if (sessionErr) {
          // DB error (RLS/network) — trust localStorage copy rather than
          // clearing the session and causing a redirect loop
          console.warn('[MYSTERY-Y][SYNC] Session DB query failed (RLS/network), trusting localStorage:', sessionErr.message);
          setCurrentSession(session);
        } else if (sessionData) {
          // Confirmed from DB
          const freshSession: ParticipantSession = {
            id: sessionData.id,
            started_at: sessionData.started_at,
            status: sessionData.status,
          };
          setCurrentSession(freshSession);
          localStorage.setItem('mystery_y_session', JSON.stringify(freshSession));
        } else {
          // Session genuinely not in DB
          console.warn('[MYSTERY-Y][SYNC] Session not found in DB — will trust localStorage started_at for timer');
          // Still set it from localStorage so Investigation can render
          // (it may have been written by beginInvestigation before RLS index updated)
          setCurrentSession(session);
        }
      } else {
        setCurrentSession(null);
      }
    } catch (err) {
      console.error('[MYSTERY-Y][SYNC] Unexpected error syncing participant session:', err);
      // On unexpected error: restore from localStorage so the participant
      // doesn't get stuck on a redirect loop
      try {
        const storedTeamStr    = localStorage.getItem('mystery_y_team');
        const storedSessionStr = localStorage.getItem('mystery_y_session');
        if (storedTeamStr) setCurrentTeam(JSON.parse(storedTeamStr) as ParticipantTeam);
        if (storedSessionStr) setCurrentSession(JSON.parse(storedSessionStr) as ParticipantSession);
      } catch {}
    } finally {
      setIsParticipantLoading(false);
    }
  };

  // Admin login
  const adminLogin = async (email: string, password: string): Promise<boolean> => {
    setIsAdminLoading(true);
    setAdminError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAdminError(error.message);
        return false;
      }

      // Fetch role profile — select status too to check for disabled accounts
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, status')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        setAdminError('ACCESS DENIED: No administrator profile found for this account.');
        await supabase.auth.signOut();
        return false;
      }

      // Block disabled accounts
      if ((profile as any).status === 'disabled') {
        setAdminError('ACCESS DENIED: This administrator account has been disabled.');
        await supabase.auth.signOut();
        return false;
      }

      setAdminUser(profile as AdminProfile);
      return true;
    } catch (err: any) {
      setAdminError(err.message || 'An error occurred during admin login');
      return false;
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Admin logout
  const adminLogout = async () => {
    setIsAdminLoading(true);
    try {
      await supabase.auth.signOut();
      setAdminUser(null);
    } catch (err) {
      console.error('Failed to log out admin', err);
    } finally {
      setIsAdminLoading(false);
    }
  };

  // Participant Registration: secure RPC registration
  const registerTeam = async (
    eventName: string,
    teamName: string,
    memberNames: string[],
    accessCode: string
  ): Promise<boolean> => {
    setIsParticipantLoading(true);
    setParticipantError(null);
    try {
      // 1. Fetch Event ID based on Name (with fallback to first open event)
      let targetEvent: { id: string; status: string } | null = null;

      const { data: eventByName } = await supabase
        .from('events')
        .select('id, status')
        .eq('name', eventName)
        .maybeSingle();

      if (eventByName) {
        targetEvent = eventByName;
      } else {
        const { data: openEvents } = await supabase
          .from('events')
          .select('id, status')
          .eq('status', 'open')
          .limit(1);

        if (openEvents && openEvents.length > 0) {
          targetEvent = openEvents[0];
        }
      }

      if (!targetEvent) {
        setParticipantError('EVENT NOT FOUND OR CLOSED');
        return false;
      }

      if (targetEvent.status === 'paused') {
        setParticipantError('REGISTRATIONS ARE TEMPORARILY PAUSED');
        return false;
      } else if (targetEvent.status === 'closed') {
        setParticipantError('REGISTRATIONS ARE CLOSED');
        return false;
      }

      // 2. Execute RPC secure registration
      const { data, error } = await supabase.rpc('register_team_transaction', {
        p_event_id: targetEvent.id,
        p_name: teamName.trim(),
        p_member_names: memberNames.filter(m => m.trim().length > 0),
        p_access_code: accessCode.trim()
      });

      if (error) {
        setParticipantError(error.message);
        return false;
      }

      if (data && !data.success) {
        setParticipantError(data.error);
        return false;
      }

      const teamInfo: ParticipantTeam = {
        id: data.team_id,
        name: teamName,
        team_id_label: data.team_id_label,
        case_id: data.case_id,
      };

      setCurrentTeam(teamInfo);
      localStorage.setItem('mystery_y_team', JSON.stringify(teamInfo));
      localStorage.setItem('mystery_y_team_id', teamInfo.id);
      localStorage.setItem('mystery_y_access_code_id', data.access_code_id);
      return true;
    } catch (err: any) {
      setParticipantError(err.message || 'Team registration failed');
      return false;
    } finally {
      setIsParticipantLoading(false);
    }
  };

  // Start Investigation Session — tries RPC first, falls back to direct table queries
  const beginInvestigation = async (): Promise<boolean> => {
    if (!currentTeam) {
      console.warn('[MYSTERY Y][BEGIN] No currentTeam — aborting');
      return false;
    }
    setIsParticipantLoading(true);
    setParticipantError(null);
    try {
      const codeId = localStorage.getItem('mystery_y_access_code_id') || '';
      console.debug('[MYSTERY Y][BEGIN] Attempting RPC begin_investigation_transaction for team:', currentTeam.id);

      const { data: rpcData, error: rpcError } = await supabase.rpc('begin_investigation_transaction', {
        p_team_id: currentTeam.id,
        p_case_id: currentTeam.case_id,
        p_code_id: codeId
      });

      // ── RPC succeeded ──────────────────────────────────────────────────────
      if (!rpcError && rpcData) {
        if (!rpcData.success) {
          console.warn('[MYSTERY Y][BEGIN] RPC returned failure:', rpcData.error);
          setParticipantError(rpcData.error || 'Investigation could not be started');
          return false;
        }

        const sessionInfo: ParticipantSession = {
          id: rpcData.session_id,
          started_at: rpcData.started_at,
          status: rpcData.status || 'active',
        };
        console.debug('[MYSTERY Y][BEGIN] RPC success — session:', sessionInfo.id);
        setCurrentSession(sessionInfo);
        localStorage.setItem('mystery_y_session', JSON.stringify(sessionInfo));
        localStorage.setItem('mystery_y_session_id', sessionInfo.id);
        return true;
      }

      // ── RPC missing or failed — fallback to direct table queries ─────────
      console.warn('[MYSTERY Y][BEGIN] RPC error or missing, using direct fallback. RPC error:', rpcError?.message);

      // Step 1: Check for an existing investigation session for this team
      const { data: existingSess, error: sessQueryErr } = await supabase
        .from('investigation_sessions')
        .select('id, started_at, status, team_id, case_id')
        .eq('team_id', currentTeam.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessQueryErr) {
        console.error('[MYSTERY Y][BEGIN] Failed to query existing sessions:', sessQueryErr.message);
        setParticipantError('Failed to verify investigation session: ' + sessQueryErr.message);
        return false;
      }

      let activeSession = existingSess;

      // Step 2: If no session, create one
      if (!activeSession) {
        console.debug('[MYSTERY Y][BEGIN] No existing session — creating new investigation_sessions row');
        const { data: newSess, error: insertSessErr } = await supabase
          .from('investigation_sessions')
          .insert({
            team_id: currentTeam.id,
            case_id: currentTeam.case_id,
            status: 'active',
            started_at: new Date().toISOString(),
          })
          .select('id, started_at, status, team_id, case_id')
          .single();

        if (insertSessErr || !newSess) {
          console.error('[MYSTERY Y][BEGIN] Failed to create session:', insertSessErr?.message);
          setParticipantError('Failed to create investigation session: ' + (insertSessErr?.message || 'Unknown error'));
          return false;
        }
        activeSession = newSess;
        console.debug('[MYSTERY Y][BEGIN] Created session:', activeSession.id);

        // Mark access code as used (best-effort)
        if (codeId) {
          await supabase
            .from('case_access_codes')
            .update({ status: 'used', team_id: currentTeam.id })
            .eq('id', codeId);
        }

        // Mark team status as active (best-effort)
        await supabase
          .from('teams')
          .update({ status: 'active' })
          .eq('id', currentTeam.id);
      } else {
        console.debug('[MYSTERY Y][BEGIN] Reusing existing session:', activeSession.id);
      }

      // Step 3: Ensure a submission row exists
      const { data: existingSub } = await supabase
        .from('submissions')
        .select('id')
        .eq('team_id', currentTeam.id)
        .eq('case_id', currentTeam.case_id)
        .maybeSingle();

      if (!existingSub) {
        console.debug('[MYSTERY Y][BEGIN] Creating submissions row');
        const { data: newSub, error: subErr } = await supabase
          .from('submissions')
          .insert({
            team_id: currentTeam.id,
            case_id: currentTeam.case_id,
            session_id: activeSession.id,
            started_at: activeSession.started_at,
          })
          .select('id')
          .single();

        if (newSub) {
          localStorage.setItem('mystery_y_submission_id', newSub.id);
          console.debug('[MYSTERY Y][BEGIN] Submission created:', newSub.id);
        } else {
          console.warn('[MYSTERY Y][BEGIN] Submission creation failed (non-fatal):', subErr?.message);
        }
      } else {
        localStorage.setItem('mystery_y_submission_id', existingSub.id);
        console.debug('[MYSTERY Y][BEGIN] Existing submission found:', existingSub.id);
      }

      const sessionInfo: ParticipantSession = {
        id: activeSession.id,
        started_at: activeSession.started_at,
        status: activeSession.status || 'active',
      };

      setCurrentSession(sessionInfo);
      localStorage.setItem('mystery_y_session', JSON.stringify(sessionInfo));
      localStorage.setItem('mystery_y_session_id', sessionInfo.id);
      console.debug('[MYSTERY Y][BEGIN] Investigation started via fallback — session:', sessionInfo.id);
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Failed to start investigation';
      console.error('[MYSTERY Y][BEGIN] Unexpected error:', msg);
      setParticipantError(msg);
      return false;
    } finally {
      setIsParticipantLoading(false);
    }
  };

  const participantLogout = () => {
    setCurrentTeam(null);
    setCurrentSession(null);
    setParticipantError(null);
    localStorage.removeItem('mystery_y_team');
    localStorage.removeItem('mystery_y_session');
    localStorage.removeItem('mystery_y_team_id');
    localStorage.removeItem('mystery_y_session_id');
    localStorage.removeItem('mystery_y_submission_id');
    localStorage.removeItem('mystery_y_access_code_id');
  };

  return (
    <AuthContext.Provider
      value={{
        adminUser,
        isSuperAdmin,
        isAdminLoading,
        adminError,
        adminLogin,
        adminLogout,
        currentTeam,
        currentSession,
        isParticipantLoading,
        participantError,
        registerTeam,
        beginInvestigation,
        participantLogout,
        syncParticipantSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
