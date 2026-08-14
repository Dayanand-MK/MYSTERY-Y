import { createClient } from '@supabase/supabase-js';

// Detect Supabase environment variables
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isRealConfigured =
  envUrl &&
  envKey &&
  envUrl.startsWith('https://') &&
  !envUrl.includes('YOUR_PROJECT_REF') &&
  envKey.length > 50;

export const isMockMode = !isRealConfigured;
const supabaseUrl = envUrl || '';
const supabaseAnonKey = envKey || '';

if (isMockMode) {
  console.warn('Mystery Y operating in Forced Local Storage Mode (No remote Supabase connection detected/configured).');
} else {
  console.log('Mystery Y connected to Supabase successfully.');
}

// -------------------------------------------------------------------------
// REAL SUPABASE CLIENT
// -------------------------------------------------------------------------
const realSupabase = !isMockMode ? createClient(supabaseUrl, supabaseAnonKey) : null;

// -------------------------------------------------------------------------
// LOCAL STORAGE SIMULATION ENGINE FOR DEVELOPMENT
// -------------------------------------------------------------------------
class LocalDB {
  private getStorage<T>(key: string, defaultValue: T): T {
    const val = localStorage.getItem(`mystery_y_sim_${key}`);
    return val ? JSON.parse(val) : defaultValue;
  }

  private setStorage<T>(key: string, value: T): void {
    localStorage.setItem(`mystery_y_sim_${key}`, JSON.stringify(value));
  }

