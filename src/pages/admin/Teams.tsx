import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Search, ShieldAlert, AlertTriangle, UserX, UserCheck, Trash2, Filter, Loader, Clipboard } from 'lucide-react';

export default function Teams() {
  const { adminUser } = useAuth();
  
  const [teams, setTeams] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  // Disciplinary overlay modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [actionType, setActionType] = useState<'warning' | 'flag' | 'disqualification'>('warning');
  const [actionReason, setActionReason] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: tData } = await supabase.from('teams').select('*');
      const { data: mData } = await supabase.from('team_members').select('*');
      const { data: cData } = await supabase.from('cases').select('id, case_number, title');
      const { data: cdData } = await supabase.from('case_access_codes').select('*');
      const { data: lData } = await supabase.from('security_logs').select('team_id');
      const { data: sData } = await supabase.from('submissions').select('team_id, duration, score');

      if (tData) setTeams(tData);
      if (mData) setMembers(mData);
      if (cData) setCases(cData);
      if (cdData) setCodes(cdData);
      if (lData) setLogs(lData);
      if (sData) setSubmissions(sData);
    } catch (err) {
      console.error('Failed to load team logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenActionModal = (team: any, type: 'warning' | 'flag' | 'disqualification') => {
    setSelectedTeam(team);
    setActionType(type);
    setActionReason('');
    setIsModalOpen(true);
  };

  const handleExecuteAction = async () => {
    if (!selectedTeam || !actionReason.trim() || !adminUser) return;
    setIsActionSubmitting(true);

    try {
      // 1. Determine target status
      let nextStatus = selectedTeam.status;
      if (actionType === 'disqualification') {
        nextStatus = 'disqualified';
      } else if (actionType === 'flag') {
        nextStatus = 'flagged';
      }

      // 2. Update team status
      await supabase
        .from('teams')
        .update({ status: nextStatus })
        .eq('id', selectedTeam.id);

      // 3. Log disciplinary action
      await supabase.from('disciplinary_actions').insert({
        team_id: selectedTeam.id,
        action: actionType,
        reason: actionReason.trim(),
        created_by: adminUser.id
      });

      // 4. Log admin activity
      await supabase.from('admin_actions').insert({
        admin_id: adminUser.id,
        action_type: `disciplinary_${actionType}`,
        details: { team_id: selectedTeam.id, team_label: selectedTeam.team_id_label, reason: actionReason }
      });

      // Reload
      await loadData();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Disdisciplinary transaction failed', err);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const getTeamMembersList = (teamId: string) => {
    return members
      .filter((m) => m.team_id === teamId)
      .map((m) => m.name)
      .join(', ');
  };

  const getTeamCaseNumber = (caseId: string) => {
    const c = cases.find((cs) => cs.id === caseId);
    return c ? c.case_number : 'UNKNOWN';
  };

  const getTeamAccessCode = (teamId: string) => {
    const code = codes.find((c) => c.team_id === teamId);
    return code ? code.code : 'N/A';
  };

  const getTeamViolations = (teamId: string) => {
    return logs.filter((l) => l.team_id === teamId).length;
  };

  const getTeamScore = (teamId: string) => {
    const sub = submissions.find((s) => s.team_id === teamId);
    return sub ? sub.score : 'N/A';
  };

  // Filtered List
  const filteredTeams = teams.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.team_id_label.toLowerCase().includes(search.toLowerCase());

    const matchStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Top Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Investigator Registrations</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Enlisted Team Audit Profiles
          </p>
        </div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-col md:flex-row gap-4 bg-detective-panel border border-detective-border rounded p-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-detective-muted">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Team ID or Name..."
            className="w-full bg-black/35 border border-detective-border rounded pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson placeholder:text-gray-500 uppercase"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <Filter className="w-4 h-4 text-detective-muted" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-black/35 border border-detective-border rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson"
          >
            <option value="all">ALL STATUSES</option>
            <option value="registered">REGISTERED</option>
            <option value="active">ACTIVE</option>
            <option value="submitted">SUBMITTED</option>
            <option value="flagged">FLAGGED</option>
            <option value="disqualified">DISQUALIFIED</option>
          </select>
        </div>

      </div>

      {/* Grid List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          PARSING REGISTERED DOSSIERS...
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted">
          NO INVESTIGATORS REGISTERED MATCHING FILTER.
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4">TEAM ID</th>
                <th className="p-4">TEAM NAME</th>
                <th className="p-4">MEMBERS</th>
                <th className="p-4">CASE</th>
                <th className="p-4">ACCESS CODE</th>
                <th className="p-4 text-center">BLURS</th>
                <th className="p-4 text-center">SCORE</th>
                <th className="p-4">STATUS</th>
                <th className="p-4 text-right">OVERRIDE ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {filteredTeams.map((team) => {
                const violationsCount = getTeamViolations(team.id);
                return (
                  <tr key={team.id} className="hover:bg-black/10 transition-colors">
                    <td className="p-4 font-bold text-detective-crimson tracking-wider">{team.team_id_label}</td>
                    <td className="p-4 text-white uppercase font-bold">{team.name}</td>
                    <td className="p-4 text-detective-text max-w-[200px] truncate" title={getTeamMembersList(team.id)}>
                      {getTeamMembersList(team.id)}
                    </td>
                    <td className="p-4 text-white">{getTeamCaseNumber(team.case_id)}</td>
                    <td className="p-4 font-mono text-detective-muted select-all">{getTeamAccessCode(team.id)}</td>
                    <td className={`p-4 text-center font-bold ${
                      violationsCount > 0 ? 'text-detective-alert' : 'text-detective-muted'
                    }`}>
                      {violationsCount}
                    </td>
                    <td className="p-4 text-center font-bold text-white">{getTeamScore(team.id)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${
                        team.status === 'registered' ? 'border-detective-border text-detective-muted bg-white/5' :
                        team.status === 'active' ? 'border-detective-amber text-detective-amber bg-detective-amber/5' :
                        team.status === 'submitted' ? 'border-detective-green text-detective-green bg-detective-green/5' :
                        team.status === 'flagged' ? 'border-red-400 text-red-400 bg-red-400/5 animate-pulse' :
                        'border-detective-crimson text-detective-alert bg-detective-crimson/5 font-black'
                      }`}>
                        {team.status}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {team.status !== 'disqualified' && (
                        <>
                          <button
                            onClick={() => handleOpenActionModal(team, 'warning')}
                            className="bg-black/25 hover:bg-detective-amber hover:text-black border border-detective-border text-detective-amber px-2 py-1 rounded text-[10px] uppercase font-bold transition-all"
                          >
                            Warn
                          </button>
                          <button
                            onClick={() => handleOpenActionModal(team, 'flag')}
                            className="bg-black/25 hover:bg-red-400 hover:text-black border border-detective-border text-red-400 px-2 py-1 rounded text-[10px] uppercase font-bold transition-all"
                          >
                            Flag
                          </button>
                          <button
                            onClick={() => handleOpenActionModal(team, 'disqualification')}
                            className="bg-black/25 hover:bg-detective-crimson hover:text-white border border-detective-border text-detective-alert px-2 py-1 rounded text-[10px] uppercase font-bold transition-all"
                          >
                            Suspend
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Disciplinary Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs">
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4">
              Clearance Disciplinary Action
            </h3>

            <div className="space-y-3 mb-6">
              <div>
                <span className="text-detective-muted uppercase block text-[10px]">Target Team</span>
                <span className="font-bold text-white uppercase">{selectedTeam?.team_id_label} - {selectedTeam?.name}</span>
              </div>

              <div>
                <span className="text-detective-muted uppercase block text-[10px]">Action Protocol</span>
                <span className={`font-bold uppercase ${
                  actionType === 'disqualification' ? 'text-detective-alert' :
                  actionType === 'flag' ? 'text-red-400' : 'text-detective-amber'
                }`}>{actionType}</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                  Justification Reason (Mandatory Audit Requirement)
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="State operational violation justification..."
                  rows={4}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={isActionSubmitting || !actionReason.trim()}
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold disabled:opacity-50"
              >
                {isActionSubmitting ? 'Logging Action...' : 'Execute protocol'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
