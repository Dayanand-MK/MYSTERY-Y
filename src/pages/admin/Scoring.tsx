import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { CheckSquare, Loader, ClipboardCheck, Edit, ShieldAlert, Award, ChevronRight, Tag, ShieldCheck } from 'lucide-react';

export default function Scoring() {
  const { adminUser } = useAuth();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Grader Workspace state
  const [activeSub, setActiveSub] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [activeAnswersLoading, setActiveAnswersLoading] = useState(false);

  // Grading Form inputs
  const [gradingScores, setGradingScores] = useState<Record<string, number>>({});
  const [gradingNotes, setGradingNotes] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [isGradingSaving, setIsGradingSaving] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: sData } = await supabase.from('submissions').select('*').order('created_at', { ascending: false });
      const { data: tData } = await supabase.from('teams').select('*');
      const { data: cData } = await supabase.from('cases').select('*');
      const { data: qData } = await supabase.from('questions').select('*');
      const { data: rData } = await supabase.from('question_rubrics').select('*');
      const { data: oData } = await supabase.from('question_options').select('id, question_id, option_text, is_correct');

      if (sData) setSubmissions(sData);
      if (tData) setTeams(tData);
      if (cData) setCases(cData);
      if (qData) setQuestions(qData);
      if (rData) setRubrics(rData);
      if (oData) setOptions(oData);
    } catch (err) {
      console.error('Failed to load grading logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSubmission = async (sub: any) => {
    setActiveAnswersLoading(true);
    setActiveSub(sub);
    setGradingError(null);
    setOverrideReason('');

    try {
      const { data: aData } = await supabase
        .from('answers')
        .select('*')
        .eq('submission_id', sub.id);

      if (aData) {
        setAnswers(aData);
        // Pre-populate input values
        const scoresMap: Record<string, number> = {};
        const notesMap: Record<string, string> = {};
        
        aData.forEach((ans) => {
          scoresMap[ans.question_id] = Number(ans.score);
          notesMap[ans.question_id] = ans.grader_notes || '';
        });

        setGradingScores(scoresMap);
        setGradingNotes(notesMap);
      }
    } catch (err) {
      console.error('Answers load error', err);
    } finally {
      setActiveAnswersLoading(false);
    }
  };

  const handleScoreChange = (qId: string, scoreVal: number, maxMarks: number) => {
    setGradingScores((prev) => ({
      ...prev,
      [qId]: Math.max(0, Math.min(maxMarks, scoreVal))
    }));
  };

  const handleGraderNotesChange = (qId: string, noteVal: string) => {
    setGradingNotes((prev) => ({
      ...prev,
      [qId]: noteVal
    }));
  };

  const handleSaveGrades = async () => {
    if (!activeSub || !adminUser || !overrideReason.trim()) return;
    setIsGradingSaving(true);
    setGradingError(null);

    try {
      // 1. Save answers grades updates
      const promises = answers.map(async (ans) => {
        const questionScore = gradingScores[ans.question_id] ?? 0;
        const questionNotes = gradingNotes[ans.question_id] ?? '';

        return supabase
          .from('answers')
          .update({
            score: questionScore,
            grader_notes: questionNotes,
            is_graded: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', ans.id);
      });

      await Promise.all(promises);

      // 2. Recalculate Submissions total score
      const totalScore = Object.values(gradingScores).reduce((sum, s) => sum + s, 0);
      
      await supabase
        .from('submissions')
        .update({
          score: totalScore,
          is_finalized: true,
          graded_by: adminUser.id,
          grading_notes: overrideReason.trim()
        })
        .eq('id', activeSub.id);

      // 3. Log admin action
      await supabase.from('admin_actions').insert({
        admin_id: adminUser.id,
        action_type: 'score_change',
        details: {
          submission_id: activeSub.id,
          team_id: activeSub.team_id,
          old_score: activeSub.score,
          new_score: totalScore,
          reason: overrideReason.trim()
        }
      });

      await loadData();
      setActiveSub(null);
    } catch (err: any) {
      setGradingError(err.message || 'Scoring transaction failed');
    } finally {
      setIsGradingSaving(false);
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

  const getCaseDetails = (caseId: string) => {
    const c = cases.find((cs) => cs.id === caseId);
    return c ? `${c.case_number} — ${c.title}` : 'UNKNOWN';
  };

  // Helper keyword highlighter matches
  const checkConceptMatch = (text: string, concept: string) => {
    if (!text) return false;
    return text.toLowerCase().includes(concept.toLowerCase());
  };

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white">Forensic Dossier Grading</h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Manual Evaluation Console & Rubric Auditor
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Submissions list queue */}
        <div className="lg:col-span-4 bg-detective-panel border border-detective-border rounded p-5 flex flex-col min-h-[550px] lg:h-[calc(100vh-220px)]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 text-detective-amber animate-pulse" /> Grading Queue ({submissions.length})
          </h3>

          <div className="flex-grow overflow-y-auto space-y-2.5 pr-2">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-[10px] text-detective-muted uppercase">
                Loading submissions...
              </div>
            ) : submissions.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-detective-muted uppercase">
                No cases closed for evaluation yet.
              </div>
            ) : (
              submissions.map((sub) => {
                const isActive = activeSub && activeSub.id === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => handleSelectSubmission(sub)}
                    className={`w-full flex items-center justify-between p-3 rounded border text-left text-xs transition-all ${
                      isActive
                        ? 'border-detective-crimson bg-detective-crimson/5 font-bold text-white shadow-[0_0_8px_rgba(139,0,0,0.1)]'
                        : 'border-detective-border/40 hover:bg-black/20 text-detective-muted'
                    }`}
                  >
                    <div className="space-y-1 truncate pr-2">
                      <div className="font-bold text-white uppercase truncate">{getTeamName(sub.team_id)}</div>
                      <div className="text-[10px] text-detective-crimson font-bold">{getTeamLabel(sub.team_id)}</div>
                      <div className="text-[9px] text-detective-muted truncate">{getCaseDetails(sub.case_id)}</div>
                    </div>
                    
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 uppercase ${
                      sub.is_finalized
                        ? 'border-detective-green text-detective-green'
                        : 'border-detective-amber text-detective-amber animate-pulse'
                    }`}>
                      {sub.is_finalized ? 'Finalized' : 'Grade'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Grading Workspace */}
        <div className="lg:col-span-8 bg-detective-panel border border-detective-border rounded p-6 min-h-[550px] lg:h-[calc(100vh-220px)] flex flex-col">
          {!activeSub ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-detective-muted uppercase text-[10px] p-8 space-y-2">
              <ClipboardCheck className="w-8 h-8 text-detective-border" />
              <span>Select a case submission dossier from the queue to initiate grading clearance.</span>
            </div>
          ) : activeAnswersLoading ? (
            <div className="h-full flex items-center justify-center text-detective-muted">
              Decrypting field answers...
            </div>
          ) : (
            <div className="flex-col h-full flex justify-between overflow-hidden">
              
              {/* Target info */}
              <div className="border-b border-detective-border pb-3 mb-4 flex justify-between items-start">
                <div>
                  <span className="text-[9px] text-detective-crimson font-bold block uppercase">{activeSub.submission_id_label}</span>
                  <h2 className="text-sm font-bold text-white uppercase mt-0.5">Evaluating: {getTeamName(activeSub.team_id)}</h2>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-detective-muted font-bold block">CASE</span>
                  <span className="text-white font-bold text-[11px] block">{getCaseDetails(activeSub.case_id)}</span>
                </div>
              </div>

              {/* Answers editor scroll grid */}
              <div className="flex-grow overflow-y-auto space-y-6 pr-2 mb-4 scrollbar-thin">
                
                {gradingError && (
                  <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-2.5 rounded text-xs flex items-center gap-1 uppercase font-bold">
                    <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{gradingError}</span>
                  </div>
                )}

                {answers.map((ans, idx) => {
                  const q = questions.find((qst) => qst.id === ans.question_id);
                  if (!q) return null;

                  const isMcq = ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);
                  const qRubs = rubrics.filter((r) => r.question_id === q.id);

                  return (
                    <div key={ans.id} className="p-4 bg-black/25 rounded border border-detective-border/50 space-y-3">
                      
                      {/* Title */}
                      <div className="flex justify-between items-start border-b border-detective-border/40 pb-2">
                        <span className="font-bold text-white text-xs">Q{idx + 1}. {q.question_text}</span>
                        <span className="text-[10px] text-detective-crimson font-bold tracking-wider uppercase ml-4">
                          ({q.marks}M MAX)
                        </span>
                      </div>

                      {/* Display Student Answer */}
                      <div className="bg-black/30 p-3 rounded border border-detective-border/30 text-xs">
                        <span className="text-[9px] text-detective-muted uppercase block font-bold mb-1">Answer Text:</span>
                        <div className="text-white leading-relaxed font-mono">
                          {isMcq ? (
                            ans.selected_options && ans.selected_options.length > 0 ? (
                              <ul className="list-disc pl-4 space-y-1">
                                {options
                                  .filter((o) => ans.selected_options.includes(o.id))
                                  .map((o) => (
                                    <li key={o.id} className="text-white uppercase font-mono text-xs">
                                      {o.option_text}{' '}
                                      <span className={o.is_correct ? "text-detective-green font-bold ml-1" : "text-detective-crimson font-bold ml-1"}>
                                        [{o.is_correct ? '✓ CORRECT' : '✗ INCORRECT'}]
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            ) : (
                              <span className="italic text-detective-alert/65 font-bold uppercase">[No response entered]</span>
                            )
                          ) : (
                            ans.answer_text || <span className="italic text-detective-alert/65 font-bold uppercase">[No response entered]</span>
                          )}
                        </div>
                      </div>

                      {/* Render Keywords Concept match alerts */}
                      {q.expected_concepts && q.expected_concepts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 items-center font-mono text-[9px]">
                          <span className="text-detective-muted uppercase font-bold flex items-center gap-1">
                            <Tag className="w-3 h-3 text-detective-amber" /> Concept Matches:
                          </span>
                          {q.expected_concepts.map((concept: string) => {
                            const isMatch = checkConceptMatch(ans.answer_text, concept);
                            return (
                              <span
                                key={concept}
                                className={`px-2 py-0.5 rounded border font-bold uppercase ${
                                  isMatch
                                    ? 'border-detective-green text-detective-green bg-detective-green/10'
                                    : 'border-detective-border text-detective-muted bg-black/20'
                                }`}
                              >
                                {concept} {isMatch ? '✓' : '✗'}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Render rubrics list */}
                      {qRubs.length > 0 && (
                        <div className="space-y-1.5 pt-1.5 border-t border-detective-border/30">
                          <span className="text-[9px] text-white uppercase font-bold block mb-1">Rubrics Breakdown:</span>
                          {qRubs.map((rub) => (
                            <div key={rub.id} className="p-2 rounded bg-black/20 border border-detective-border/25 flex justify-between items-center text-[10px] text-detective-text">
                              <div>
                                <span className="font-bold text-white uppercase">{rub.criterion}</span>
                                <p className="text-[9px] text-detective-muted leading-relaxed mt-0.5">{rub.description}</p>
                              </div>
                              <span className="font-bold text-detective-crimson font-mono">{rub.max_marks}M</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Grade Inputs */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-detective-border/20">
                        <div>
                          <label className="block text-[9px] uppercase text-detective-muted mb-1 font-bold">Grade Score</label>
                          {isMcq ? (
                            <div className="text-xs font-bold text-detective-green uppercase bg-detective-green/5 border border-detective-green/30 p-2 rounded flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4" /> Auto Evaluated: {ans.score} Marks
                            </div>
                          ) : (
                            <input
                              type="number"
                              value={gradingScores[q.id] ?? 0}
                              onChange={(e) => handleScoreChange(q.id, Number(e.target.value), q.marks)}
                              min={0}
                              max={q.marks}
                              className="w-full bg-black/40 border border-detective-border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-detective-crimson font-bold text-center"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-[9px] uppercase text-detective-muted mb-1 font-bold">Grader Remarks</label>
                          <input
                            type="text"
                            value={gradingNotes[q.id] || ''}
                            onChange={(e) => handleGraderNotesChange(q.id, e.target.value)}
                            disabled={isMcq}
                            placeholder={isMcq ? 'Automated choice' : 'Remarks...'}
                            className="w-full bg-black/40 border border-detective-border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-detective-crimson"
                          />
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Save section */}
              <div className="border-t border-detective-border pt-4 bg-detective-panel flex flex-col sm:flex-row gap-4 items-center justify-between">
                
                {/* Override Reason */}
                <div className="w-full sm:flex-grow max-w-sm">
                  <label className="block text-[9px] uppercase text-detective-muted mb-1 font-bold">
                    Grade Override Justification (Auditable Requirement)
                  </label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                    placeholder="Provide grading changes justification..."
                    className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
                  />
                </div>

                {/* Finalize buttons */}
                <div className="flex gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => setActiveSub(null)}
                    className="w-1/2 sm:w-auto px-4 py-2 border border-detective-border rounded text-detective-muted hover:text-white uppercase font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveGrades}
                    disabled={isGradingSaving || !overrideReason.trim()}
                    className="w-1/2 sm:w-auto px-6 py-2 bg-detective-crimson hover:bg-detective-alert text-white rounded font-bold uppercase tracking-wider text-xs disabled:opacity-50"
                  >
                    {isGradingSaving ? 'Locking Grades...' : 'Finalize Grades'}
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

      </div>

    </div>
  );
}
