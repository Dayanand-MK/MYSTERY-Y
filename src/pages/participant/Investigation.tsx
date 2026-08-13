import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useInvestigationTimer } from '../../hooks/useInvestigationTimer';
import { useSecurityMonitor } from '../../hooks/useSecurityMonitor';
import { supabase } from '../../lib/supabase';
import QuestionSheet from '../../components/questions/QuestionSheet';
import SecurityWarning from '../../components/security/SecurityWarning';
import CaseBriefing from '../../components/evidence/CaseBriefing';
import { Clock, ShieldAlert, CheckCircle, Database, BookOpen, Send, AlertTriangle, User } from 'lucide-react';

export default function Investigation() {
  const navigate = useNavigate();
  const { currentTeam, currentSession } = useAuth();

  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [caseInfo, setCaseInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'brief' | 'questions'>('brief');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Redirect to register/verify if auth data is missing
  useEffect(() => {
    if (!currentTeam) {
      navigate('/register');
    } else if (!currentSession) {
      navigate('/verify-case');
    }
  }, [currentTeam, currentSession, navigate]);

  // Load questions, options, and case details
  useEffect(() => {
    if (!currentTeam) return;

    async function loadInvestigationData() {
      try {
        // 1. Fetch Case Details (fetches briefing columns too via *)
        const { data: cData } = await supabase
          .from('cases')
          .select('*')
          .eq('id', currentTeam!.case_id)
          .single();

        if (cData) setCaseInfo(cData);

        // 2. Fetch Questions
        const { data: qData } = await supabase
          .from('questions')
          .select('*')
          .eq('case_id', currentTeam!.case_id)
          .order('sort_order', { ascending: true });

        if (qData) setQuestions(qData);

        // 3. Fetch Options
        const { data: oData } = await supabase
          .from('question_options')
          .select('id, question_id, option_text, sort_order');

        if (oData) setOptions(oData);
      } catch (err) {
        console.error('Failed to load investigation data', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadInvestigationData();
  }, [currentTeam]);

  // Autosave answers engine hook
  const { drafts, updateAnswer, syncStatus, syncError } = useAutoSave(
    currentTeam?.id
  );

  // Sync Count-up timer hook
  const { formattedTime } = useInvestigationTimer(
    currentSession?.started_at,
    caseInfo?.duration_limit || 60
  );

  // Active Security monitoring hook
  const { violations, activeWarning, lastEvent, dismissWarning } = useSecurityMonitor(
    currentTeam?.id,
    currentSession?.id
  );

  if (isLoading || !currentTeam || !currentSession || !caseInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono text-sm text-detective-muted">
        <Clock className="w-8 h-8 animate-spin text-detective-crimson mb-2" />
        LOADING SECURE DOSSIER AND BRIEFING DECODER...
      </div>
    );
  }

  // Calculate answered questions helper
  const answeredCount = questions.filter((q) => {
    const draft = drafts.find((d) => d.question_id === q.id);
    if (!draft) return false;
    if (['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)) {
      return draft.selected_options.length > 0;
    }
    return draft.answer_text.trim().length > 0;
  }).length;

  return (
    <div className="h-screen flex flex-col bg-detective-dark font-mono select-none">
      
      {/* Security overlay warning (Rendered EXACTLY once at the root layout) */}
      {activeWarning && (
        <SecurityWarning
          type={activeWarning}
          violations={violations}
          onDismiss={dismissWarning}
          eventType={lastEvent}
        />
      )}

      {/* Top command bar */}
      <header className="h-14 bg-detective-panel border-b border-detective-border px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-4">
          <span className="font-bold text-detective-crimson uppercase tracking-wider text-sm select-none">
            🔎 MYSTERY Y Workstation
          </span>
          <div className="hidden sm:flex items-center gap-2 text-xs bg-black/30 border border-detective-border rounded px-2.5 py-1">
            <span className="text-detective-muted">CASE ID:</span>
            <span className="text-white font-bold">{caseInfo.case_number}</span>
          </div>
        </div>

        {/* Sync status and Timer */}
        <div className="flex items-center gap-6">
          {/* Sync indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {syncStatus === 'saving' && (
              <span className="text-detective-amber flex items-center gap-1">
                <Database className="w-3.5 h-3.5 animate-pulse" /> Saving...
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="text-detective-green flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> ✓ Evidence Saved
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="text-detective-alert flex items-center gap-1 font-bold animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" /> {syncError}
              </span>
            )}
          </div>

          {/* Count-up Timer */}
          <div className="flex items-center gap-2 text-white bg-black/40 border border-detective-border px-3.5 py-1 rounded font-mono text-sm tracking-wider font-bold">
            <Clock className="w-4 h-4 text-detective-crimson animate-pulse" />
            <span>ELAPSED: {formattedTime}</span>
          </div>
        </div>
      </header>

      {/* Main workspace layout */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Side: Navigation pane */}
        <div className="w-full md:w-64 bg-detective-panel border-r border-detective-border flex flex-col flex-shrink-0">
          
          {/* Tab selector (Updated to 2-columns layout) */}
          <div className="p-3 border-b border-detective-border grid grid-cols-2 gap-1 bg-black/10">
            <button
              onClick={() => setActiveTab('brief')}
              className={`py-1.5 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activeTab === 'brief'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <BookOpen className="w-3 h-3 mx-auto mb-1" /> Briefing
            </button>
            <button
              onClick={() => setActiveTab('questions')}
              className={`py-1.5 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activeTab === 'questions'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <Send className="w-3 h-3 mx-auto mb-1" /> Inquiry ({answeredCount}/{questions.length})
            </button>
          </div>

          {/* List content area */}
          <div className="flex-grow overflow-y-auto p-4 space-y-2.5">
            {activeTab === 'brief' && (
              <div className="text-xs leading-relaxed space-y-4">
                <div className="font-bold border-b border-detective-border pb-1 uppercase text-detective-crimson">
                  Case Briefing
                </div>
                <p className="text-stone-400 text-xs">{caseInfo.title}</p>
                <div className="text-[10px] bg-black/20 p-2.5 border border-detective-border rounded text-detective-muted leading-relaxed">
                  Review the case details and listen/watch the media briefing before analyzing files.
                </div>
              </div>
            )}

            {activeTab === 'questions' && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-detective-muted uppercase tracking-wider mb-2">
                  Deduction Files
                </div>
                {questions.map((q, idx) => {
                  const draft = drafts.find((d) => d.question_id === q.id);
                  const isCompleted = draft
                    ? ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)
                      ? draft.selected_options.length > 0
                      : draft.answer_text.trim().length > 0
                    : false;

                  return (
                    <button
                      key={q.id}
                      onClick={() => setActiveQuestionIdx(idx)}
                      className={`w-full flex items-center justify-between p-3 text-left rounded border transition-all text-xs ${
                        idx === activeQuestionIdx
                          ? 'border-detective-crimson bg-detective-crimson/5 font-bold text-white shadow-[0_0_8px_rgba(139,0,0,0.1)]'
                          : 'border-detective-border/40 hover:bg-black/20 text-detective-muted'
                      }`}
                    >
                      <div className="truncate flex-grow pr-2">
                        <span>Q{q.sort_order}. </span>
                        <span className="truncate">{q.question_text}</span>
                      </div>
                      {isCompleted ? (
                        <CheckCircle className="w-3.5 h-3.5 text-detective-green flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-detective-amber flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Team Brief */}
          <div className="p-4 bg-black/40 border-t border-detective-border text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-detective-muted">
              <User className="w-3.5 h-3.5" />
              <span>ACTIVE INVESTIGATOR:</span>
            </div>
            <div className="font-bold text-white uppercase truncate">{currentTeam.name}</div>
            <div className="text-[10px] text-detective-crimson font-mono font-bold tracking-widest">{currentTeam.team_id_label}</div>
          </div>
        </div>

        {/* Center: Main display board */}
        <div className="flex-grow flex flex-col overflow-hidden bg-black/10">
          
          {/* Display logic */}
          {activeTab === 'brief' && (
            <div className="flex-grow p-6 overflow-y-auto flex items-center justify-center bg-detective-dark/20">
              <CaseBriefing
                caseInfo={caseInfo}
                teamName={currentTeam.name}
                isBeforeStart={false}
              />
            </div>
          )}

          {activeTab === 'questions' && (
            <div className="flex-grow overflow-hidden relative">
              <QuestionSheet
                questions={questions}
                options={options}
                answers={drafts}
                onAnswerChange={updateAnswer}
                activeQuestionIndex={activeQuestionIdx}
              />
              
              {/* Previous/Next controls inside sheet */}
              <div className="absolute bottom-0 left-0 w-full h-14 bg-white border-t border-black/10 px-8 flex justify-between items-center z-10">
                <button
                  disabled={activeQuestionIdx === 0}
                  onClick={() => setActiveQuestionIdx(prev => prev - 1)}
                  className="px-4 py-1.5 rounded border border-black/20 text-xs font-bold text-black/60 hover:bg-black/5 disabled:opacity-30"
                >
                  PREV INQUIRY
                </button>

                <div className="text-xs text-detective-muted font-bold">
                  Case Folder: {activeQuestionIdx + 1} / {questions.length}
                </div>

                {activeQuestionIdx < questions.length - 1 ? (
                  <button
                    onClick={() => setActiveQuestionIdx(prev => prev + 1)}
                    className="px-4 py-1.5 rounded bg-detective-dark hover:bg-detective-crimson text-white text-xs font-bold transition-colors"
                  >
                    NEXT INQUIRY
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/review')}
                    className="px-5 py-2.5 rounded bg-detective-crimson hover:bg-detective-alert text-white text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-[0_0_12px_rgba(139,0,0,0.2)] animate-pulse"
                  >
                    Review & Submit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