  // Seed default data
  initializeSeed() {
    const events = this.getStorage<any[]>('events', []);
    if (events.length === 0) {
      console.log('Seeding simulation database in localStorage...');
      // 1. Create Event
      const demoEvent = {
        id: 'evt-2026-demo-uuid',
        name: 'Mystery Y Symposium 2026',
        year: 2026,
        status: 'open',
        created_at: new Date().toISOString()
      };
      this.setStorage('events', [demoEvent]);

      // 2. Create Profiles
      const adminProfiles = [
        { id: 'b2ece65e-d728-4220-a40f-66f3234caeef', email: 'vh13155_ml23@velhightech.com', role: 'super_admin', status: 'active', name: 'Primary Super Admin', created_at: new Date().toISOString() },
        { id: 'usr-admin-uuid', email: 'admin@college.edu', role: 'coordinator', status: 'active', name: 'Admin Coordinator', created_at: new Date().toISOString() },
        { id: 'usr-eval-uuid', email: 'eval@college.edu', role: 'evaluator', status: 'active', name: 'Incident Evaluator', created_at: new Date().toISOString() },
        { id: 'usr-coord-uuid', email: 'coord@college.edu', role: 'coordinator', status: 'active', name: 'Event Coordinator', created_at: new Date().toISOString() }
      ];
      this.setStorage('profiles', adminProfiles);

      // 3. Create Case
      const demoCase = {
        id: 'case-demo-uuid',
        event_id: 'evt-2026-demo-uuid',
        case_number: 'MY-DEMO-01',
        title: 'The Missing Evidence',
        description: 'An investigation into a high-security vault breach. Clear the suspicion, examine the digital logs, CCTV timing discrepancies, and verify who tampered with Case File 1.',
        video_path: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        briefing_media_type: 'video',
        briefing_media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        briefing_title: 'Case Briefing',
        briefing_text: 'Welcome, Investigation Team.\n\nYou have been assigned this case for independent investigation.\n\nReview the physical case file carefully. Examine the statements, records, evidence and timeline.\n\nYour task is not simply to identify a suspect. Reconstruct what you believe happened and support your conclusion using evidence from the case file.\n\nDiscuss your findings with your team before submitting your final investigation.\n\nYour investigation begins now.',
        duration_limit: 45, // 45 minutes
        total_marks: 100,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.setStorage('cases', [demoCase]);

      // 4. Create Access Codes
      const codes = [
        { id: 'code-1-uuid', case_id: 'case-demo-uuid', code: 'MY-DEMO-CODE1', team_id: null, assigned_at: null, used_at: null, status: 'available', created_at: new Date().toISOString() },
        { id: 'code-2-uuid', case_id: 'case-demo-uuid', code: 'MY-DEMO-CODE2', team_id: null, assigned_at: null, used_at: null, status: 'available', created_at: new Date().toISOString() },
        { id: 'code-3-uuid', case_id: 'case-demo-uuid', code: 'MY-DEMO-CODE3', team_id: null, assigned_at: null, used_at: null, status: 'available', created_at: new Date().toISOString() },
        { id: 'code-4-uuid', case_id: 'case-demo-uuid', code: 'MY-DEMO-CODE4', team_id: null, assigned_at: null, used_at: null, status: 'available', created_at: new Date().toISOString() }
      ];
      this.setStorage('case_access_codes', codes);

      // 5. Create Questions
      const questions = [
        {
          id: 'q-1-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'Who is the primary suspect with direct access to the archive vault at the suspected timing?',
          type: 'single_choice',
          marks: 15,
          is_required: true,
          sort_order: 1,
          evaluation_notes: 'Suspect must be Kumar based on CCTV entry timing records.',
          expected_concepts: null
        },
        {
          id: 'q-2-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'Which physical or digital files support the theory of an inside job tampering with evidence? Select all that apply.',
          type: 'multiple_choice',
          marks: 20,
          is_required: true,
          sort_order: 2,
          evaluation_notes: 'Must select E-01 (CCTV entrance log) and E-02 (Archive access slip).',
          expected_concepts: null
        },
        {
          id: 'q-3-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'Mark the core evidence tokens associated with the breach area on the digital investigation board.',
          type: 'evidence_selection',
          marks: 15,
          is_required: true,
          sort_order: 3,
          evaluation_notes: 'Marker A-1 (broken seals) and Marker B-3 (discarded vault tag).',
          expected_concepts: null
        },
        {
          id: 'q-4-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'In 24-hour HH format, at what integer hour did the vault temperature alarm spike?',
          type: 'number',
          marks: 10,
          is_required: true,
          sort_order: 4,
          evaluation_notes: '23 (indicates 11 PM tamper timing).',
          expected_concepts: null
        },
        {
          id: 'q-5-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'State the suspected motive of the culprit behind the evidence purge.',
          type: 'short_answer',
          marks: 10,
          is_required: true,
          sort_order: 5,
          evaluation_notes: 'Culprit sought to cover up financial irregularities in the upcoming audits.',
          expected_concepts: ['audit', 'irregularity', 'financial', 'embezzlement', 'cover up']
        },
        {
          id: 'q-6-uuid',
          case_id: 'case-demo-uuid',
          question_text: 'Detail your final POV and deduction regarding the timeline discrepancies between security logs and CCTV timestamp 23:14:45.',
          type: 'long_answer',
          marks: 30,
          is_required: true,
          sort_order: 6,
          evaluation_notes: 'Must connect the 5-minute offset in Server Clock to explain how the guard was not at the desk during the actual entry.',
          expected_concepts: ['clock skew', 'server clock', 'offset', 'guard desk', 'timestamp', 'discrepancy']
        }
      ];
      this.setStorage('questions', questions);

      // 6. Create Options
      const options = [
        // Q1
        { id: 'opt-q1-1', question_id: 'q-1-uuid', option_text: 'Arjun (Lead Guard)', is_correct: false, sort_order: 1 },
        { id: 'opt-q1-2', question_id: 'q-1-uuid', option_text: 'Kumar (Systems Administrator)', is_correct: true, sort_order: 2 },
        { id: 'opt-q1-3', question_id: 'q-1-uuid', option_text: 'Ravi (Finance Officer)', is_correct: false, sort_order: 3 },
        { id: 'opt-q1-4', question_id: 'q-1-uuid', option_text: 'Suresh (Maintenance Supervisor)', is_correct: false, sort_order: 4 },
        // Q2
        { id: 'opt-q2-1', question_id: 'q-2-uuid', option_text: 'E-01: Archive Vault CCTV Log Discrepancies', is_correct: true, sort_order: 1 },
        { id: 'opt-q2-2', question_id: 'q-2-uuid', option_text: 'E-02: Tampered Audit Slip found in bin', is_correct: true, sort_order: 2 },
        { id: 'opt-q2-3', question_id: 'q-2-uuid', option_text: 'E-03: Visitor Registry Book (clean)', is_correct: false, sort_order: 3 },
        { id: 'opt-q2-4', question_id: 'q-2-uuid', option_text: 'E-04: Ground floor keycard sweeps', is_correct: false, sort_order: 4 },
        // Q3
        { id: 'opt-q3-1', question_id: 'q-3-uuid', option_text: 'Marker A-1 (Broken Vault Seal)', is_correct: true, sort_order: 1 },
        { id: 'opt-q3-2', question_id: 'q-3-uuid', option_text: 'Marker B-3 (Discarded Security Tag)', is_correct: true, sort_order: 2 },
        { id: 'opt-q3-3', question_id: 'q-3-uuid', option_text: 'Marker C-2 (Unused Screwdriver)', is_correct: false, sort_order: 3 },
        { id: 'opt-q3-4', question_id: 'q-3-uuid', option_text: 'Marker D-4 (Vault Security Manual)', is_correct: false, sort_order: 4 }
      ];
      this.setStorage('question_options', options);

      // 7. Create Question Rubrics for Q6
      const rubrics = [
        { id: 'rub-1', question_id: 'q-6-uuid', criterion: 'Clock Skew/Offset', description: 'Correctly identifies that server clocks and security logs had a 5-minute offset.', max_marks: 10, created_at: new Date().toISOString() },
        { id: 'rub-2', question_id: 'q-6-uuid', criterion: 'Guard Shift Gap', description: 'Connects this offset to the guard switchover period where desk was unmonitored.', max_marks: 10, created_at: new Date().toISOString() },
        { id: 'rub-3', question_id: 'q-6-uuid', criterion: 'Culprit Identification', description: 'Proves how administrator Kumar utilized this gap using supervisor access.', max_marks: 10, created_at: new Date().toISOString() }
      ];
      this.setStorage('question_rubrics', rubrics);

      // 8. Event Settings
      const settings = [
        { key: 'event_status', value: 'OPEN', updated_at: new Date().toISOString() },
        { key: 'max_team_size', value: '3', updated_at: new Date().toISOString() },
        { key: 'violation_threshold', value: '3', updated_at: new Date().toISOString() }
      ];
      this.setStorage('event_settings', settings);
    }
  }

  // Clear simulated database
  resetDatabase() {
    localStorage.removeItem('mystery_y_sim_events');
    localStorage.removeItem('mystery_y_sim_profiles');
    localStorage.removeItem('mystery_y_sim_cases');
    localStorage.removeItem('mystery_y_sim_case_access_codes');
    localStorage.removeItem('mystery_y_sim_questions');
    localStorage.removeItem('mystery_y_sim_question_options');
    localStorage.removeItem('mystery_y_sim_question_rubrics');
    localStorage.removeItem('mystery_y_sim_teams');
    localStorage.removeItem('mystery_y_sim_team_members');
    localStorage.removeItem('mystery_y_sim_investigation_sessions');
    localStorage.removeItem('mystery_y_sim_submissions');
    localStorage.removeItem('mystery_y_sim_answers');
    localStorage.removeItem('mystery_y_sim_security_logs');
    localStorage.removeItem('mystery_y_sim_disciplinary_actions');
    localStorage.removeItem('mystery_y_sim_admin_actions');
    localStorage.removeItem('mystery_y_sim_event_settings');
    localStorage.removeItem('mystery_y_sim_result_snapshots');
    this.initializeSeed();
  }

  // Query implementation
  query<T>(table: string): T[] {
    return this.getStorage<T[]>(table, []);
  }

  save<T>(table: string, data: T[]): void {
    this.setStorage(table, data);
  }
}

export const localDB = new LocalDB();
localDB.initializeSeed();

const mockStorageUrls = new Map<string, string>();

// -------------------------------------------------------------------------
// MOCK SUPABASE CLIENT CLASS
// -------------------------------------------------------------------------
class MockSupabaseClient {
  private currentUserId: string | null = null;
  private currentUserEmail: string | null = null;

