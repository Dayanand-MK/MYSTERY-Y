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
      const storedTeamStr = localStorage.getItem('mystery_y_team');
      const storedSessionStr = localStorage.getItem('mystery_y_session');

      if (!storedTeamStr) {
        setCurrentTeam(null);
        setCurrentSession(null);
        return;
      }

      const team = JSON.parse(storedTeamStr) as ParticipantTeam;
      setCurrentTeam(team);

      // Verify the team still exists and check its status in database
      const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, status, team_id_label, case_id')
        .eq('id', team.id)
        .single();

      if (teamErr || !teamData) {
        // Discrepancy, clear local storage
        participantLogout();
        return;
      }

      // If team is disqualified, flag, or submitted, keep state synced
      if (teamData.status === 'disqualified') {
        setParticipantError('TEAM DISQUALIFIED BY ADMINISTRATOR');
        setCurrentTeam({ ...team, status: 'disqualified' } as any);
        return;
      }

      if (storedSessionStr) {
        const session = JSON.parse(storedSessionStr) as ParticipantSession;
        // Verify active session against DB
        const { data: sessionData, error: sessionErr } = await supabase
          .from('investigation_sessions')
          .select('id, started_at, status')
          .eq('id', session.id)
          .single();

        if (!sessionErr && sessionData) {
          setCurrentSession(sessionData as ParticipantSession);
          localStorage.setItem('mystery_y_session', JSON.stringify(sessionData));
        } else {
          setCurrentSession(null);
          localStorage.removeItem('mystery_y_session');
        }
      }
    } catch (err) {
      console.error('Error syncing participant session', err);
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

  // Start Investigation Session (RPC transaction check)
  const beginInvestigation = async (): Promise<boolean> => {
    if (!currentTeam) return false;
    setIsParticipantLoading(true);
    setParticipantError(null);
    try {
      const codeId = localStorage.getItem('mystery_y_access_code_id') || '';

      const { data, error } = await supabase.rpc('begin_investigation_transaction', {
        p_team_id: currentTeam.id,
        p_case_id: currentTeam.case_id,
        p_code_id: codeId
      });

      if (error) {
        setParticipantError(error.message);
        return false;
      }

      if (data && !data.success) {
        setParticipantError(data.error);
        return false;
      }

      const sessionInfo: ParticipantSession = {
        id: data.session_id,
        started_at: data.started_at,
        status: data.status,
      };

      setCurrentSession(sessionInfo);
      localStorage.setItem('mystery_y_session', JSON.stringify(sessionInfo));
      localStorage.setItem('mystery_y_session_id', sessionInfo.id);
      return true;
    } catch (err: any) {
      setParticipantError(err.message || 'Failed to start investigation');
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
