import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Terminal, Users, Briefcase, FileSpreadsheet, ShieldAlert, Clock, AlertTriangle, Play, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTeams: 0,
    activeInvestigations: 0,
    submittedCases: 0,
    pendingEvaluations: 0,
    securityAlertsCount: 0,
    avgTimeSeconds: 0
  });
  const [activeTeams, setActiveTeams] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sync dashboard values on load
  useEffect(() => {
    async function loadDashboardData() {
      setIsLoading(true);
      try {
        // 1. Fetch general tables
        const { data: teams } = await supabase.from('teams').select('id, name, status, team_id_label, created_at');
        const { data: submissions } = await supabase.from('submissions').select('id, duration, is_finalized');
        const { data: logs } = await supabase.from('security_logs').select('id, event_type, created_at, team_id');

        const totalTeams = teams?.length || 0;
        const activeInvestigations = teams?.filter(t => t.status === 'active').length || 0;
        const submittedCases = teams?.filter(t => t.status === 'submitted').length || 0;
        const pendingEvaluations = submissions?.filter(s => !s.is_finalized).length || 0;
        const securityAlertsCount = logs?.length || 0;

        // Calculate average duration
        const totalDuration = submissions?.reduce((sum, s) => sum + s.duration, 0) || 0;
        const avgTimeSeconds = submissions && submissions.length > 0 ? Math.floor(totalDuration / submissions.length) : 0;

        setStats({
          totalTeams,
          activeInvestigations,
          submittedCases,
          pendingEvaluations,
          securityAlertsCount,
          avgTimeSeconds
        });

        // 2. Fetch active teams details
        if (teams) {
          const activeList = teams.filter(t => t.status === 'active' || t.status === 'submitted');
          setActiveTeams(activeList.slice(0, 10)); // Take top 10 recent
        }

        // 3. Compile chronological timeline logs
        const compileTimeline = [];
        
        if (teams) {
          teams.forEach(t => {
            compileTimeline.push({
              type: 'team_register',
              title: `Team Registered: ${t.team_id_label}`,
              detail: t.name,
              time: new Date(t.created_at)
            });
          });
        }

        if (logs && teams) {
          logs.forEach(l => {
            const team = teams.find(t => t.id === l.team_id);
            compileTimeline.push({
              type: 'security_alert',
              title: `Security Log: ${l.event_type.toUpperCase()}`,
              detail: team ? `${team.team_id_label} (${team.name})` : 'System',
              time: new Date(l.created_at)
            });
          });
        }

        // Sort by time descending
        compileTimeline.sort((a, b) => b.time.getTime() - a.time.getTime());
        setRecentLogs(compileTimeline.slice(0, 15));

      } catch (err) {
        console.error('Failed to load dashboard statistics', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();

    // Listen to real-time events to refresh stats
    const teamChannel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', table: 'teams' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', table: 'security_logs' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', table: 'submissions' }, () => loadDashboardData())
      .subscribe();

    return () => {
      teamChannel.unsubscribe();
    };
  }, []);

  const formatAvgTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-xs text-detective-muted">
        <Terminal className="w-4 h-4 animate-spin text-detective-crimson mr-2" />
        LOADING COMMAND CENTER METRICS...
      </div>
    );
  }

  // Dashboard Cards Definition
  const metrics = [
    { title: 'Registered Teams', value: stats.totalTeams, icon: Users, color: 'border-l-detective-border text-white' },
    { title: 'Active Investigations', value: stats.activeInvestigations, icon: Play, color: 'border-l-detective-amber text-detective-amber animate-pulse-subtle' },
    { title: 'Submitted Cases', value: stats.submittedCases, icon: CheckCircle, color: 'border-l-detective-green text-detective-green' },
    { title: 'Pending Evaluations', value: stats.pendingEvaluations, icon: FileSpreadsheet, color: 'border-l-detective-crimson text-detective-alert' },
    { title: 'Security Violations', value: stats.securityAlertsCount, icon: ShieldAlert, color: 'border-l-detective-crimson text-red-500' },
    { title: 'Avg Investigation Time', value: formatAvgTime(stats.avgTimeSeconds), icon: Clock, color: 'border-l-detective-border text-white' }
  ];

  return (
    <div className="space-y-6 font-mono">
      
      {/* Page Title Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Investigation Status Grid</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Active Tactical Operations Room
          </p>
        </div>
      </div>

      {/* Grid Cards metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`bg-detective-panel border border-detective-border border-l-4 rounded p-5 flex items-center justify-between shadow-md ${card.color}`}
            >
              <div className="space-y-1">
                <span className="text-[10px] text-detective-muted uppercase tracking-widest block font-bold">
                  {card.title}
                </span>
                <span className="text-2xl font-bold font-mono tracking-tight">
                  {card.value}
                </span>
              </div>
              <div className="bg-black/20 p-3 rounded">
                <Icon className="w-5 h-5 flex-shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid details splits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        
        {/* Active investigations list */}
        <div className="bg-detective-panel border border-detective-border rounded p-6 flex flex-col h-[400px]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-detective-amber animate-pulse" /> Active Feeds ({activeTeams.length})
          </h3>
          
          <div className="flex-grow overflow-y-auto space-y-3.5 pr-2">
            {activeTeams.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-detective-muted uppercase">
                No active investigator feeds online.
              </div>
            ) : (
              activeTeams.map((team) => (
                <div
                  key={team.id}
                  className="p-3 bg-black/25 rounded border border-detective-border/50 flex justify-between items-center text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-white uppercase">{team.name}</div>
                    <div className="text-[10px] text-detective-crimson font-bold">{team.team_id_label}</div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-widest uppercase border ${
                    team.status === 'active'
                      ? 'border-detective-amber text-detective-amber bg-detective-amber/5 animate-pulse'
                      : 'border-detective-green text-detective-green bg-detective-green/5'
                  }`}>
                    {team.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live System Activity log */}
        <div className="bg-detective-panel border border-detective-border rounded p-6 flex flex-col h-[400px]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-detective-crimson animate-pulse" /> Command Activity Log
          </h3>

          <div className="flex-grow overflow-y-auto space-y-2.5 text-[10px] pr-2 scrollbar-thin">
            {recentLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-detective-muted uppercase">
                No command actions reported.
              </div>
            ) : (
              recentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="py-2 border-b border-detective-border/30 flex justify-between items-start"
                >
                  <div className="space-y-0.5">
                    <div className={`font-bold uppercase ${
                      log.type === 'security_alert' ? 'text-detective-alert' : 'text-detective-green'
                    }`}>
                      {log.title}
                    </div>
                    <div className="text-detective-text/80 truncate max-w-[250px]">{log.detail}</div>
                  </div>
                  <span className="text-[9px] text-detective-muted">
                    {log.time.toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