  auth = {
    getUser: async () => {
      if (!this.currentUserId) return { data: { user: null }, error: null };
      return {
        data: {
          user: {
            id: this.currentUserId,
            email: this.currentUserEmail,
          }
        },
        error: null
      };
    },
    signInWithPassword: async ({ email, password }: any) => {
      // Mock logins
      const profiles = localDB.query<any>('profiles');
      let matched = profiles.find((p: any) => p.email === email);
      
      // Auto-inject profile if it doesn't exist in the current browser local storage yet
      if (!matched && email === 'vh13155_ml23@velhightech.com') {
        const newProfile = {
          id: 'b2ece65e-d728-4220-a40f-66f3234caeef',
          email: 'vh13155_ml23@velhightech.com',
          role: 'super_admin',
          status: 'active',
          name: 'Primary Super Admin',
          created_at: new Date().toISOString()
        };
        profiles.push(newProfile);
        localDB.save('profiles', profiles);
        matched = newProfile;
      }
      
      let isValidPassword = false;
      if (matched) {
        if (email === 'vh13155_ml23@velhightech.com' && password === 'Daya@2006') {
          isValidPassword = true;
        } else if (email === 'admin@college.edu' && password === 'admin123') {
          isValidPassword = true;
        } else if (email === 'eval@college.edu' && password === 'eval123') {
          isValidPassword = true;
        } else if (email === 'coord@college.edu' && password === 'coord123') {
          isValidPassword = true;
        }
      }

      if (matched && isValidPassword) {
        if (matched.status === 'disabled') {
          return { data: { user: null }, error: { message: 'ACCESS DENIED: This operator ID has been disabled by security control.' } };
        }
        this.currentUserId = matched.id;
        this.currentUserEmail = matched.email;
        localStorage.setItem('mystery_y_mock_uid', matched.id);
        localStorage.setItem('mystery_y_mock_email', matched.email);

        // Update profile last login
        const updatedProfiles = profiles.map((p: any) => {
          if (p.id === matched.id) {
            return { ...p, last_login: new Date().toISOString() };
          }
          return p;
        });
        localDB.save('profiles', updatedProfiles);

        // Log ADMIN_LOGIN activity
        const adminActions = localDB.query<any>('admin_actions');
        const newAction = {
          id: crypto.randomUUID(),
          admin_id: matched.id,
          action_type: 'ADMIN_LOGIN',
          details: { email: matched.email },
          created_at: new Date().toISOString()
        };
        localDB.save('admin_actions', [...adminActions, newAction]);

        return {
          data: {
            user: { id: matched.id, email: matched.email },
            session: { access_token: 'mock-jwt-token' }
          },
          error: null
        };
      }
      return { data: { user: null }, error: { message: 'Invalid credentials. Use vh13155_ml23@velhightech.com / Daya@2006, admin@college.edu / admin123, eval@college.edu / eval123, or coord@college.edu / coord123.' } };
    },
    signOut: async () => {
      this.currentUserId = null;
      this.currentUserEmail = null;
      localStorage.removeItem('mystery_y_mock_uid');
      localStorage.removeItem('mystery_y_mock_email');
      return { error: null };
    }
  };

