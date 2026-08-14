import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  Sliders,
  Download,
  SlidersHorizontal,
  ShieldAlert,
  Loader,
  CheckCircle,
  Database,
  Trash2,
  AlertTriangle,
  Lock,
  X,
  Check,
} from 'lucide-react';

export default function Settings() {
  const { adminUser, isSuperAdmin } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventName, setSelectedEventName] = useState('');
  const [eventStatus, setEventStatus] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Database Reset Modals State
  const [resetModalType, setResetModalType] = useState<'case' | 'participant' | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (!error && data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
        setSelectedEventName(data[0].name);
        setEventStatus(data[0].status);
      } else {
        // Fallback mock
        const mockEvt = { id: 'evt-2026-demo-uuid', name: 'Mystery Y Symposium 2026', status: 'open' };
        setEvents([mockEvt]);
        setSelectedEventId(mockEvt.id);
        setSelectedEventName(mockEvt.name);
        setEventStatus(mockEvt.status);
      }
    } catch (err) {
      console.error('Failed to load settings events', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedEventId(id);
    const matched = events.find((evt) => evt.id === id);
    if (matched) {
      setSelectedEventName(matched.name);
      setEventStatus(matched.status);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('events')
        .update({ status: eventStatus })
        .eq('id', selectedEventId);

      if (!error) {
        setSaveSuccess(true);
        loadEvents();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper trigger browser CSV file download
  const triggerCSVDownload = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV EXPORT 1: TEAMS
  const handleExportTeams = async () => {
    try {
      const { data: teams } = await supabase.from('teams').select('*').eq('event_id', selectedEventId);
      const { data: members } = await supabase.from('team_members').select('*');
      const { data: codes } = await supabase.from('case_access_codes').select('*');

      if (!teams) return;

      let csv = 'Team ID,Team Name,Members,Access Code,Status,Registration Date\n';
      teams.forEach((t) => {
        const teamMembers = members?.filter((m) => m.team_id === t.id).map((m) => m.name).join('; ') || '';
        const teamCode = codes?.find((c) => c.team_id === t.id)?.code || '';
        csv += `"${t.team_id_label}","${t.name}","${teamMembers}","${teamCode}","${t.status}","${t.created_at}"\n`;
      });

      triggerCSVDownload(csv, `mystery_y_teams_${selectedEventName.replace(/\s+/g, '_').toLowerCase()}.csv`);
    } catch (err) {
      console.error('Failed to export teams', err);
    }
  };

  // CSV EXPORT 2: SUBMISSIONS
  const handleExportSubmissions = async () => {
    try {
      const { data: submissions } = await supabase.from('submissions').select('*');
      const { data: teams } = await supabase.from('teams').select('*').eq('event_id', selectedEventId);
      const { data: cases } = await supabase.from('cases').select('*');

      if (!submissions || !teams) return;

      let csv = 'Submission ID,Team ID,Team Name,Case Number,Start Time,Submit Time,Duration (sec),Score,Finalized\n';
      submissions.forEach((s) => {
        const team = teams.find((t) => t.id === s.team_id);
        if (!team) return;
        const caseNum = cases?.find((c) => c.id === s.case_id)?.case_number || '';

        csv += `"${s.submission_id_label}","${team.team_id_label}","${team.name}","${caseNum}","${s.started_at}","${s.submitted_at}",${s.duration},${s.score},${s.is_finalized}\n`;
      });

      triggerCSVDownload(csv, `mystery_y_submissions_${selectedEventName.replace(/\s+/g, '_').toLowerCase()}.csv`);
    } catch (err) {
      console.error('Failed to export submissions', err);
    }
  };

  // CSV EXPORT 3: RESULTS STANDINGS
  const handleExportResults = async () => {
    try {
      const { data: snapshot } = await supabase
        .from('result_snapshots')
        .select('snapshot_data')
        .eq('event_id', selectedEventId)
        .order('finalized_at', { ascending: false })
        .limit(1)
        .single();

      let snapData = [];
      if (snapshot && snapshot.snapshot_data) {
        snapData = snapshot.snapshot_data;
      } else {
        const { data: teams } = await supabase.from('teams').select('*').eq('event_id', selectedEventId).neq('status', 'disqualified');
        const { data: subs } = await supabase.from('submissions').select('*');
        const { data: answers } = await supabase.from('answers').select('*');
        const { data: questions } = await supabase.from('questions').select('*');

        if (teams && subs) {
          const list = teams.map((t) => {
            const sub = subs.find((s) => s.team_id === t.id);
            if (!sub) return null;
            const subAnswers = answers?.filter((a) => a.submission_id === sub.id) || [];
            const evidenceScore = subAnswers
              .filter((a) => {
                const q = questions?.find((qst) => qst.id === a.question_id);
                return q && ['evidence_selection', 'long_answer'].includes(q.type);
              })
              .reduce((sum, a) => sum + Number(a.score), 0);

            return {
              team_id_label: t.team_id_label,
              team_name: t.name,
              total_score: Number(sub.score),
              evidence_score: evidenceScore,
              duration_seconds: sub.duration,
              submitted_at: sub.submitted_at,
            };
          }).filter(Boolean);

          list.sort((a: any, b: any) => {
            if (a.total_score !== b.total_score) return b.total_score - a.total_score;
            if (a.evidence_score !== b.evidence_score) return b.evidence_score - a.evidence_score;
            if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds;
            return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
          });

          snapData = list.map((item, idx) => ({
            rank: idx + 1,
            ...item,
          }));
        }
      }

      let csv = 'Rank,Team ID,Team Name,Submission ID,Duration (sec),Evidence Score,Total Score,Submit Time\n';
      snapData.forEach((row: any) => {
        csv += `${row.rank},"${row.team_id_label}","${row.team_name}","${row.submission_id_label || ''}",${row.duration_seconds},${row.evidence_score},${row.total_score},"${row.submitted_at}"\n`;
      });

      triggerCSVDownload(csv, `mystery_y_results_${selectedEventName.replace(/\s+/g, '_').toLowerCase()}.csv`);
    } catch (err) {
      console.error('Failed to export results snapshot', err);
    }
  };

  // DESTRUCTIVE ACTION 1: CLEAR CASE DATA
  const handleConfirmClearCaseData = async () => {
    if (confirmationInput !== 'CLEAR CASE DATA') return;
    if (!adminUser || !isSuperAdmin) {
      setResetMessage({ type: 'error', text: 'UNAUTHORIZED: Only the Primary Super Admin can perform database resets.' });
      return;
    }

    setIsResetting(true);
    setResetMessage(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('clear_case_data', {
        p_admin_id: adminUser.id,
      });

      if (rpcError) {
        // Fallback direct table deletions respecting FKs
        await supabase.from('question_rubrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('question_options').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('case_access_codes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      setResetMessage({ type: 'success', text: 'Case database cleared successfully. Admin and participant accounts remain intact.' });
      setResetModalType(null);
      setConfirmationInput('');
    } catch (err: any) {
      console.error('Failed to clear case data', err);
      setResetMessage({ type: 'error', text: err.message || 'Failed to clear case data' });
    } finally {
      setIsResetting(false);
    }
  };

  // DESTRUCTIVE ACTION 2: CLEAR PARTICIPANT DATA
  const handleConfirmClearParticipantData = async () => {
    if (confirmationInput !== 'CLEAR PARTICIPANT DATA') return;
    if (!adminUser || !isSuperAdmin) {
      setResetMessage({ type: 'error', text: 'UNAUTHORIZED: Only the Primary Super Admin can perform database resets.' });
      return;
    }

    setIsResetting(true);
    setResetMessage(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('clear_participant_data', {
        p_admin_id: adminUser.id,
      });

      if (rpcError) {
        // Fallback direct table deletions respecting FKs
        await supabase.from('result_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('disciplinary_actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('security_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('draft_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('investigation_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('team_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Reset access codes
        await supabase
          .from('case_access_codes')
          .update({ team_id: null, assigned_at: null, used_at: null, status: 'available' })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      setResetMessage({ type: 'success', text: 'Participant investigation data cleared successfully. Cases and admin accounts remain intact.' });
      setResetModalType(null);
      setConfirmationInput('');
    } catch (err: any) {
      console.error('Failed to clear participant data', err);
      setResetMessage({ type: 'error', text: err.message || 'Failed to clear participant data' });
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-xs text-detective-muted">
        <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
        LOADING CONTROL PARAMETERS...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Event Configurations</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Tactical Operations System Settings &amp; Database Controls
          </p>
        </div>
      </div>

      {resetMessage && (
        <div className={`p-4 rounded border text-xs font-bold uppercase flex items-center gap-2 ${
          resetMessage.type === 'success'
            ? 'bg-detective-green/10 border-detective-green text-detective-green'
            : 'bg-detective-crimson/15 border-detective-crimson text-detective-alert'
        }`}>
          {resetMessage.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <span>{resetMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left column: configs form */}
        <form onSubmit={handleSaveSettings} className="bg-detective-panel border border-detective-border rounded p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-detective-crimson" /> Operations State Configs
          </h3>

          {saveSuccess && (
            <div className="border border-detective-green/30 bg-detective-green/5 text-detective-green p-2 rounded text-xs uppercase flex items-center gap-1.5 font-bold">
              <CheckCircle className="w-4 h-4" /> Configs Saved Successfully
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Symposium Event Target</label>
              <select
                value={selectedEventId}
                onChange={handleEventChange}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Registration Portal Status</label>
              <select
                value={eventStatus}
                onChange={(e) => setEventStatus(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="draft">DRAFT (PREPARATION)</option>
                <option value="open">OPEN (PARTICIPANTS ONBOARDING)</option>
                <option value="paused">PAUSED (HOLD NEW ENTRANTS)</option>
                <option value="closed">CLOSED (INVESTIGATION ENDED)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white px-5 py-2.5 rounded font-bold uppercase text-xs disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? 'Updating...' : 'Commit Operational State'}
          </button>
        </form>

        {/* Right column: exports tools */}
        <div className="bg-detective-panel border border-detective-border rounded p-6 space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 flex items-center gap-1.5">
            <Download className="w-4 h-4 text-detective-amber" /> Data Exports Console
          </h3>

          <div className="grid grid-cols-1 gap-4 text-xs font-mono">
            {/* Teams Export Card */}
            <div className="bg-black/35 rounded border border-detective-border/60 p-4 flex justify-between items-center">
              <div>
                <span className="font-bold text-white uppercase block">Registered Investigator Teams</span>
                <span className="text-[10px] text-detective-muted block mt-0.5">Exports: ID labels, member lists, code states.</span>
              </div>
              <button
                onClick={handleExportTeams}
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            {/* Submissions Export Card */}
            <div className="bg-black/35 rounded border border-detective-border/60 p-4 flex justify-between items-center">
              <div>
                <span className="font-bold text-white uppercase block">Submissions Log Dossier</span>
                <span className="text-[10px] text-detective-muted block mt-0.5">Exports: Timestamps, duration checks, active score tally.</span>
              </div>
              <button
                onClick={handleExportSubmissions}
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            {/* Results snapshot Export Card */}
            <div className="bg-black/35 rounded border border-detective-border/60 p-4 flex justify-between items-center">
              <div>
                <span className="font-bold text-white uppercase block">Standing Leaderboard Standings</span>
                <span className="text-[10px] text-detective-muted block mt-0.5">Exports: Tied rank positions, tie-breaker order listings.</span>
              </div>
              <button
                onClick={handleExportResults}
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ===================================================================== */}
      {/* SUPER ADMIN DATABASE RESET CONSOLE                                    */}
      {/* ===================================================================== */}
      <div className="bg-detective-panel border-2 border-detective-crimson/40 rounded p-6 space-y-6">
        <div className="flex justify-between items-start border-b border-detective-border pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-detective-alert flex items-center gap-2">
              <Database className="w-4 h-4 text-detective-crimson" />
              Database Management &amp; Operational Reset
            </h3>
            <p className="text-[11px] text-detective-muted uppercase tracking-wider mt-0.5">
              Super Admin clearance required (vh13155_ml23@velhightech.com)
            </p>
          </div>
          <span className="text-[9px] bg-detective-crimson/20 border border-detective-crimson/50 text-detective-alert px-2.5 py-1 rounded font-bold uppercase">
            {isSuperAdmin ? 'SUPER ADMIN PRIVILEGES ACTIVE' : 'RESTRICTED ACCESS'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Action 1: Clear Case Data */}
          <div className="bg-black/40 border border-detective-border/60 rounded p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-detective-amber" />
                [ CLEAR CASE DATA ]
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Permanently removes all case files, case questions, question options, access codes, and rubrics.
              </p>
              <div className="text-[10px] text-detective-green font-bold uppercase">
                ✓ Preserves participant teams, accounts, and admin profiles.
              </div>
            </div>

            <button
              onClick={() => {
                setResetModalType('case');
                setConfirmationInput('');
              }}
              disabled={!isSuperAdmin}
              className="w-full bg-detective-amber/15 hover:bg-detective-amber/30 border border-detective-amber text-detective-amber font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              [ CLEAR CASE DATA ]
            </button>
          </div>

          {/* Action 2: Clear Participant Data */}
          <div className="bg-black/40 border border-detective-border/60 rounded p-5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-detective-crimson" />
                [ CLEAR PARTICIPANT DATA ]
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Permanently clears all participant teams, member lists, investigation sessions, submissions, answers, security incident logs, and resets access codes to available.
              </p>
              <div className="text-[10px] text-detective-green font-bold uppercase">
                ✓ Preserves case dossiers, questions, rubrics, and admin profiles.
              </div>
            </div>

            <button
              onClick={() => {
                setResetModalType('participant');
                setConfirmationInput('');
              }}
              disabled={!isSuperAdmin}
              className="w-full bg-detective-crimson/20 hover:bg-detective-crimson border border-detective-crimson text-detective-alert hover:text-white font-bold py-2.5 px-4 rounded text-xs uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              [ CLEAR PARTICIPANT DATA ]
            </button>
          </div>

        </div>
      </div>

      {/* ===================================================================== */}
      {/* TYPED CONFIRMATION MODAL: CLEAR CASE DATA                             */}
      {/* ===================================================================== */}
      {resetModalType === 'case' && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border-2 border-detective-amber rounded-lg p-6 max-w-md w-full font-mono text-xs shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-detective-border pb-3">
              <div className="flex items-center gap-2 text-detective-amber font-bold text-sm uppercase">
                <AlertTriangle className="w-5 h-5" /> ⚠ CLEAR CASE DATABASE
              </div>
              <button onClick={() => setResetModalType(null)} className="text-detective-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-stone-300 leading-relaxed text-[11px]">
              This will permanently remove all case-related data. This action <strong className="text-detective-alert">CANNOT BE UNDONE</strong>.
            </p>

            <div className="space-y-1.5 bg-black/40 p-3 rounded border border-detective-border">
              <label className="block text-[10px] text-detective-muted uppercase font-bold">
                Type <strong className="text-white font-mono">CLEAR CASE DATA</strong> below to confirm:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="CLEAR CASE DATA"
                className="w-full bg-black/80 border border-detective-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-detective-amber uppercase font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setResetModalType(null)}
                disabled={isResetting}
                className="px-3 py-2 rounded border border-detective-border text-detective-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearCaseData}
                disabled={confirmationInput !== 'CLEAR CASE DATA' || isResetting}
                className="px-4 py-2 rounded bg-detective-amber hover:bg-yellow-600 text-black font-bold text-xs uppercase disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                {isResetting && <Loader className="w-3.5 h-3.5 animate-spin" />}
                [ CONFIRM CLEAR ]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TYPED CONFIRMATION MODAL: CLEAR PARTICIPANT DATA                      */}
      {/* ===================================================================== */}
      {resetModalType === 'participant' && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border-2 border-detective-crimson rounded-lg p-6 max-w-md w-full font-mono text-xs shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-detective-border pb-3">
              <div className="flex items-center gap-2 text-detective-alert font-bold text-sm uppercase">
                <AlertTriangle className="w-5 h-5 text-detective-crimson" /> ⚠ CLEAR PARTICIPANT DATA
              </div>
              <button onClick={() => setResetModalType(null)} className="text-detective-muted hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-stone-300 leading-relaxed text-[11px]">
              This will permanently remove all participant, team, session, answer, and security data. This action <strong className="text-detective-alert">CANNOT BE UNDONE</strong>.
            </p>

            <div className="space-y-1.5 bg-black/40 p-3 rounded border border-detective-border">
              <label className="block text-[10px] text-detective-muted uppercase font-bold">
                Type <strong className="text-white font-mono">CLEAR PARTICIPANT DATA</strong> below to confirm:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="CLEAR PARTICIPANT DATA"
                className="w-full bg-black/80 border border-detective-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson uppercase font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setResetModalType(null)}
                disabled={isResetting}
                className="px-3 py-2 rounded border border-detective-border text-detective-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearParticipantData}
                disabled={confirmationInput !== 'CLEAR PARTICIPANT DATA' || isResetting}
                className="px-4 py-2 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold text-xs uppercase disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                {isResetting && <Loader className="w-3.5 h-3.5 animate-spin" />}
                [ CONFIRM CLEAR ]
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
