import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Sliders, Download, SlidersHorizontal, ShieldAlert, Loader, CheckCircle, Database } from 'lucide-react';

export default function Settings() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventName, setSelectedEventName] = useState('');
  const [eventStatus, setEventStatus] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    const matched = events.find(evt => evt.id === id);
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
        const teamMembers = members?.filter(m => m.team_id === t.id).map(m => m.name).join('; ') || '';
        const teamCode = codes?.find(c => c.team_id === t.id)?.code || '';
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
        const team = teams.find(t => t.id === s.team_id);
        if (!team) return; // Only show submissions of selected event
        const caseNum = cases?.find(c => c.id === s.case_id)?.case_number || '';
        
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
        // Fallback: calculate live standing if snapshot hasn't locked
        const { data: teams } = await supabase.from('teams').select('*').eq('event_id', selectedEventId).neq('status', 'disqualified');
        const { data: subs } = await supabase.from('submissions').select('*');
        const { data: answers } = await supabase.from('answers').select('*');
        const { data: questions } = await supabase.from('questions').select('*');

        if (teams && subs) {
          const list = teams.map((t) => {
            const sub = subs.find(s => s.team_id === t.id);
            if (!sub) return null;
            const subAnswers = answers?.filter(a => a.submission_id === sub.id) || [];
            const evidenceScore = subAnswers
              .filter(a => {
                const q = questions?.find(qst => qst.id === a.question_id);
                return q && ['evidence_selection', 'long_answer'].includes(q.type);
              })
              .reduce((sum, a) => sum + Number(a.score), 0);

            return {
              team_id_label: t.team_id_label,
              team_name: t.name,
              total_score: Number(sub.score),
              evidence_score: evidenceScore,
              duration_seconds: sub.duration,
              submitted_at: sub.submitted_at
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
            ...item
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
            Tactical Operations System Settings
          </p>
        </div>
      </div>

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
            className="flex items-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white px-5 py-2.5 rounded font-bold uppercase text-xs disabled:opacity-50"
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
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white"
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
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white"
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
                className="bg-black/40 hover:bg-black/60 border border-detective-border p-2.5 rounded text-white"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
