import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Search, ShieldAlert, AlertTriangle, ShieldCheck, CheckCircle, Loader, Filter, Eye } from 'lucide-react';

export default function Security() {
  const { adminUser } = useAuth();

  const [logs, setLogs] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    loadData();

    // Listen to real-time security events
    const logChannel = supabase
      .channel('security-feed-updates')
      .on('postgres_changes', { event: '*', table: 'security_logs' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(logChannel);
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: lData } = await supabase
        .from('security_logs')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: tData } = await supabase.from('teams').select('id, name, team_id_label');

      if (lData) setLogs(lData);
      if (tData) setTeams(tData);
    } catch (err) {
      console.error('Failed to load security logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkReviewed = async (logId: string) => {
    if (!adminUser) return;
    try {
      await supabase
        .from('security_logs')
        .update({
          is_reviewed: true,
          admin_action: `Reviewed by ${adminUser.email}`
        })
        .eq('id', logId);

      await loadData();
      if (selectedLog && selectedLog.id === logId) {
        setSelectedLog(null);
      }
    } catch (err) {
      console.error('Failed to review log', err);
    }
  };

  const getTeamName = (teamId: string) => {
    const t = teams.find((tm) => tm.id === teamId);
    return t ? t.name : 'SYSTEM';
  };

  const getTeamLabel = (teamId: string) => {
    const t = teams.find((tm) => tm.id === teamId);
    return t ? t.team_id_label : 'SYSTEM';
  };

  // Filtered List
  const filteredLogs = logs.filter((l) => {
    const teamName = getTeamName(l.team_id).toLowerCase();
    const teamLabel = getTeamLabel(l.team_id).toLowerCase();
    const eventType = l.event_type.toLowerCase();
    const query = search.toLowerCase();

    const matchSearch =
      teamName.includes(query) || teamLabel.includes(query) || eventType.includes(query);

    const matchSeverity = severityFilter === 'all' || l.severity === severityFilter;

    const matchReview =
      reviewFilter === 'all' ||
      (reviewFilter === 'reviewed' && l.is_reviewed) ||
      (reviewFilter === 'unreviewed' && !l.is_reviewed);

    return matchSearch && matchSeverity && matchReview;
  });

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Security Incident Center</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Real-Time Integrity Violations Monitoring
          </p>
        </div>
      </div>

      {/* Filters Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-detective-panel border border-detective-border rounded p-4 items-center">
        
        {/* Search */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-detective-muted">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Team or Event..."
            className="w-full bg-black/35 border border-detective-border rounded pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson placeholder:text-gray-500 uppercase"
          />
        </div>

        {/* Severity */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-detective-muted" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full bg-black/35 border border-detective-border rounded p-2 text-xs text-white focus:outline-none text-xs"
          >
            <option value="all">ALL SEVERITIES</option>
            <option value="low">LOW</option>
            <option value="medium">MEDIUM</option>
            <option value="high">HIGH</option>
          </select>
        </div>

        {/* Reviewed */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-detective-muted" />
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            className="w-full bg-black/35 border border-detective-border rounded p-2 text-xs text-white focus:outline-none text-xs"
          >
            <option value="all">ALL STATUSES</option>
            <option value="unreviewed">UNREVIEWED</option>
            <option value="reviewed">REVIEWED</option>
          </select>
        </div>

      </div>

      {/* Grid listing */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          CONNECTING INTEGRITY PROTOCOLS...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted">
          NO SECURITY ANOMALIES LOGGED.
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4">TIMESTAMP</th>
                <th className="p-4">TEAM ID</th>
                <th className="p-4">TEAM NAME</th>
                <th className="p-4">EVENT INCIDENT</th>
                <th className="p-4 text-center">SEVERITY</th>
                <th className="p-4">REVIEW</th>
                <th className="p-4 text-right">AUDIT ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-black/10 transition-colors">
                  <td className="p-4 text-detective-muted">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-4 text-detective-crimson font-bold tracking-wider">{getTeamLabel(log.team_id)}</td>
                  <td className="p-4 text-white uppercase font-bold">{getTeamName(log.team_id)}</td>
                  <td className="p-4 text-white uppercase font-bold tracking-wide">{log.event_type.replace('_', ' ')}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold border uppercase ${
                      log.severity === 'high' ? 'border-detective-crimson text-detective-alert bg-detective-crimson/5 animate-pulse' :
                      log.severity === 'medium' ? 'border-detective-amber text-detective-amber bg-detective-amber/5' :
                      'border-detective-border text-detective-muted bg-white/5'
                    }`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="p-4">
                    {log.is_reviewed ? (
                      <span className="text-detective-green flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Reviewed
                      </span>
                    ) : (
                      <span className="text-detective-amber flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="bg-black/25 hover:bg-black/60 border border-detective-border text-detective-muted px-2 py-1 rounded text-[10px] uppercase font-bold transition-all inline-flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect
                    </button>
                    {!log.is_reviewed && (
                      <button
                        onClick={() => handleMarkReviewed(log.id)}
                        className="bg-detective-green/10 hover:bg-detective-green border border-detective-green/35 text-detective-green hover:text-white px-2 py-1 rounded text-[10px] uppercase font-bold transition-all"
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspect Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs">
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-detective-crimson animate-pulse" /> Incident Diagnostic Report
            </h3>

            <div className="space-y-3.5 mb-6 text-xs text-detective-text">
              <div>
                <span className="text-detective-muted uppercase block text-[9px]">Timestamp</span>
                <span className="font-bold text-white">{new Date(selectedLog.created_at).toLocaleString()}</span>
              </div>
              
              <div>
                <span className="text-detective-muted uppercase block text-[9px]">Violator Team</span>
                <span className="font-bold text-white uppercase">{getTeamLabel(selectedLog.team_id)} - {getTeamName(selectedLog.team_id)}</span>
              </div>

              <div>
                <span className="text-detective-muted uppercase block text-[9px]">Incident Class</span>
                <span className="font-bold text-white uppercase">{selectedLog.event_type.replace('_', ' ')}</span>
              </div>

              <div>
                <span className="text-detective-muted uppercase block text-[9px]">Diagnostic Parameters</span>
                <pre className="bg-black/30 p-2.5 rounded border border-detective-border/40 text-[10px] text-detective-muted overflow-x-auto whitespace-pre-wrap max-h-36">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>

              {selectedLog.admin_action && (
                <div>
                  <span className="text-detective-muted uppercase block text-[9px]">Resolution action</span>
                  <span className="text-detective-green block font-bold">{selectedLog.admin_action}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-3.5 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Close Report
              </button>
              {!selectedLog.is_reviewed && (
                <button
                  onClick={() => handleMarkReviewed(selectedLog.id)}
                  className="px-4 py-1.5 rounded bg-detective-green hover:bg-green-600 text-white font-bold"
                >
                  Mark Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
