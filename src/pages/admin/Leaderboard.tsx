import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { BarChart3, Award, Clock, Loader, ShieldAlert, ShieldCheck, Lock } from 'lucide-react';

export default function Leaderboard() {
  const { adminUser } = useAuth();

  const [rankings, setRankings] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventStatus, setSelectedEventStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadRankings(selectedEventId);
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (!error && data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
        setSelectedEventStatus(data[0].status);
      } else {
        // Mock fallback
        const mockEvt = { id: 'evt-2026-demo-uuid', name: 'Mystery Y Symposium 2026', status: 'open' };
        setEvents([mockEvt]);
        setSelectedEventId(mockEvt.id);
        setSelectedEventStatus(mockEvt.status);
      }
    } catch (err) {
      console.error('Failed to load events', err);
    }
  };

  const loadRankings = async (evtId: string) => {
    setIsLoading(true);
    try {
      const { data: teams } = await supabase.from('teams').select('*').eq('event_id', evtId).neq('status', 'disqualified');
      const { data: submissions } = await supabase.from('submissions').select('*');
      const { data: answers } = await supabase.from('answers').select('*');
      const { data: questions } = await supabase.from('questions').select('*');

      if (!teams || !submissions) {
        setRankings([]);
        setIsLoading(false);
        return;
      }

      // Map ranking details
      const list = teams
        .map((t) => {
          const sub = submissions.find((s) => s.team_id === t.id);
          if (!sub) return null;

          // Evidence score details
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
            submitted_at: sub.submitted_at
          };
        })
        .filter(Boolean);

      // Sort logic
      // 1. Total score (descending)
      // 2. Evidence score (descending)
      // 3. Duration seconds (ascending)
      // 4. Submitted timestamp (ascending)
      list.sort((a: any, b: any) => {
        if (a.total_score !== b.total_score) return b.total_score - a.total_score;
        if (a.evidence_score !== b.evidence_score) return b.evidence_score - a.evidence_score;
        if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds;
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      });

      // Map ranks
      const rankedList = list.map((item, idx) => ({
        rank: idx + 1,
        ...item
      }));

      setRankings(rankedList);
    } catch (err) {
      console.error('Failed to load rankings', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeResults = async () => {
    if (!selectedEventId || !adminUser) return;
    if (!confirm('PERMANENTLY LOCK RANKS AND FINALIZE SNAPSHOT FOR THIS EVENT? THIS IS AN IMMUTABLE ACTION.')) return;
    
    setIsFinalizing(true);
    setFinalError(null);

    try {
      const { data, error } = await supabase.rpc('finalize_results_transaction', {
        p_event_id: selectedEventId,
        p_admin_id: adminUser.id
      });

      if (error) {
        setFinalError(error.message);
        setIsFinalizing(false);
        return;
      }

      if (data && !data.success) {
        setFinalError(data.error);
        setIsFinalizing(false);
        return;
      }

      // Reload
      await loadEvents();
      if (selectedEventId) {
        await loadRankings(selectedEventId);
      }
      setIsFinalizing(false);
    } catch (err: any) {
      setFinalError(err.message || 'Finalization failed');
      setIsFinalizing(false);
    }
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}m ${secs}s`;
  };

  const handleEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedEventId(id);
    const matched = events.find((evt) => evt.id === id);
    if (matched) setSelectedEventStatus(matched.status);
  };

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Symposium Rankings</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Official Tie-Breaker Standings
          </p>
        </div>

        {/* Finalize button gating role */}
        {adminUser?.role === 'super_admin' && selectedEventStatus !== 'closed' && (
          <button
            onClick={handleFinalizeResults}
            disabled={isFinalizing || rankings.length === 0}
            className="flex items-center gap-1.5 bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2 rounded text-xs font-bold tracking-wider uppercase transition-colors disabled:opacity-50"
          >
            <Lock className="w-4 h-4" /> Finalize Results
          </button>
        )}
      </div>

      {/* Status Bar */}
      {selectedEventStatus === 'closed' && (
        <div className="bg-detective-panel border border-detective-border rounded p-4 flex justify-between items-center">
          <span className="text-xs text-stone-400 font-bold uppercase">Event State: Closed</span>
          <span className="text-[10px] bg-detective-green/10 border border-detective-green/35 text-detective-green font-bold px-3 py-1 rounded tracking-widest uppercase flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" /> Snapshot Locked
          </span>
        </div>
      )}

      {finalError && (
        <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-3 rounded text-xs uppercase flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{finalError}</span>
        </div>
      )}

      {/* Standings table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          COMPUTING TIE-BREAKER STANDINGS...
        </div>
      ) : rankings.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted uppercase">
          No investigator teams have submitted dossiers for this event yet.
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4 text-center">RANK</th>
                <th className="p-4">TEAM ID</th>
                <th className="p-4">TEAM NAME</th>
                <th className="p-4 text-center">EVIDENCE SCORE</th>
                <th className="p-4 text-center">ELAPSED TIME</th>
                <th className="p-4">SUBMISSION TIMESTAMP</th>
                <th className="p-4 text-center">TOTAL SCORE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {rankings.map((team) => (
                <tr key={team.team_id_label} className={`hover:bg-black/10 transition-colors ${
                  team.rank <= 3 ? 'bg-detective-crimson/5 font-bold text-white shadow-inner' : ''
                }`}>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold ${
                      team.rank === 1 ? 'bg-yellow-500 text-black' :
                      team.rank === 2 ? 'bg-slate-300 text-black' :
                      team.rank === 3 ? 'bg-amber-600 text-black' :
                      'bg-black/40 text-detective-muted border border-detective-border'
                    }`}>
                      {team.rank}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-detective-crimson tracking-wider">{team.team_id_label}</td>
                  <td className="p-4 uppercase tracking-wide">{team.team_name}</td>
                  <td className="p-4 text-center text-detective-muted font-bold">{team.evidence_score} M</td>
                  <td className="p-4 text-center font-bold font-mono">
                    <span className="flex items-center justify-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-detective-crimson" />
                      {formatDuration(team.duration_seconds)}
                    </span>
                  </td>
                  <td className="p-4 text-detective-muted">{new Date(team.submitted_at).toLocaleString()}</td>
                  <td className="p-4 text-center font-bold text-md text-white font-mono">{team.total_score} Marks</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tie breaker rule reminder */}
      <div className="bg-black/15 border border-detective-border/60 rounded p-4 text-[10px] leading-relaxed text-detective-muted uppercase space-y-1">
        <div className="font-bold text-white flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-detective-crimson" /> Official standing tie-breaker protocols:
        </div>
        <div>1. Highest Total Score Sum</div>
        <div>2. Highest Cumulative Evidence/Reasoning Score</div>
        <div>3. Lowest Total Investigation Session Time</div>
        <div>4. Chronological Earliest Case Submission Timestamp</div>
      </div>

    </div>
  );
}