  constructor() {
    this.currentUserId = localStorage.getItem('mystery_y_mock_uid');
    this.currentUserEmail = localStorage.getItem('mystery_y_mock_email');
  }

  // Chainable query builder mock
  from(table: string) {
    const db = localDB;
    let data = db.query<any>(table);

    const builder = {
      select: (columns: string = '*') => {
        // Strip sensitive fields for participants in mock mode
        if (table === 'question_options' && columns !== '*' && !columns.includes('is_correct')) {
          data = data.map(({ is_correct, ...rest }: any) => rest);
        }
        return builder;
      },
      eq: (column: string, value: any) => {
        data = data.filter((row: any) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: any) => {
        data = data.filter((row: any) => row[column] !== value);
        return builder;
      },
      order: (column: string, { ascending = true } = {}) => {
        data = [...data].sort((a: any, b: any) => {
          if (a[column] < b[column]) return ascending ? -1 : 1;
          if (a[column] > b[column]) return ascending ? 1 : -1;
          return 0;
        });
        return builder;
      },
      single: async () => {
        return { data: data[0] || null, error: data[0] ? null : { message: 'Record not found' } };
      },
      insert: async (rows: any | any[]) => {
        const insertRows = Array.isArray(rows) ? rows : [rows];
        
        // Super Admin restrictions check for 'profiles' table
        if (table === 'profiles') {
          const currentEmail = localStorage.getItem('mystery_y_mock_email');
          if (currentEmail !== 'vh13155_ml23@velhightech.com') {
            return { data: null, error: { message: 'ACCESS DENIED: Only the Super Admin is authorized to register new administrators.' } };
          }
          for (const row of insertRows) {
            if (row.role === 'super_admin' && row.email !== 'vh13155_ml23@velhightech.com') {
              return { data: null, error: { message: 'ACCESS DENIED: Replicating or creating another Super Admin account is blocked.' } };
            }
          }
        }

        const currentData = db.query<any>(table);
        const addedRows = insertRows.map((r: any) => ({
          id: r.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...r
        }));
        db.save(table, [...currentData, ...addedRows]);
        // Simulate Realtime alerts for security events
        if (table === 'security_logs') {
          const callbacks = realtimeCallbacks.get('security_logs') || [];
          callbacks.forEach((cb) => cb({ new: addedRows[0] }));
        }
        return { data: addedRows, error: null };
      },
      update: (updates: any) => {
        return {
          eq: (col: string, val: any) => {
            // Super Admin permissions check for 'profiles' table
            if (table === 'profiles') {
              const currentEmail = localStorage.getItem('mystery_y_mock_email');
              if (currentEmail !== 'vh13155_ml23@velhightech.com') {
                return Promise.resolve({ data: null, error: { message: 'ACCESS DENIED: Only the Super Admin can modify admin access/roles.' } });
              }
              if (updates.role === 'super_admin' && val !== 'b2ece65e-d728-4220-a40f-66f3234caeef') {
                return Promise.resolve({ data: null, error: { message: 'ACCESS DENIED: Escalating role to Super Admin is forbidden.' } });
              }
            }

            const currentData = db.query<any>(table);
            let updatedCount = 0;
            const nextData = currentData.map((row: any) => {
              if (row[col] === val) {
                updatedCount++;
                return { ...row, ...updates, updated_at: new Date().toISOString() };
              }
              return row;
            });
            db.save(table, nextData);
            return Promise.resolve({ data: updates, error: null, count: updatedCount });
          }
        };
      },
      delete: () => {
        return {
          eq: (col: string, val: any) => {
            // Super Admin permissions check for 'profiles' table
            if (table === 'profiles') {
              const currentEmail = localStorage.getItem('mystery_y_mock_email');
              if (currentEmail !== 'vh13155_ml23@velhightech.com') {
                return Promise.resolve({ data: null, error: { message: 'ACCESS DENIED: Only the Super Admin can delete admin access.' } });
              }
              if (val === 'b2ece65e-d728-4220-a40f-66f3234caeef') {
                return Promise.resolve({ data: null, error: { message: 'ACCESS DENIED: The permanent Super Admin account cannot be deleted.' } });
              }
            }

            const currentData = db.query<any>(table);
            const filtered = currentData.filter((row: any) => row[col] !== val);
            db.save(table, filtered);
            return Promise.resolve({ data: null, error: null });
          }
        };
      },
      // Promise resolve fallback
      then: (resolve: any) => {
        resolve({ data, error: null });
      }
    };

    return builder;
  }

  // Mock RPC execution
  async rpc(functionName: string, args: any = {}) {
    const db = localDB;
    try {
      if (functionName === 'register_team_transaction') {
        const { p_event_id, p_name, p_member_names, p_access_code } = args;
        const codes = db.query<any>('case_access_codes');
        const codeRec = codes.find((c: any) => c.code === p_access_code);

        if (!codeRec) {
          return { data: { success: false, error: 'CASE NOT FOUND' }, error: null };
        }
        if (codeRec.status !== 'available') {
          return { data: { success: false, error: 'ACCESS CODE ALREADY ASSIGNED OR USED' }, error: null };
        }

        const teams = db.query<any>('teams');
        if (teams.some((t: any) => t.event_id === p_event_id && t.name.toLowerCase() === p_name.toLowerCase())) {
          return { data: { success: false, error: 'TEAM NAME ALREADY REGISTERED' }, error: null };
        }

        if (!p_member_names || p_member_names.length < 2 || p_member_names.length > 3) {
          return { data: { success: false, error: 'TEAM SIZE MUST BE 2 OR 3 MEMBERS' }, error: null };
        }

        // Auto team labeling
        const teamLabelNum = teams.length + 1;
        const teamLabel = `TEAM-${String(teamLabelNum).padStart(3, '0')}`;
        const newTeamId = crypto.randomUUID();

        const newTeam = {
          id: newTeamId,
          event_id: p_event_id,
          team_id_label: teamLabel,
          name: p_name,
          case_id: codeRec.case_id,
          status: 'registered',
          created_at: new Date().toISOString()
        };

        const members = db.query<any>('team_members');
        const newMembers = p_member_names.map((name: string, idx: number) => ({
          id: crypto.randomUUID(),
          team_id: newTeamId,
          name,
          role: `member_${idx + 1}`,
          created_at: new Date().toISOString()
        }));

        // Save
        db.save('teams', [...teams, newTeam]);
        db.save('team_members', [...members, ...newMembers]);

        // Lock code
        const updatedCodes = codes.map((c: any) => {
          if (c.id === codeRec.id) {
            return { ...c, team_id: newTeamId, status: 'assigned', assigned_at: new Date().toISOString() };
          }
          return c;
        });
        db.save('case_access_codes', updatedCodes);

        return {
          data: {
            success: true,
            team_id: newTeamId,
            team_id_label: teamLabel,
            case_id: codeRec.case_id,
            access_code_id: codeRec.id
          },
          error: null
        };
      }

      if (functionName === 'begin_investigation_transaction') {
        const { p_team_id, p_case_id, p_code_id } = args;
        const sessions = db.query<any>('investigation_sessions');
        const existing = sessions.find((s: any) => s.team_id === p_team_id && s.case_id === p_case_id);

        if (existing) {
          return {
            data: {
              success: true,
              session_id: existing.id,
              started_at: existing.started_at,
              status: existing.status,
              recovered: true
            },
            error: null
          };
        }

        // Accept 'assigned' OR 'available' codes (registration sets to 'assigned')
        const codes = db.query<any>('case_access_codes');
        const codeRec = p_code_id
          ? codes.find((c: any) => c.id === p_code_id && c.team_id === p_team_id)
          : null;

        // If a code id was provided but not found / wrong status, reject
        if (p_code_id && codeRec && codeRec.status !== 'assigned' && codeRec.status !== 'available') {
          return { data: { success: false, error: 'INVALID OR LOCK-FAILED ACCESS CODE' }, error: null };
        }

        // Lock access code to 'used' (best-effort, only if we found it)
        if (codeRec) {
          const updatedCodes = codes.map((c: any) => {
            if (c.id === p_code_id) return { ...c, status: 'used', used_at: new Date().toISOString() };
            return c;
          });
          db.save('case_access_codes', updatedCodes);
        }

        // Update team status to active
        const teams = db.query<any>('teams');
        const updatedTeams = teams.map((t: any) => {
          if (t.id === p_team_id) return { ...t, status: 'active' };
          return t;
        });
        db.save('teams', updatedTeams);

        // Create investigation session
        const newSessionId = crypto.randomUUID();
        const startTimestamp = new Date().toISOString();
        const newSession = {
          id: newSessionId,
          team_id: p_team_id,
          case_id: p_case_id,
          access_code_id: p_code_id || null,
          started_at: startTimestamp,
          last_seen_at: startTimestamp,
          status: 'active',
          created_at: startTimestamp
        };
        db.save('investigation_sessions', [...sessions, newSession]);

        // Create submission row so useParticipantSession can find it via DB query
        const submissions = db.query<any>('submissions');
        const existingSub = submissions.find((s: any) => s.team_id === p_team_id && s.case_id === p_case_id);
        if (!existingSub) {
          const subCount = submissions.length;
          const newSub = {
            id: crypto.randomUUID(),
            submission_id_label: `SUB-${100001 + subCount}`,
            team_id: p_team_id,
            case_id: p_case_id,
            session_id: newSessionId,
            started_at: startTimestamp,
            submitted_at: null,
            duration: null,
            score: null,
            is_finalized: false,
            created_at: startTimestamp,
          };
          db.save('submissions', [...submissions, newSub]);
        }

        return {
          data: {
            success: true,
            session_id: newSessionId,
            started_at: startTimestamp,
            status: 'active',
            recovered: false
          },
          error: null
        };
      }

      if (functionName === 'submit_investigation_transaction') {
        const { p_session_id, p_client_answers } = args;
        const sessions = db.query<any>('investigation_sessions');
        const sessionIdx = sessions.findIndex((s: any) => s.id === p_session_id);

        if (sessionIdx === -1) {
          return { data: { success: false, error: 'INVESTIGATION SESSION UNAVAILABLE' }, error: null };
        }
        const session = sessions[sessionIdx];
        if (session.status === 'submitted') {
          return { data: { success: false, error: 'SUBMISSION ALREADY FINALIZED' }, error: null };
        }

        const nowStr = new Date().toISOString();
        const startMs = new Date(session.started_at).getTime();
        const endMs = new Date(nowStr).getTime();
        const durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

        // Generate Submission label
        const submissions = db.query<any>('submissions');
        const nextSubId = 100000 + submissions.length + 1;
        const subLabel = `SUB-${nextSubId}`;
        const newSubId = crypto.randomUUID();

        // Perform mock auto-scoring
        let totalAutoScore = 0;
        const allQuestions = db.query<any>('questions');
        const allOptions = db.query<any>('question_options');
        const newAnswers: any[] = [];

        p_client_answers.forEach((ans: any) => {
          let score = 0;
          const q = allQuestions.find((qst: any) => qst.id === ans.question_id);
          const qOpts = allOptions.filter((opt: any) => opt.question_id === ans.question_id);

          if (q) {
            if (q.type === 'single_choice') {
              const selectedOptId = ans.selected_options?.[0];
              const correct = qOpts.find((o) => o.is_correct);
              if (correct && correct.id === selectedOptId) {
                score = q.marks;
              }
            } else if (q.type === 'multiple_choice' || q.type === 'evidence_selection') {
              const correctOptIds = qOpts.filter((o) => o.is_correct).map((o) => o.id);
              const selectedOptIds = ans.selected_options || [];

              const correctSelected = selectedOptIds.filter((id: string) => correctOptIds.includes(id)).length;
              const incorrectSelected = selectedOptIds.filter((id: string) => !correctOptIds.includes(id)).length;

              if (correctSelected === correctOptIds.length && incorrectSelected === 0) {
                score = q.marks;
              }
            }
          }

          totalAutoScore += score;

          newAnswers.push({
            id: crypto.randomUUID(),
            submission_id: newSubId,
            question_id: ans.question_id,
            answer_text: ans.answer_text || '',
            selected_options: ans.selected_options || [],
            score,
            grader_notes: '',
            is_graded: ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q?.type || ''),
            updated_at: nowStr
          });
        });

        const newSubmission = {
          id: newSubId,
          submission_id_label: subLabel,
          team_id: session.team_id,
          case_id: session.case_id,
          started_at: session.started_at,
          submitted_at: nowStr,
          duration: durationSeconds,
          score: totalAutoScore,
          is_finalized: false,
          graded_by: null,
          grading_notes: '',
          created_at: nowStr
        };

        // Save submissions and answers
        db.save('submissions', [...submissions, newSubmission]);
        const answers = db.query<any>('answers');
        db.save('answers', [...answers, ...newAnswers]);

        // Lock session and team
        sessions[sessionIdx] = { ...session, status: 'submitted', ended_at: nowStr };
        db.save('investigation_sessions', sessions);

        const teams = db.query<any>('teams');
        const updatedTeams = teams.map((t: any) => {
          if (t.id === session.team_id) return { ...t, status: 'submitted' };
          return t;
        });
        db.save('teams', updatedTeams);

        return {
          data: {
            success: true,
            submission_id: newSubId,
            submission_id_label: subLabel,
            duration: durationSeconds,
            submitted_at: nowStr,
            auto_score: totalAutoScore
          },
          error: null
        };
      }

      if (functionName === 'finalize_results_transaction') {
        const { p_event_id, p_admin_id } = args;

        const profiles = db.query<any>('profiles');
        const admin = profiles.find((p: any) => p.id === p_admin_id);
        if (!admin || admin.role !== 'super_admin') {
          return { data: { success: false, error: 'UNAUTHORIZED: SUPER ADMIN PRIVILEGES REQUIRED' }, error: null };
        }

        const teams = db.query<any>('teams').filter((t: any) => t.event_id === p_event_id && t.status !== 'disqualified');
        const submissions = db.query<any>('submissions');
        const answers = db.query<any>('answers');
        const questions = db.query<any>('questions');

        // Compile ranking details
        const rankList = teams.map((t: any) => {
          const sub = submissions.find((s: any) => s.team_id === t.id);
          if (!sub) return null;

          // Evidence Selection / Long Answer score
          const tAnswers = answers.filter((a: any) => a.submission_id === sub.id);
          const evidenceScore = tAnswers
            .filter((a: any) => {
              const q = questions.find((qst: any) => qst.id === a.question_id);
              return q && ['evidence_selection', 'long_answer'].includes(q.type);
            })
            .reduce((sum: number, a: any) => sum + Number(a.score), 0);

          return {
            team_id_label: t.team_id_label,
            team_name: t.name,
            submission_id: sub.id,
            submission_id_label: sub.submission_id_label,
            total_score: Number(sub.score),
            evidence_score: evidenceScore,
            duration_seconds: sub.duration,
            submitted_at: sub.submitted_at
          };
        }).filter(Boolean);

        // Sort based on tie-breakers
        rankList.sort((a: any, b: any) => {
          if (a.total_score !== b.total_score) return b.total_score - a.total_score;
          if (a.evidence_score !== b.evidence_score) return b.evidence_score - a.evidence_score;
          if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds;
          return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
        });

        // Add Rank index
        const rankedSnap = rankList.map((item: any, idx: number) => ({
          rank: idx + 1,
          ...item
        }));

        // Save result snapshot
        const snaps = db.query<any>('result_snapshots');
        const newSnapId = crypto.randomUUID();
        const newSnap = {
          id: newSnapId,
          event_id: p_event_id,
          finalized_by: p_admin_id,
          finalized_at: new Date().toISOString(),
          snapshot_data: rankedSnap
        };
        db.save('result_snapshots', [...snaps, newSnap]);

        // Close event
        const events = db.query<any>('events');
        const updatedEvents = events.map((e: any) => {
          if (e.id === p_event_id) return { ...e, status: 'closed' };
          return e;
        });
        db.save('events', updatedEvents);

        return { data: { success: true, team_count: rankedSnap.length }, error: null };
      }

      return { data: null, error: { message: `Function ${functionName} not implemented in simulator.` } };
    } catch (e: any) {
      return { data: null, error: { message: e.message } };
    }
  }

