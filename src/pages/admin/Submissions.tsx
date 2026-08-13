import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, FileSpreadsheet, Clock, ShieldCheck, Loader, ShieldAlert, Award, FileText, ChevronRight, Eye } from 'lucide-react';

export default function Submissions() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Detail Modal state
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [selectedSubAnswers, setSelectedSubAnswers] = useState<any[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: sData } = await supabase.from('submissions').select('*');
      const { data: tData } = await supabase.from('teams').select('*');
      const { data: cData } = await supabase.from('cases').select('*');
      const { data: qData } = await supabase.from('questions').select('*');
      const { data: oData } = await supabase.from('question_options').select('id, option_text, is_correct');

      if (sData) setSubmissions(sData);
      if (tData) setTeams(tData);
      if (cData) setCases(cData);
      if (qData) setQuestions(qData);
      if (oData) setOptions(oData);
    } catch (err) {
      console.error('Failed to load submissions', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDetail = async (sub: any) => {
    setIsDetailLoading(true);
    setSelectedSub(sub);
    try {
      const { data: aData } = await supabase
        .from('answers')
        .select('*')
        .eq('submission_id', sub.id);

      if (aData) setSelectedSubAnswers(aData);
    } catch (err) {
      console.error('Failed to load answers', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const getTeamName = (teamId: string) => {
    const t = teams.find((tm) => tm.id === teamId);
    return t ? t.name : 'UNKNOWN';
  };

  const getTeamLabel = (teamId: string) => {
    const t = teams.find((tm) => tm.id === teamId);
    return t ? t.team_id_label : 'UNKNOWN';
  };

  const getCaseNumber = (caseId: string) => {
    const c = cases.find((cs) => cs.id === caseId);
    return c ? c.case_number : 'UNKNOWN';
  };

  const getCaseTitle = (caseId: string) => {
    const c = cases.find((cs) => cs.id === caseId);
    return c ? c.title : 'UNKNOWN';
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}m ${secs}s`;
  };

  // Filters search
  const filteredSubmissions = submissions.filter((s) => {
    const tName = getTeamName(s.team_id).toLowerCase();
    const tLabel = getTeamLabel(s.team_id).toLowerCase();
    const subLabel = s.submission_id_label.toLowerCase();
    
    const query = search.toLowerCase();
    return tName.includes(query) || tLabel.includes(query) || subLabel.includes(query);
  });

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Investigation Submissions</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Submitted Case Dossiers Archives
          </p>
        </div>
      </div>

      {/* Filter box */}
      <div className="bg-detective-panel border border-detective-border rounded p-4 flex items-center justify-between">
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-detective-muted">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Submission ID or Team..."
            className="w-full bg-black/35 border border-detective-border rounded pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-detective-crimson placeholder:text-gray-500 uppercase"
          />
        </div>
      </div>

      {/* Table grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          RETRIEVING AUDIT ARCHIVES...
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="bg-detective-panel border border-detective-border rounded p-12 text-center text-detective-muted">
          NO CLOSED CASE DOSSIERS FILED YET.
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4">SUBMISSION ID</th>
                <th className="p-4">TEAM ID</th>
                <th className="p-4">TEAM NAME</th>
                <th className="p-4">CASE FILE</th>
                <th className="p-4">SUBMIT TIME</th>
                <th className="p-4">ELAPSED TIME</th>
                <th className="p-4 text-center">SCORE</th>
                <th className="p-4">GRADING</th>
                <th className="p-4 text-right">DOSSIER VIEW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {filteredSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-black/10 transition-colors">
                  <td className="p-4 font-bold text-detective-crimson tracking-wider">{sub.submission_id_label}</td>
                  <td className="p-4 text-detective-muted">{getTeamLabel(sub.team_id)}</td>
                  <td className="p-4 text-white uppercase font-bold">{getTeamName(sub.team_id)}</td>
                  <td className="p-4 text-white">{getCaseNumber(sub.case_id)} - {getCaseTitle(sub.case_id)}</td>
                  <td className="p-4 text-detective-muted">{new Date(sub.submitted_at).toLocaleString()}</td>
                  <td className="p-4 text-white font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-detective-crimson" /> {formatDuration(sub.duration)}
                  </td>
                  <td className="p-4 text-center font-bold text-white font-mono">{sub.score}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold border uppercase ${
                      sub.is_finalized
                        ? 'border-detective-green text-detective-green bg-detective-green/5'
                        : 'border-detective-amber text-detective-amber bg-detective-amber/5'
                    }`}>
                      {sub.is_finalized ? 'Finalized' : 'Grading Pending'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleOpenDetail(sub)}
                      className="bg-black/25 hover:bg-detective-crimson hover:text-white border border-detective-border text-detective-muted px-2.5 py-1 rounded text-[10px] uppercase font-bold transition-all flex items-center gap-1 ml-auto"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dossier detail modal */}
      {selectedSub && (
        <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto p-4 md:p-12 flex justify-center">
          <div className="max-w-2xl w-full bg-detective-paper text-stone-900 rounded p-8 shadow-2xl relative border-t-8 border-detective-dark my-auto">
            
            {/* Close */}
            <button
              onClick={() => setSelectedSub(null)}
              className="absolute top-4 right-4 font-mono text-[10px] text-stone-500 hover:text-stone-800 font-bold uppercase border border-black/10 rounded px-2.5 py-1"
            >
              Close Dossier
            </button>

            <span className="dossier-stamp text-detective-dark absolute top-12 right-12 text-sm font-bold uppercase select-none">
              SUBMITTED
            </span>

            {/* Header */}
            <div className="border-b border-black/15 pb-4 mb-6">
              <span className="text-xs text-detective-crimson font-bold uppercase">{selectedSub.submission_id_label}</span>
              <h1 className="text-2xl font-bold uppercase text-detective-dark">
                Team Dossier: {getTeamName(selectedSub.team_id)}
              </h1>
              <p className="text-xs text-stone-500 uppercase mt-1">
                Case: {getCaseNumber(selectedSub.case_id)} | Duration: {formatDuration(selectedSub.duration)} | Score: {selectedSub.score}
              </p>
            </div>

            {/* Answer audit */}
            <div className="space-y-6">
              <h3 className="font-bold text-xs uppercase text-stone-600 tracking-wider border-b border-black/10 pb-1">
                Field Deduction Logs
              </h3>

              {isDetailLoading ? (
                <div className="text-center py-6 text-xs text-stone-500">
                  Decrypting field records...
                </div>
              ) : selectedSubAnswers.length === 0 ? (
                <div className="text-center py-6 text-xs text-stone-500 uppercase">
                  No responses recorded in this case dossier.
                </div>
              ) : (
                selectedSubAnswers.map((ans, idx) => {
                  const q = questions.find((qst) => qst.id === ans.question_id);
                  if (!q) return null;

                  // MCQ selections listing
                  const isMcq = ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);
                  let selectedText = '';
                  
                  if (isMcq && ans.selected_options) {
                    selectedText = options
                      .filter((o) => ans.selected_options.includes(o.id))
                      .map((o) => {
                        const marker = o.is_correct ? '✓' : '✗';
                        return `${o.option_text} [${marker}]`;
                      })
                      .join(', ');
                  } else {
                    selectedText = ans.answer_text;
                  }

                  return (
                    <div key={ans.id} className="p-4 bg-black/5 border border-black/10 rounded space-y-2">
                      <div className="font-bold text-xs flex justify-between text-stone-900">
                        <span>Q{idx + 1}. {q.question_text}</span>
                        <span className="text-detective-crimson">({ans.score} / {q.marks} Marks)</span>
                      </div>
                      
                      <div className="text-[10px] text-stone-600 uppercase font-bold">
                        Type: {q.type.replace('_', ' ')}
                      </div>

                      <div className="bg-white/80 p-2.5 rounded border border-black/10 text-[11px] leading-relaxed text-stone-900 font-bold">
                        <span className="font-bold block text-[9px] uppercase text-stone-600 mb-1">Answered:</span>
                        <span className="whitespace-pre-line text-stone-900">{selectedText || <span className="italic text-red-600 font-bold uppercase">No answer logged</span>}</span>
                      </div>

                      {/* Grading remarks if any */}
                      {ans.grader_notes && (
                        <div className="text-[10px] text-detective-crimson italic">
                          Grader Remark: {ans.grader_notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
