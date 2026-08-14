import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipantSession } from '../../hooks/useParticipantSession';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useInvestigationTimer } from '../../hooks/useInvestigationTimer';
import { useSecurityMonitor } from '../../hooks/useSecurityMonitor';
import { supabase } from '../../lib/supabase';
import QuestionSheet from '../../components/questions/QuestionSheet';
import SecurityWarning from '../../components/security/SecurityWarning';
import CaseBriefing from '../../components/evidence/CaseBriefing';
import {
  Clock,
  ShieldAlert,
  CheckCircle,
  Database,
  BookOpen,
  Send,
  AlertTriangle,
  User,
  Maximize,
  Minimize,
  RefreshCw,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Explicit loading-state labels
// ─────────────────────────────────────────────────────────────────────────────
type InvestigationLoadPhase =
  | 'session'       // waiting for useParticipantSession to finish
  | 'data'          // loading questions + options from DB
  | 'ready'         // all data available, render workspace
  | 'session_error' // useParticipantSession returned error
  | 'no_session'    // session ready=null → send to verify-case
  | 'no_team';      // team ready=null → send to register

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Investigation() {
  const navigate = useNavigate();

  // ── 1. Session restoration (independent of auth context) ──────────────────
  const {
    status: sessionStatus,
    team,
    session,
    caseInfo,
    submission,
    error: sessionError,
    restoreSession,
  } = useParticipantSession();

  // ── 2. Investigation data ──────────────────────────────────────────────────
  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions]     = useState<any[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── 3. UI state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]             = useState<'brief' | 'questions'>(() => {
    // Restore last-used tab from localStorage (harmless UI pref)
    const saved = localStorage.getItem('mystery_y_active_section');
    return (saved === 'questions' ? 'questions' : 'brief');
  });
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isFullscreen, setIsFullscreen]       = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(true);

  // ── 4. Derived load phase ──────────────────────────────────────────────────
  const [loadPhase, setLoadPhase] = useState<InvestigationLoadPhase>('session');
  const [isLoadingData, setIsLoadingData]     = useState(false);

  // Persist active tab
  const switchTab = useCallback((tab: 'brief' | 'questions') => {
    setActiveTab(tab);
    localStorage.setItem('mystery_y_active_section', tab);
  }, []);

  // ── 5. Fullscreen management ───────────────────────────────────────────────
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    const onFSError  = () => { console.warn('[MYSTERY-Y][INVESTIGATION] Fullscreen unsupported'); setFullscreenSupported(false); };
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('fullscreenerror', onFSError);
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      document.removeEventListener('fullscreenerror', onFSError);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.warn('[MYSTERY-Y][INVESTIGATION] Fullscreen toggle failed:', err);
    }
  };

  // ── 6. Derive load phase from session status ───────────────────────────────
  useEffect(() => {
    console.debug('[MYSTERY-Y][INVESTIGATION] sessionStatus:', sessionStatus, '| team:', team?.id ?? 'null', '| session:', session?.id ?? 'null');

    if (sessionStatus === 'idle' || sessionStatus === 'loading') {
      setLoadPhase('session');
      return;
    }

    if (sessionStatus === 'error') {
      setLoadPhase('session_error');
      return;
    }

    // sessionStatus === 'ready'
    if (!team) {
      // No team → redirect to register
      console.debug('[MYSTERY-Y][INVESTIGATION] No team — redirecting to /register');
      setLoadPhase('no_team');
      navigate('/register', { replace: true });
      return;
    }

    if (!session) {
      // Team exists but no session → redirect to case briefing
      console.debug('[MYSTERY-Y][INVESTIGATION] No session — redirecting to /verify-case');
      setLoadPhase('no_session');
      navigate('/verify-case', { replace: true });
      return;
    }

    // All good — load investigation data
    setLoadPhase('data');
  }, [sessionStatus, team, session, navigate]);

  // ── 7. Load questions and options when session is confirmed ───────────────
  useEffect(() => {
    if (loadPhase !== 'data' || !team?.case_id) return;

    let cancelled = false;
    setIsLoadingData(true);
    setDataError(null);

    console.debug('[MYSTERY-Y][INVESTIGATION] Loading questions for case:', team.case_id);

    (async () => {
      try {
        const [qRes, oRes] = await Promise.all([
          supabase
            .from('questions')
            .select('*')
            .eq('case_id', team.case_id)
            .order('sort_order', { ascending: true }),
          supabase
            .from('question_options')
            .select('id, question_id, option_text, sort_order'),
        ]);

        if (cancelled) return;

        if (qRes.error) throw new Error('Failed to load questions: ' + qRes.error.message);
        if (oRes.error) throw new Error('Failed to load options: ' + oRes.error.message);

        setQuestions(qRes.data || []);
        setOptions(oRes.data || []);
        console.debug('[MYSTERY-Y][INVESTIGATION] Loaded', qRes.data?.length ?? 0, 'questions,', oRes.data?.length ?? 0, 'options');
        setLoadPhase('ready');
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || 'Failed to load investigation data';
        console.error('[MYSTERY-Y][INVESTIGATION] Data load error:', msg);
        setDataError(msg);
        setLoadPhase('session_error'); // reuse error state
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    })();

    return () => { cancelled = true; };
  }, [loadPhase, team?.case_id]);

  // ── 8. Autosave, timer, security hooks (only when session is valid) ────────
  const { drafts, updateAnswer, syncStatus, syncError } = useAutoSave(
    loadPhase === 'ready' ? team?.id : undefined
  );

  // Timer is driven by the authoritative submission.started_at
  // Fall back to session.started_at if no submission yet
  const authoritativeStartedAt = submission?.started_at ?? session?.started_at;
  const { formattedTime } = useInvestigationTimer(
    loadPhase === 'ready' ? authoritativeStartedAt : undefined,
    caseInfo?.duration_limit || 60
  );

  // Security monitor — initializes after session is confirmed; does NOT block loading
  const { violations, activeWarning, lastEvent, dismissWarning } = useSecurityMonitor(
    loadPhase === 'ready' ? team?.id : undefined,
    loadPhase === 'ready' ? session?.id : undefined
  );

  // ── 9. Loading screen ──────────────────────────────────────────────────────
  if (loadPhase === 'session' || loadPhase === 'data') {
    const label    = loadPhase === 'session' ? 'RESTORING INVESTIGATION SESSION...' : 'LOADING INVESTIGATION DATA...';
    const sublabel = loadPhase === 'session'
      ? 'Verifying security clearance and dossier state'
      : 'Loading case questions and evidence...';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono text-sm text-detective-muted">
        <Clock className="w-8 h-8 animate-spin text-detective-crimson mb-3" />
        <div className="text-white font-bold tracking-widest text-base mb-1">
          [ {label} ]
        </div>
        <div className="text-xs text-detective-muted uppercase">{sublabel}</div>
      </div>
    );
  }

  // ── 10. Error / unrecoverable state ───────────────────────────────────────
  if (loadPhase === 'session_error') {
    const displayError = sessionError || dataError || 'Session data could not be loaded. Check your connection.';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson/50 rounded-lg p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-detective-crimson mx-auto mb-4" />
          <div className="text-detective-crimson font-bold tracking-widest text-base mb-2 uppercase">
            [ INVESTIGATION SESSION ERROR ]
          </div>
          <div className="text-detective-muted text-xs mb-6 leading-relaxed">{displayError}</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setLoadPhase('session'); restoreSession(); }}
              className="w-full flex items-center justify-center gap-2 bg-detective-crimson/20 border border-detective-crimson/50 text-detective-crimson font-bold py-2.5 px-4 rounded text-xs tracking-wider hover:bg-detective-crimson/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> [ RETRY ]
            </button>
            <button
              onClick={() => navigate('/verify-case')}
              className="w-full border border-detective-border text-detective-muted py-2 px-4 rounded text-xs tracking-wider hover:bg-detective-panel transition-colors"
            >
              [ RETURN TO CASE BRIEFING ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Safeguard: session or team went null after 'ready' (shouldn't normally happen)
  if (loadPhase === 'ready' && (!team || !session || !caseInfo)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson/50 rounded-lg p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-detective-crimson mx-auto mb-4" />
          <div className="text-detective-crimson font-bold tracking-widest text-base mb-2 uppercase">
            [ INVESTIGATION SESSION ERROR ]
          </div>
          <div className="text-detective-muted text-xs mb-6">
            {!team ? 'TEAM SESSION NOT FOUND' : !session ? 'INVESTIGATION SESSION EXPIRED' : 'CASE DOSSIER NOT FOUND'}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setLoadPhase('session'); restoreSession(); }}
              className="w-full flex items-center justify-center gap-2 bg-detective-crimson/20 border border-detective-crimson/50 text-detective-crimson font-bold py-2.5 px-4 rounded text-xs tracking-wider hover:bg-detective-crimson/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> [ RETRY ]
            </button>
            <button
              onClick={() => navigate('/verify-case')}
              className="w-full border border-detective-border text-detective-muted py-2 px-4 rounded text-xs tracking-wider hover:bg-detective-panel transition-colors"
            >
              [ RETURN TO CASE BRIEFING ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 11. All data confirmed — render investigation workspace ───────────────
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

      {/* Security overlay warning (mounted ONCE at root) */}
      {activeWarning && (
        <SecurityWarning
          type={activeWarning}
          violations={violations}
          onDismiss={dismissWarning}
          eventType={lastEvent}
        />
      )}

      {/* ── Top command bar ──────────────────────────────────────────────── */}
      <header className="h-14 bg-detective-panel border-b border-detective-border px-4 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="font-bold text-detective-crimson uppercase tracking-wider text-xs sm:text-sm select-none flex items-center gap-2 flex-shrink-0">
            🔎 MYSTERY Y
          </span>
          <div className="hidden sm:flex items-center gap-2 text-xs bg-black/30 border border-detective-border rounded px-2.5 py-1 flex-shrink-0">
            <span className="text-detective-muted">CASE:</span>
            <span className="text-white font-bold">{caseInfo!.case_number}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs bg-black/30 border border-detective-border rounded px-2.5 py-1 flex-shrink-0">
            <span className="text-detective-muted">TEAM:</span>
            <span className="text-white font-bold truncate max-w-[120px]">{team!.team_id_label}</span>
          </div>

          {/* Security violation badge */}
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-bold flex-shrink-0 ${
            violations >= 3
              ? 'bg-detective-crimson/20 border-detective-crimson/50 text-detective-crimson'
              : violations > 0
                ? 'bg-detective-amber/10 border-detective-amber/50 text-detective-amber'
                : 'bg-detective-green/10 border-detective-green/30 text-detective-green'
          }`}>
            <ShieldAlert className="w-3 h-3" />
            <span className="hidden sm:inline">SEC:</span>
            <span>{violations}/3</span>
          </div>
        </div>

        {/* Right side: sync status + fullscreen + timer */}
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">

          {/* Fullscreen toggle */}
          {fullscreenSupported && (
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 text-xs bg-black/40 hover:bg-black/60 border border-detective-border px-2 sm:px-2.5 py-1 rounded text-stone-300 hover:text-white transition-colors uppercase font-bold"
            >
              {isFullscreen ? (
                <><Minimize className="w-3.5 h-3.5 text-detective-amber" /><span className="hidden lg:inline">[ EXIT FS ]</span></>
              ) : (
                <><Maximize className="w-3.5 h-3.5 text-detective-green" /><span className="hidden lg:inline">[ FULLSCREEN ]</span></>
              )}
            </button>
          )}

          {/* Autosave sync indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {syncStatus === 'saving' && (
              <span className="text-detective-amber flex items-center gap-1">
                <Database className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="text-detective-green flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">✓ Saved</span>
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="text-detective-alert flex items-center gap-1 font-bold animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{syncError || 'Retry'}</span>
              </span>
            )}
          </div>

          {/* Elapsed timer */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-white bg-black/40 border border-detective-border px-2 sm:px-3.5 py-1 rounded font-mono text-xs sm:text-sm tracking-wider font-bold">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-detective-crimson animate-pulse" />
            <span>{formattedTime}</span>
          </div>
        </div>
      </header>

      {/* ── Main workspace ───────────────────────────────────────────────── */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative">

        {/* Left nav pane */}
        <div className="w-full md:w-64 bg-detective-panel border-b md:border-b-0 md:border-r border-detective-border flex flex-col flex-shrink-0">

          {/* Tab selector */}
          <div className="p-3 border-b border-detective-border grid grid-cols-2 gap-1 bg-black/10">
            <button
              id="tab-brief"
              onClick={() => switchTab('brief')}
              className={`py-1.5 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activeTab === 'brief'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <BookOpen className="w-3 h-3 mx-auto mb-1" /> Briefing
            </button>
            <button
              id="tab-inquiry"
              onClick={() => switchTab('questions')}
              className={`py-1.5 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors ${
                activeTab === 'questions'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <Send className="w-3 h-3 mx-auto mb-1" /> Inquiry ({answeredCount}/{questions.length})
            </button>
          </div>

          {/* Nav list */}
          <div className="flex-grow overflow-y-auto p-4 space-y-2.5">

            {/* Case briefing summary nav */}
            {activeTab === 'brief' && (
              <div className="text-xs leading-relaxed space-y-4">
                <div className="font-bold border-b border-detective-border pb-1 uppercase text-detective-crimson">
                  Case Briefing
                </div>
                <p className="text-stone-400 text-xs">{caseInfo!.title}</p>

                {/* Case metadata summary */}
                <div className="text-[10px] bg-black/20 rounded border border-detective-border/50 divide-y divide-detective-border/30">
                  <div className="px-2 py-1.5 flex justify-between">
                    <span className="text-detective-muted">CASE ID</span>
                    <span className="text-white font-bold">{caseInfo!.case_number}</span>
                  </div>
                  <div className="px-2 py-1.5 flex justify-between">
                    <span className="text-detective-muted">TEAM</span>
                    <span className="text-white font-bold truncate max-w-[90px]">{team!.name}</span>
                  </div>
                  <div className="px-2 py-1.5 flex justify-between">
                    <span className="text-detective-muted">STATUS</span>
                    <span className="text-detective-green font-bold">ACTIVE</span>
                  </div>
                  <div className="px-2 py-1.5 flex justify-between">
                    <span className="text-detective-muted">TIMER</span>
                    <span className="text-detective-amber font-bold font-mono">{formattedTime}</span>
                  </div>
                  <div className="px-2 py-1.5 flex justify-between">
                    <span className="text-detective-muted">SECURITY</span>
                    <span className={`font-bold ${violations >= 3 ? 'text-detective-crimson' : violations > 0 ? 'text-detective-amber' : 'text-detective-green'}`}>
                      {violations}/3
                    </span>
                  </div>
                </div>

                <div className="text-[10px] bg-black/20 p-2.5 border border-detective-border rounded text-detective-muted leading-relaxed">
                  Review the briefing and case materials before proceeding to the Inquiry.
                </div>
              </div>
            )}

            {/* Question navigation list */}
            {activeTab === 'questions' && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-detective-muted uppercase tracking-wider mb-2">
                  Deduction Files
                </div>
                {questions.length === 0 && (
                  <div className="text-[10px] text-detective-muted py-4 text-center">
                    No questions found for this case.
                  </div>
                )}
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
                      id={`question-nav-${idx}`}
                      onClick={() => { switchTab('questions'); setActiveQuestionIdx(idx); }}
                      className={`w-full flex items-center justify-between p-3 text-left rounded border transition-all text-xs ${
                        activeTab === 'questions' && idx === activeQuestionIdx
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

          {/* Bottom team badge */}
          <div className="p-4 bg-black/40 border-t border-detective-border text-xs space-y-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-detective-muted">
              <User className="w-3.5 h-3.5" />
              <span>ACTIVE INVESTIGATOR:</span>
            </div>
            <div className="font-bold text-white uppercase truncate">{team!.name}</div>
            <div className="text-[10px] text-detective-crimson font-mono font-bold tracking-widest">{team!.team_id_label}</div>
          </div>
        </div>

        {/* Center: main display board */}
        <div className="flex-grow flex flex-col overflow-hidden bg-black/10">

          {/* Case Briefing panel */}
          {activeTab === 'brief' && (
            <div className="flex-grow p-4 sm:p-6 overflow-y-auto flex items-start justify-center bg-detective-dark/20">
              <CaseBriefing
                caseInfo={caseInfo!}
                teamName={team!.name}
                isBeforeStart={false}
              />
            </div>
          )}

          {/* Inquiry / Questions panel */}
          {activeTab === 'questions' && (
            <div className="flex-grow overflow-hidden relative">
              <QuestionSheet
                questions={questions}
                options={options}
                answers={drafts}
                onAnswerChange={(qId, text, selected) => {
                  const q = questions.find((item) => item.id === qId);
                  const isChoice = q && ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);
                  updateAnswer(qId, text, selected, !!isChoice);
                }}
                activeQuestionIndex={activeQuestionIdx}
              />

              {/* Previous / Next / Submit controls */}
              <div className="absolute bottom-0 left-0 w-full h-14 bg-white border-t border-black/10 px-4 sm:px-8 flex justify-between items-center z-10">
                <button
                  id="btn-prev-question"
                  disabled={activeQuestionIdx === 0}
                  onClick={() => setActiveQuestionIdx((prev) => prev - 1)}
                  className="px-3 sm:px-4 py-1.5 rounded border border-black/20 text-xs font-bold text-black/60 hover:bg-black/5 disabled:opacity-30"
                >
                  PREV
                </button>

                <div className="text-xs text-detective-muted font-bold">
                  {activeQuestionIdx + 1} / {questions.length}
                </div>

                {activeQuestionIdx < questions.length - 1 ? (
                  <button
                    id="btn-next-question"
                    onClick={() => setActiveQuestionIdx((prev) => prev + 1)}
                    className="px-3 sm:px-4 py-1.5 rounded bg-detective-dark hover:bg-detective-crimson text-white text-xs font-bold transition-colors"
                  >
                    NEXT
                  </button>
                ) : (
                  <button
                    id="btn-review-submit"
                    onClick={() => navigate('/review')}
                    className="px-3 sm:px-5 py-2 sm:py-2.5 rounded bg-detective-crimson hover:bg-detective-alert text-white text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-[0_0_12px_rgba(139,0,0,0.2)] animate-pulse"
                  >
                    Review &amp; Submit
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