  // Realtime channel mocks
  channel(channelName: string) {
    const channelObj = {
      on: (type: string, filter: any, callback: any) => {
        const table = filter.table || 'security_logs';
        const list = realtimeCallbacks.get(table) || [];
        list.push(callback);
        realtimeCallbacks.set(table, list);
        return channelObj; // Allow chaining of .on() calls
      },
      subscribe: () => {
        console.log(`Mock Realtime: Subscribed to ${channelName}`);
        return {
          unsubscribe: () => {
            console.log(`Mock Realtime: Unsubscribed from ${channelName}`);
          }
        };
      }
    };
    return channelObj;
  }

  // Secure storage mock helper
  storage = {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => {
        if (mockStorageUrls.has(path)) {
          return { data: { publicUrl: mockStorageUrls.get(path) } };
        }
        // Fallback for audio or video path
        if (path.endsWith('.mp3')) {
          return { data: { publicUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' } };
        }
        return { data: { publicUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' } };
      },
      upload: async (path: string, file: any) => {
        console.log(`Mock Storage Upload: Saved file in bucket ${bucket} at path ${path}`);
        let url = path;
        if (file instanceof Blob || file instanceof File) {
          url = URL.createObjectURL(file);
        }
        mockStorageUrls.set(path, url);
        return { data: { path }, error: null };
      }
    })
  };
}

const realtimeCallbacks = new Map<string, Array<(payload: any) => void>>();

export const supabase = realSupabase || (new MockSupabaseClient() as any);
