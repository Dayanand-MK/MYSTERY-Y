import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  Search,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  CheckCircle,
  Loader,
  Filter,
  Eye,
  Lock,
  Unlock,
  Ban,
  Clock,
  Radio,
  FileSpreadsheet,
  X,
  Check,
} from 'lucide-react';

export default function Security() {
  const { adminUser } = useAuth();

  const [logs, setLogs] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');

  // Inspection & Review Modal state
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Admin Action Modal state (Unlock / Terminate)
  const [actionType, setActionType] = useState<'allow_continue' | 'terminate' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live Toast Notification
  const [liveToast, setLiveToast] = useState<{
    id: string;
    team_label: string;
    event_type: string;
    attempt: number;
    severity: string;
  } | null>(null);

  const teamsRef = React.useRef(teams);
  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  useEffect(() => {
    loadData();

    // Listen to real-time security events
    const channelName = `admin-security-incident-center-${Date.now()}`;
    const logChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_logs' }, (payload: any) => {
        loadData();
        if (payload.new) {
          const t = teamsRef.current.find((tm) => tm.id === payload.new.team_id);
          const attempt = payload.new.details?.attempt_number || 1;
          setLiveToast({
            id: payload.new.id,
            team_label: t?.team_id_label || 'TEAM',
            event_type: payload.new.event_type.replace('_', ' ').toUpperCase(),
            attempt,
            severity: payload.new.severity || 'medium',
          });
          setTimeout(() => setLiveToast(null), 6000);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'security_logs' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investigation_sessions' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => loadData())
      .subscribe();

    // Periodic fallback polling every 5s
    const pollInterval = setInterval(() => {
      loadData();
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(logChannel);
    };
  }, []);

  const loadData = async () => {
    try {
      const [lRes, tRes, cRes, sRes, subRes] = await Promise.all([
        supabase.from('security_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('teams').select('id, name, team_id_label, case_id, status'),
        supabase.from('cases').select('id, case_number, title'),
        supabase.from('investigation_sessions').select('id, team_id, case_id, started_at, status'),
        supabase.from('submissions').select('id, team_id, case_id, score, duration, started_at, is_finalized'),
      ]);

      if (lRes.data) setLogs(lRes.data);
      if (tRes.data) setTeams(tRes.data);
      if (cRes.data) setCases(cRes.data);
      if (sRes.data) setSessions(sRes.data);
      if (subRes.data) setSubmissions(subRes.data);
    } catch (err) {
      console.error('Failed to load security center data', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper getters
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);
  const getCase = (caseId: string) => cases.find((c) => c.id === caseId);
  const getTeamLogs = (teamId: string) => logs.filter((l) => l.team_id === teamId);
  const getTeamSession = (teamId: string) => sessions.find((s) => s.team_id === teamId);
  const getTeamSubmission = (teamId: string) => submissions.find((s) => s.team_id === teamId);

  // Group team incident metrics
  const teamIncidentsMap = useMemo(() => {
    const map = new Map<string, { count: number; isLocked: boolean; isUnlocked: boolean; isTerminated: boolean }>();
    teams.forEach((t) => {
      const tLogs = logs.filter((l) => l.team_id === t.id);
      const count = tLogs.length;
      const sess = sessions.find((s) => s.team_id === t.id);
      const hasUnlock = count >= 3 && sess?.status === 'active';
      const isTerminated = t.status === 'disqualified' || t.status === 'terminated' || sess?.status === 'terminated';
      const isLocked = sess?.status === 'locked' && !isTerminated;
      map.set(t.id, { count, isLocked, isUnlocked: hasUnlock, isTerminated });
    });
    return map;
  }, [teams, logs, sessions]);

  // Live Summary Counters
  const liveIncidentsCount = logs.length;
  const lockedSessionsCount = Array.from(teamIncidentsMap.values()).filter((v) => v.isLocked).length;
  const unreviewedCount = logs.filter((l) => !l.is_reviewed).length;

  // Mark single incident as reviewed
  const handleMarkReviewed = async (logId: string) => {
    if (!adminUser) return;
    try {
      await supabase
        .from('security_logs')
        .update({
          is_reviewed: true,
          admin_action: `Reviewed by ${adminUser.email}`,
        })
        .eq('id', logId);

      await loadData();
    } catch (err) {
      console.error('Failed to review log', err);
    }
  };

  // Perform Admin Action: ALLOW CONTINUE
  const handleAllowContinue = async () => {
    if (!selectedTeamId || !adminUser) return;
    if (!actionReason.trim()) {
      setActionError('Reason / Note is required for supervisor clearance.');
      return;
    }

    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const sess = getTeamSession(selectedTeamId);
      if (!sess) throw new Error('No investigation session exists for this team.');
      const { data, error } = await supabase.rpc('unlock_security_session', {
        p_session_id: sess.id,
        p_note: actionReason.trim(),
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Unable to unlock the investigation session.');

      await loadData();
      setActionType(null);
      setActionReason('');
    } catch (err: any) {
      console.error('Failed to allow continue', err);
      setActionError(err.message || 'Failed to submit supervisor clearance');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Perform Admin Action: TERMINATE INVESTIGATION
  const handleTerminateInvestigation = async () => {
    if (!selectedTeamId || !adminUser) return;
    if (!actionReason.trim()) {
      setActionError('Reason / Note is required for investigation termination.');
      return;
    }

    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const adminIdentity = `${adminUser.email} (${adminUser.role})`;
      const timestamp = new Date().toISOString();
      const terminationNote = `TERMINATED: ${actionReason.trim()} [Terminated by ${adminIdentity} at ${timestamp}]`;

      // 1. Mark team status as terminated / disqualified
      await supabase
        .from('teams')
        .update({ status: 'terminated' })
        .eq('id', selectedTeamId);

      // 2. Mark session status as terminated
      const sess = getTeamSession(selectedTeamId);
      if (sess) {
        await supabase
          .from('investigation_sessions')
          .update({ status: 'terminated', ended_at: timestamp })
          .eq('id', sess.id);
      }

      // 3. Mark submission as finalized/terminated
      const sub = getTeamSubmission(selectedTeamId);
      if (sub) {
        await supabase
          .from('submissions')
          .update({ is_finalized: true, grading_notes: terminationNote })
          .eq('id', sub.id);
      }

      // 4. Update security logs with termination action
      const teamLogs = getTeamLogs(selectedTeamId);
      for (const log of teamLogs) {
        await supabase
          .from('security_logs')
          .update({
            is_reviewed: true,
            admin_action: terminationNote,
          })
          .eq('id', log.id);
      }

      // 5. Log to disciplinary actions audit table
      await supabase.from('disciplinary_actions').insert({
        team_id: selectedTeamId,
        session_id: sess?.id || null,
        action: 'disqualification',
        reason: terminationNote,
        created_by: adminUser.id || 'b2ece65e-d728-4220-a40f-66f3234caeef',
      });

      // 6. Log to admin actions table
      await supabase.from('admin_actions').insert({
        admin_id: adminUser.id || 'b2ece65e-d728-4220-a40f-66f3234caeef',
        action_type: 'SECURITY_TERMINATE_INVESTIGATION',
        details: {
          team_id: selectedTeamId,
          reason: actionReason.trim(),
          timestamp,
        },
      });

      await loadData();
      setActionType(null);
      setActionReason('');
    } catch (err: any) {
      console.error('Failed to terminate investigation', err);
      setActionError(err.message || 'Failed to submit investigation termination');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Filtered List
  const filteredLogs = logs.filter((l) => {
    const tm = getTeam(l.team_id);
    const teamName = tm?.name?.toLowerCase() || '';
    const teamLabel = tm?.team_id_label?.toLowerCase() || '';
    const eventType = l.event_type?.toLowerCase() || '';
    const query = search.toLowerCase();

    const matchSearch =
      teamName.includes(query) || teamLabel.includes(query) || eventType.includes(query);

    const matchSeverity = severityFilter === 'all' || l.severity === severityFilter;

    const metrics = tm ? teamIncidentsMap.get(tm.id) : null;
    const matchReview =
      reviewFilter === 'all' ||
      (reviewFilter === 'reviewed' && l.is_reviewed) ||
      (reviewFilter === 'unreviewed' && !l.is_reviewed) ||
      (reviewFilter === 'locked' && metrics?.isLocked);

    return matchSearch && matchSeverity && matchReview;
  });

  const activeReviewTeam = selectedTeamId ? getTeam(selectedTeamId) : null;
  const activeReviewCase = activeReviewTeam ? getCase(activeReviewTeam.case_id) : null;
  const activeReviewLogs = selectedTeamId ? getTeamLogs(selectedTeamId) : [];
  const activeReviewSession = selectedTeamId ? getTeamSession(selectedTeamId) : null;
  const activeReviewSub = selectedTeamId ? getTeamSubmission(selectedTeamId) : null;
  const activeReviewMetrics = selectedTeamId ? teamIncidentsMap.get(selectedTeamId) : null;

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Real-time Toast Alert */}
      {liveToast && (
        <div className="fixed top-20 right-6 z-50 bg-detective-panel border-2 border-detective-crimson rounded-lg p-4 shadow-[0_0_25px_rgba(239,68,68,0.5)] animate-bounce text-xs max-w-sm">
          <div className="flex items-center justify-between gap-2 border-b border-detective-crimson/30 pb-1.5 mb-2">
            <span className="font-bold text-detective-alert flex items-center gap-1.5 uppercase">
              <ShieldAlert className="w-4 h-4 text-detective-crimson animate-pulse" />
              ⚠ LIVE SECURITY INCIDENT
            </span>
            <button onClick={() => setLiveToast(null)} className="text-detective-muted hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="text-white font-bold">{liveToast.team_label}</div>
            <div className="text-detective-crimson font-bold text-[11px]">{liveToast.event_type}</div>
            <div className="text-[10px] text-detective-amber font-bold">SECURITY ATTEMPT: {liveToast.attempt} / 3</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-detective-crimson" />
            Security Incident Center
          </h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Authoritative 3-Strike Investigation Monitoring &amp; Session Control
          </p>
        </div>
        <div className="flex items-center gap-2 bg-black/40 border border-detective-border px-3 py-1.5 rounded text-xs">
          <Radio className="w-3.5 h-3.5 text-detective-green animate-pulse" />
          <span className="text-detective-green font-bold">[ REALTIME FEED ACTIVE ]</span>
        </div>
      </div>

      {/* Top Live Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-detective-panel border border-detective-border rounded p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-detective-muted uppercase font-bold tracking-wider">
              LIVE SECURITY INCIDENTS
            </div>
            <div className="text-2xl font-bold text-white mt-1">{liveIncidentsCount}</div>
          </div>
          <div className="bg-detective-crimson/15 p-3 rounded-full border border-detective-crimson/40 text-detective-alert">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-detective-panel border border-detective-border rounded p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-detective-muted uppercase font-bold tracking-wider">
              LOCKED SESSIONS (3/3)
            </div>
            <div className="text-2xl font-bold text-detective-crimson mt-1">{lockedSessionsCount}</div>
          </div>
          <div className={`p-3 rounded-full border ${lockedSessionsCount > 0 ? 'bg-detective-crimson/25 border-detective-crimson text-detective-crimson animate-pulse' : 'bg-white/5 border-detective-border text-detective-muted'}`}>
            <Lock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-detective-panel border border-detective-border rounded p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-detective-muted uppercase font-bold tracking-wider">
              UNREVIEWED INCIDENTS
            </div>
            <div className="text-2xl font-bold text-detective-amber mt-1">{unreviewedCount}</div>
          </div>
          <div className="bg-detective-amber/15 p-3 rounded-full border border-detective-amber/40 text-detective-amber">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-detective-panel border border-detective-border rounded p-4 items-center">
        
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-detective-muted">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Team or Event..."
            className="w-full bg-black/35 border border-detective-border rounded pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson uppercase"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-detective-muted" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full bg-black/35 border border-detective-border rounded p-2 text-xs text-white focus:outline-none uppercase"
          >
            <option value="all">ALL SEVERITIES</option>
            <option value="low">LOW</option>
            <option value="medium">MEDIUM</option>
            <option value="high">HIGH</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-detective-muted" />
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            className="w-full bg-black/35 border border-detective-border rounded p-2 text-xs text-white focus:outline-none uppercase"
          >
            <option value="all">ALL STATUSES</option>
            <option value="unreviewed">UNREVIEWED</option>
            <option value="reviewed">REVIEWED</option>
            <option value="locked">LOCKED SESSIONS (3/3)</option>
          </select>
        </div>

      </div>

      {/* Incident Records Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          CONNECTING INTEGRITY PROTOCOLS...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted">
          NO SECURITY INCIDENTS LOGGED.
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold text-[10px]">
                <th className="p-3.5">TIMESTAMP</th>
                <th className="p-3.5">TEAM ID</th>
                <th className="p-3.5">TEAM NAME</th>
                <th className="p-3.5">EVENT INCIDENT</th>
                <th className="p-3.5 text-center">ATTEMPT</th>
                <th className="p-3.5 text-center">SEVERITY</th>
                <th className="p-3.5">STATUS</th>
                <th className="p-3.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {filteredLogs.map((log) => {
                const tm = getTeam(log.team_id);
                const attemptNum = log.details?.attempt_number || '-';
                const metrics = tm ? teamIncidentsMap.get(tm.id) : null;

                return (
                  <tr key={log.id} className="hover:bg-black/20 transition-colors">
                    <td className="p-3.5 text-detective-muted">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="p-3.5 text-detective-crimson font-bold tracking-wider">
                      {tm?.team_id_label || 'SYSTEM'}
                    </td>
                    <td className="p-3.5 text-white uppercase font-bold">
                      {tm?.name || 'SYSTEM'}
                    </td>
                    <td className="p-3.5 text-white uppercase font-bold tracking-wide">
                      {log.event_type.replace('_', ' ')}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="font-bold text-detective-amber">
                        {attemptNum} / 3
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${
                        log.severity === 'high'
                          ? 'border-detective-crimson text-detective-alert bg-detective-crimson/10 animate-pulse'
                          : log.severity === 'medium'
                            ? 'border-detective-amber text-detective-amber bg-detective-amber/10'
                            : 'border-detective-border text-detective-muted bg-white/5'
                      }`}>
                        {log.severity}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {metrics?.isTerminated ? (
                        <span className="text-detective-crimson font-bold flex items-center gap-1">
                          <Ban className="w-3.5 h-3.5" /> Terminated
                        </span>
                      ) : metrics?.isLocked ? (
                        <span className="text-detective-crimson font-bold flex items-center gap-1 animate-pulse">
                          <Lock className="w-3.5 h-3.5" /> Locked (3/3)
                        </span>
                      ) : metrics?.isUnlocked ? (
                        <span className="text-detective-green font-bold flex items-center gap-1">
                          <Unlock className="w-3.5 h-3.5" /> Override Cleared
                        </span>
                      ) : log.is_reviewed ? (
                        <span className="text-detective-green flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Reviewed
                        </span>
                      ) : (
                        <span className="text-detective-amber flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Unreviewed
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedTeamId(log.team_id)}
                        className={`border px-2.5 py-1 rounded text-[10px] uppercase font-bold transition-all inline-flex items-center gap-1 cursor-pointer ${
                          metrics?.isLocked
                            ? 'bg-detective-crimson hover:bg-detective-alert text-white border-detective-crimson animate-pulse'
                            : 'bg-black/30 hover:bg-black/60 border-detective-border text-detective-muted hover:text-white'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        {metrics?.isLocked ? 'Review Session' : 'Inspect'}
                      </button>
                      {!log.is_reviewed && (
                        <button
                          onClick={() => handleMarkReviewed(log.id)}
                          className="bg-detective-green/10 hover:bg-detective-green border border-detective-green/40 text-detective-green hover:text-white px-2 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detailed Team Security Review Modal */}
      {selectedTeamId && activeReviewTeam && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border-2 border-detective-border rounded-lg p-6 max-w-2xl w-full font-mono text-xs max-h-[90vh] overflow-y-auto shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-detective-border pb-3 mb-4">
              <div>
                <span className="text-[10px] text-detective-crimson font-bold uppercase tracking-widest block">
                  SECURITY DOSSIER REVIEW
                </span>
                <h3 className="text-base font-bold text-white uppercase mt-0.5">
                  {activeReviewTeam.team_id_label} — {activeReviewTeam.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedTeamId(null);
                  setActionType(null);
                  setActionReason('');
                }}
                className="text-detective-muted hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Team & Session Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 rounded border border-detective-border/60 p-3 mb-4 text-[10px]">
              <div>
                <span className="text-detective-muted block font-bold">CASE ID</span>
                <span className="text-white font-bold">{activeReviewCase?.case_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-detective-muted block font-bold">SUBMISSION ID</span>
                <span className="text-white font-bold truncate block">{activeReviewSub?.id?.slice(0, 8) || 'IN PROGRESS'}</span>
              </div>
              <div>
                <span className="text-detective-muted block font-bold">CURRENT SCORE</span>
                <span className="text-detective-amber font-bold">{activeReviewSub?.score ?? 0} MARKS</span>
              </div>
              <div>
                <span className="text-detective-muted block font-bold">SECURITY STATUS</span>
                <span className={`font-bold ${
                  activeReviewMetrics?.isTerminated
                    ? 'text-detective-crimson'
                    : activeReviewMetrics?.isLocked
                      ? 'text-detective-crimson animate-pulse'
                      : activeReviewMetrics?.isUnlocked
                        ? 'text-detective-green'
                        : 'text-detective-amber'
                }`}>
                  {activeReviewMetrics?.isTerminated
                    ? 'TERMINATED'
                    : activeReviewMetrics?.isLocked
                      ? 'LOCKED (3/3)'
                      : activeReviewMetrics?.isUnlocked
                        ? 'OVERRIDE CLEARED'
                        : 'ACTIVE'}
                </span>
              </div>
            </div>

            {/* Incident Chronological Timeline */}
            <div className="mb-6 space-y-3">
              <div className="font-bold text-detective-crimson uppercase tracking-wider text-xs border-b border-detective-border pb-1">
                Incident Timeline ({activeReviewLogs.length} Total)
              </div>

              {activeReviewLogs.length === 0 ? (
                <div className="p-4 bg-black/20 rounded text-center text-detective-muted text-xs">
                  No security incidents recorded for this team.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {activeReviewLogs.map((log, idx) => (
                    <div
                      key={log.id}
                      className="p-3 bg-black/30 border border-detective-border/50 rounded flex flex-col gap-1 text-[11px]"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white uppercase">
                          {idx + 1}. {log.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-detective-muted text-[10px]">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-detective-amber font-bold">
                          ATTEMPT: {log.details?.attempt_number || idx + 1} / 3
                        </span>
                        <span className={`uppercase font-bold ${
                          log.severity === 'high' ? 'text-detective-crimson' : 'text-detective-amber'
                        }`}>
                          SEVERITY: {log.severity}
                        </span>
                      </div>
                      {log.admin_action && (
                        <div className="text-[10px] text-detective-green border-t border-white/5 pt-1 mt-1">
                          ↳ {log.admin_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin Action Section */}
            {activeReviewMetrics?.isLocked && !actionType && (
              <div className="bg-detective-crimson/10 border border-detective-crimson/40 rounded p-4 mb-4 space-y-3">
                <div className="text-detective-alert font-bold text-xs uppercase flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-detective-crimson" />
                  Supervisor Decision Required for 3/3 Lockout
                </div>
                <p className="text-[11px] text-stone-300">
                  This participant is currently blocked at 3/3 security incidents. Choose an authorized action:
                </p>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => {
                      setActionType('allow_continue');
                      setActionReason('');
                      setActionError(null);
                    }}
                    className="flex-1 bg-detective-green hover:bg-green-600 text-white font-bold py-2 px-3 rounded uppercase text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" /> [ ALLOW CONTINUE ]
                  </button>
                  <button
                    onClick={() => {
                      setActionType('terminate');
                      setActionReason('');
                      setActionError(null);
                    }}
                    className="flex-1 bg-detective-crimson hover:bg-detective-alert text-white font-bold py-2 px-3 rounded uppercase text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> [ TERMINATE INVESTIGATION ]
                  </button>
                </div>
              </div>
            )}

            {/* Action Confirmation & Reason Form */}
            {actionType && (
              <div className="bg-black/50 border border-detective-crimson rounded p-4 mb-4 space-y-3">
                <div className="font-bold text-white uppercase text-xs flex items-center justify-between">
                  <span>
                    {actionType === 'allow_continue' ? 'Unlock Investigation Session?' : 'Confirm Investigation Termination'}
                  </span>
                  <button onClick={() => setActionType(null)} className="text-detective-muted hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[11px] text-stone-300">
                  {actionType === 'allow_continue'
                    ? `Team: ${activeReviewTeam.team_id_label} • Current violations: ${activeReviewMetrics?.count || 3} / 3. This preserves security history and allows the participant to continue. Enter the unlock note:`
                    : 'Terminating will permanently finalize this investigation. Enter the termination reason:'}
                </p>

                {actionError && (
                  <div className="text-[10px] text-detective-alert font-bold uppercase">
                    ⚠ {actionError}
                  </div>
                )}

                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={actionType === 'allow_continue' ? 'e.g. Participant accidentally exited fullscreen while checking event instructions.' : 'e.g. Repeated unauthorized window departure detected.'}
                  rows={3}
                  className="w-full bg-black/70 border border-detective-border rounded p-2.5 text-xs text-white focus:outline-none focus:border-detective-crimson"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setActionType(null)}
                    disabled={isSubmittingAction}
                    className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={actionType === 'allow_continue' ? handleAllowContinue : handleTerminateInvestigation}
                    disabled={isSubmittingAction}
                    className={`px-4 py-1.5 rounded text-white font-bold text-xs uppercase cursor-pointer flex items-center gap-1 ${
                      actionType === 'allow_continue' ? 'bg-detective-green hover:bg-green-600' : 'bg-detective-crimson hover:bg-detective-alert'
                    }`}
                  >
                    {isSubmittingAction ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {actionType === 'allow_continue' ? 'Confirm Unlock' : 'Confirm Termination'}
                  </button>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-detective-border pt-4">
              <button
                onClick={() => {
                  setSelectedTeamId(null);
                  setActionType(null);
                }}
                className="px-4 py-2 rounded border border-detective-border text-detective-muted hover:text-white text-xs cursor-pointer"
              >
                Close Dossier
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
