import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
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
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WorkspacePhase = 'loading' | 'ready' | 'error' | 'locked';

interface CaseData {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  briefing_media_type: 'none' | 'video' | 'audio';
  briefing_media_url: string | null;
  briefing_title: string;
  briefing_text: string | null;
  duration_limit: number;
  total_marks: number;
}

interface SubmissionRow {
  id: string;
  started_at: string;
  is_finalized: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const INIT_TIMEOUT_MS = 12_000;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Investigation() {
  const navigate    = useNavigate();

  // ── Primary gate: use the SHARED auth context, NOT a re-fetch hook ─────────
  // useAuth already restored team + session from localStorage + Supabase on app
  // mount (via syncParticipantSession). No need to re-query from scratch here.
  const {
    currentTeam,
    currentSession,
    isParticipantLoading,
  } = useAuth();

  // ── Workspace state ────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState<WorkspacePhase>('loading');
  const [initError, setInitError]   = useState<string | null>(null);

  // ── Fetched data ───────────────────────────────────────────────────────────
  const [caseData, setCaseData]     = useState<CaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [questions, setQuestions]   = useState<any[]>([]);
  const [options, setOptions]       = useState<any[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState<'brief' | 'questions'>(() => {
    const s = localStorage.getItem('mystery_y_active_section');
    return s === 'questions' ? 'questions' : 'brief';
  });
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isFullscreen, setIsFullscreen]           = useState(false);
  const [fullscreenOk, setFullscreenOk]           = useState(true);

  // ── Prevent stale async responses overwriting fresh ones ──────────────────
  const initGen = useRef(0);

  // Persist tab preference (non-sensitive UI pref only)
  const switchTab = useCallback((tab: 'brief' | 'questions') => {
    setActiveTab(tab);
    localStorage.setItem('mystery_y_active_section', tab);
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    const onError  = () => setFullscreenOk(false);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('fullscreenerror', onError);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('fullscreenerror', onError);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  };

  // ── Core initialisation: runs when auth context confirms team + session ────
  const initialize = useCallback(async () => {
    const gen = ++initGen.current;
    setPhase('loading');
    setInitError(null);

    console.debug('[MYSTERY-Y][INVESTIGATION] initialize() called. team:', currentTeam?.id, 'session:', currentSession?.id);

    // Hard timeout: never leave participant on loading screen forever
    const timeoutId = setTimeout(() => {
      if (initGen.current !== gen) return;
      console.error('[MYSTERY-Y][INVESTIGATION] Initialization timed out after 12s');
      setInitError('Investigation initialization timed out. Please check your connection.');
      setPhase('error');
    }, INIT_TIMEOUT_MS);

    try {
      if (!currentTeam || !currentSession) {
        // If auth has finished loading and we still have no team/session,
        // redirect to the appropriate page
        if (!isParticipantLoading) {
          clearTimeout(timeoutId);
          if (!currentTeam) {
            console.debug('[MYSTERY-Y][INVESTIGATION] No team → /register');
            navigate('/register', { replace: true });
          } else {
            console.debug('[MYSTERY-Y][INVESTIGATION] No session → /verify-case');
            navigate('/verify-case', { replace: true });
          }
        }
        // else: still loading auth — stay on loading screen, effect will re-run
        return;
      }

      console.debug('[MYSTERY-Y][INVESTIGATION] Auth confirmed. Loading case + submission + questions...');

      // ── 1. Load case data ──────────────────────────────────────────────────
      const { data: cData, error: cErr } = await supabase
        .from('cases')
        .select('id, case_number, title, description, briefing_media_type, briefing_media_url, briefing_title, briefing_text, duration_limit, total_marks')
        .eq('id', currentTeam.case_id)
        .maybeSingle();

      if (gen !== initGen.current) return;

      if (cErr) throw new Error('CASE DOSSIER NOT FOUND: ' + cErr.message);

      const resolvedCase: CaseData = cData || {
        id: currentTeam.case_id,
        case_number: 'DEMO-01',
        title: 'Case Investigation',
        description: null,
        briefing_media_type: 'none',
        briefing_media_url: null,
        briefing_title: 'Case Briefing',
        briefing_text: 'Review the physical case file.',
        duration_limit: 60,
        total_marks: 100,
      };
      setCaseData(resolvedCase);
      console.debug('[MYSTERY-Y][INVESTIGATION] Case loaded:', resolvedCase.case_number);

      // ── 2. Find / restore submission ───────────────────────────────────────
      let activeSub: SubmissionRow | null = null;

      // Try stored submission id first
      const storedSubId = localStorage.getItem('mystery_y_submission_id');
      if (storedSubId) {
        const { data: subById } = await supabase
          .from('submissions')
          .select('id, started_at, is_finalized')
          .eq('id', storedSubId)
          .maybeSingle();
        if (subById) activeSub = subById as SubmissionRow;
      }

      // Fallback: query by team + case
      if (!activeSub) {
        const { data: subByTeam } = await supabase
          .from('submissions')
          .select('id, started_at, is_finalized')
          .eq('team_id', currentTeam.id)
          .eq('case_id', currentTeam.case_id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subByTeam) activeSub = subByTeam as SubmissionRow;
      }

      if (gen !== initGen.current) return;

      if (activeSub) {
        setSubmission(activeSub);
        localStorage.setItem('mystery_y_submission_id', activeSub.id);
        console.debug('[MYSTERY-Y][INVESTIGATION] Submission:', activeSub.id, '| started_at:', activeSub.started_at);
      } else {
        // No submission yet — use session start time as fallback for timer
        console.warn('[MYSTERY-Y][INVESTIGATION] No submission found, using session start time for timer');
      }

      // ── 3. Load questions + options in parallel ────────────────────────────
      console.debug('[MYSTERY-Y][INVESTIGATION] Loading questions for case:', currentTeam.case_id);

      const [qRes, oRes] = await Promise.all([
        supabase
          .from('questions')
          .select('id, case_id, question_text, type, marks, is_required, sort_order')
          .eq('case_id', currentTeam.case_id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('question_options')
          .select('id, question_id, option_text, sort_order'),
      ]);

      if (gen !== initGen.current) return;

      if (qRes.error) throw new Error('Failed to load questions: ' + qRes.error.message);

      setQuestions(qRes.data || []);
      setOptions(oRes.data || []);
      console.debug('[MYSTERY-Y][INVESTIGATION] Questions:', qRes.data?.length ?? 0, '| Options:', oRes.data?.length ?? 0);

      clearTimeout(timeoutId);

      if (gen !== initGen.current) return;

      // ── 4. Check security lock ──────────────────────────────────────────────
      if (currentSession.id) {
        try {
          const { data: secLogs } = await supabase
            .from('security_logs')
            .select('id, event_type')
            .eq('team_id', currentTeam.id)
            .eq('session_id', currentSession.id);

          if (secLogs) {
            const departures = secLogs.filter((l: any) =>
              ['tab_switch', 'window_blur', 'tab_blur'].includes(l.event_type)
            );
            if (departures.length >= 3) {
              console.warn('[MYSTERY-Y][SECURITY] Team is at 3/3 violations — locked');
              setPhase('locked');
              return;
            }
          }
        } catch (secErr) {
          console.warn('[MYSTERY-Y][SECURITY] Could not check security state (non-fatal):', secErr);
        }
      }

      console.debug('[MYSTERY-Y][INVESTIGATION] Workspace ready ✓');
      setPhase('ready');

    } catch (err: any) {
      if (gen !== initGen.current) return;
      clearTimeout(timeoutId);
      const msg = err?.message || 'Failed to initialize investigation';
      console.error('[MYSTERY-Y][INVESTIGATION] Init error:', msg);
      setInitError(msg);
      setPhase('error');
    }
  }, [currentTeam, currentSession, isParticipantLoading, navigate]);

  // Re-run initialize whenever auth state settles
  useEffect(() => {
    // Don't do anything while auth is still loading
    if (isParticipantLoading) {
      console.debug('[MYSTERY-Y][INVESTIGATION] Waiting for auth to settle...');
      return;
    }
    initialize();
  }, [isParticipantLoading, initialize]);

  // ── Autosave (only active when workspace is ready) ─────────────────────────
  const { drafts, updateAnswer, syncStatus, syncError } = useAutoSave(
    phase === 'ready' ? currentTeam?.id : undefined
  );

  // ── Timer — authoritative source: submission.started_at → session fallback ─
  const timerStartedAt = submission?.started_at ?? currentSession?.started_at;
  const { formattedTime } = useInvestigationTimer(
    phase === 'ready' ? timerStartedAt : undefined,
    caseData?.duration_limit ?? 60
  );

  // ── Security monitor — non-blocking, starts after workspace is ready ───────
  const { violations, activeWarning, lastEvent, dismissWarning } = useSecurityMonitor(
    phase === 'ready' ? currentTeam?.id : undefined,
    phase === 'ready' ? currentSession?.id : undefined
  );

  // ── Render: Loading ────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono">
        <Clock className="w-8 h-8 animate-spin text-detective-crimson mb-4" />
        <div className="text-white font-bold tracking-widest text-sm mb-2 uppercase">
          [ RESTORING INVESTIGATION SESSION... ]
        </div>
        <div className="text-xs text-detective-muted uppercase tracking-wider">
          Verifying security clearance and dossier state
        </div>
      </div>
    );
  }

  // ── Render: Security locked ────────────────────────────────────────────────
  if (phase === 'locked') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson rounded-lg p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-detective-crimson mx-auto mb-4" />
          <div className="text-detective-crimson font-bold tracking-widest text-base mb-2 uppercase">
            [ SECURITY REVIEW REQUIRED ]
          </div>
          <div className="text-detective-muted text-xs mb-6 leading-relaxed">
            Maximum security violations reached (3/3). Your investigation has been flagged for administrator review.
          </div>
          <div className="text-[10px] text-detective-muted border border-detective-border rounded p-3 font-mono">
            CONTACT YOUR EVENT ADMINISTRATOR TO CONTINUE
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson/50 rounded-lg p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-detective-crimson mx-auto mb-4" />
          <div className="text-detective-crimson font-bold tracking-widest text-base mb-2 uppercase">
            [ INVESTIGATION INITIALIZATION FAILED ]
          </div>
          <div className="text-detective-muted text-xs mb-6 leading-relaxed">
            {initError || 'The investigation session could not be restored.'}
          </div>
          <div className="flex flex-col gap-2">
            <button
              id="btn-retry-init"
              onClick={() => initialize()}
              className="w-full flex items-center justify-center gap-2 bg-detective-crimson/20 border border-detective-crimson/50 text-detective-crimson font-bold py-2.5 px-4 rounded text-xs tracking-wider hover:bg-detective-crimson/30 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> [ RETRY ]
            </button>
            <button
              id="btn-return-briefing"
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

  // ── Render: Ready — Investigation Workspace ────────────────────────────────
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

      {/* Security overlay */}
      {activeWarning && (
        <SecurityWarning
          type={activeWarning}
          violations={violations}
          onDismiss={dismissWarning}
          eventType={lastEvent}
        />
      )}

      {/* ── Top Command Bar ──────────────────────────────────────────────── */}
      <header className="h-14 bg-detective-panel border-b border-detective-border px-4 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">

        {/* Left: branding + identifiers */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="font-bold text-detective-crimson uppercase tracking-wider text-xs sm:text-sm select-none flex-shrink-0">
            🔎 MYSTERY Y
          </span>

          <div className="hidden sm:flex items-center gap-1.5 text-xs bg-black/30 border border-detective-border rounded px-2 py-1 flex-shrink-0">
            <span className="text-detective-muted">CASE:</span>
            <span className="text-white font-bold">{caseData!.case_number}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-xs bg-black/30 border border-detective-border rounded px-2 py-1 flex-shrink-0">
            <span className="text-detective-muted">TEAM:</span>
            <span className="text-white font-bold truncate max-w-[100px]">{currentTeam!.team_id_label}</span>
          </div>

          {/* Security badge */}
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-bold flex-shrink-0 ${
            violations >= 3
              ? 'bg-detective-crimson/20 border-detective-crimson/50 text-detective-crimson animate-pulse'
              : violations > 0
                ? 'bg-detective-amber/10 border-detective-amber/50 text-detective-amber'
                : 'bg-detective-green/10 border-detective-green/30 text-detective-green'
          }`}>
            <ShieldAlert className="w-3 h-3" />
            <span>{violations}/3</span>
          </div>
        </div>

        {/* Right: sync + fullscreen + timer */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

          {/* Autosave indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs min-w-[60px]">
            {syncStatus === 'saving' && (
              <span className="text-detective-amber flex items-center gap-1">
                <Database className="w-3 h-3 animate-pulse" /> Saving...
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="text-detective-green flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> ✓ Saved
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="text-detective-alert flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-[10px]">{syncError || 'Retry'}</span>
              </span>
            )}
          </div>

          {/* Fullscreen */}
          {fullscreenOk && (
            <button
              id="btn-fullscreen"
              onClick={toggleFullscreen}
              className="flex items-center gap-1 text-xs bg-black/40 hover:bg-black/60 border border-detective-border px-2 py-1 rounded text-stone-300 hover:text-white transition-colors font-bold"
            >
              {isFullscreen
                ? <><Minimize className="w-3.5 h-3.5 text-detective-amber" /><span className="hidden lg:inline text-[10px]">EXIT FS</span></>
                : <><Maximize className="w-3.5 h-3.5 text-detective-green" /><span className="hidden lg:inline text-[10px]">FULLSCREEN</span></>
              }
            </button>
          )}

          {/* Elapsed timer */}
          <div className="flex items-center gap-1.5 text-white bg-black/40 border border-detective-border px-2.5 py-1 rounded font-mono text-xs sm:text-sm tracking-wider font-bold">
            <Clock className="w-3.5 h-3.5 text-detective-crimson animate-pulse" />
            <span>{formattedTime}</span>
          </div>
        </div>
      </header>

      {/* ── Main Workspace ───────────────────────────────────────────────── */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden">

        {/* Left nav pane */}
        <div className="w-full md:w-64 bg-detective-panel border-b md:border-b-0 md:border-r border-detective-border flex flex-col flex-shrink-0">

          {/* Tab selector */}
          <div className="p-3 border-b border-detective-border grid grid-cols-2 gap-1 bg-black/10">
            <button
              id="tab-briefing"
              onClick={() => switchTab('brief')}
              className={`py-2 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors flex flex-col items-center gap-0.5 ${
                activeTab === 'brief'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <BookOpen className="w-3 h-3" />
              Briefing
            </button>
            <button
              id="tab-inquiry"
              onClick={() => switchTab('questions')}
              className={`py-2 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors flex flex-col items-center gap-0.5 ${
                activeTab === 'questions'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              }`}
            >
              <Send className="w-3 h-3" />
              Inquiry ({answeredCount}/{questions.length})
            </button>
          </div>

          {/* Nav content */}
          <div className="flex-grow overflow-y-auto p-4 space-y-3">

            {/* Briefing nav — Case Summary */}
            {activeTab === 'brief' && (
              <div className="space-y-3 text-xs">
                <div className="font-bold text-detective-crimson uppercase tracking-wider border-b border-detective-border pb-1">
                  Case Summary
                </div>
                <p className="text-stone-300 leading-relaxed">{caseData!.title}</p>

                {/* Metadata grid */}
                <div className="bg-black/20 rounded border border-detective-border/50 divide-y divide-detective-border/30 text-[10px]">
                  {[
                    { label: 'CASE ID',  value: caseData!.case_number, cls: 'text-white' },
                    { label: 'TEAM',     value: currentTeam!.name,     cls: 'text-white truncate' },
                    { label: 'ID',       value: currentTeam!.team_id_label, cls: 'text-detective-amber font-mono' },
                    { label: 'STATUS',   value: 'ACTIVE INVESTIGATION', cls: 'text-detective-green' },
                    { label: 'ELAPSED',  value: formattedTime,          cls: 'text-detective-amber font-mono' },
                    { label: 'SECURITY', value: `${violations}/3`,      cls: violations >= 3 ? 'text-detective-crimson' : violations > 0 ? 'text-detective-amber' : 'text-detective-green' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center px-2 py-1.5">
                      <span className="text-detective-muted">{row.label}</span>
                      <span className={`font-bold max-w-[110px] text-right truncate ${row.cls}`}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-black/20 border border-detective-border/40 rounded p-2.5 text-detective-muted leading-relaxed text-[10px]">
                  Review the briefing video/audio before answering inquiry questions. Answers autosave.
                </div>
              </div>
            )}

            {/* Inquiry nav — Question list */}
            {activeTab === 'questions' && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-detective-muted uppercase tracking-wider mb-2">
                  Deduction Files
                </div>
                {questions.length === 0 && (
                  <div className="text-[10px] text-detective-muted py-4 text-center italic">
                    No questions found for this case.
                  </div>
                )}
                {questions.map((q, idx) => {
                  const draft       = drafts.find((d) => d.question_id === q.id);
                  const isCompleted = draft
                    ? ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)
                      ? draft.selected_options.length > 0
                      : draft.answer_text.trim().length > 0
                    : false;

                  return (
                    <button
                      key={q.id}
                      id={`q-nav-${idx}`}
                      onClick={() => { switchTab('questions'); setActiveQuestionIdx(idx); }}
                      className={`w-full flex items-center justify-between p-2.5 text-left rounded border transition-all text-xs ${
                        activeTab === 'questions' && idx === activeQuestionIdx
                          ? 'border-detective-crimson bg-detective-crimson/8 font-bold text-white'
                          : 'border-detective-border/40 hover:bg-black/20 text-detective-muted'
                      }`}
                    >
                      <div className="truncate flex-grow pr-1.5 text-[10px]">
                        Q{q.sort_order}. {q.question_text}
                      </div>
                      {isCompleted
                        ? <CheckCircle className="w-3.5 h-3.5 text-detective-green flex-shrink-0" />
                        : <AlertTriangle className="w-3.5 h-3.5 text-detective-amber flex-shrink-0" />
                      }
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom team badge */}
          <div className="p-3 bg-black/40 border-t border-detective-border text-xs space-y-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-detective-muted text-[10px]">
              <User className="w-3 h-3" /> ACTIVE INVESTIGATOR
            </div>
            <div className="font-bold text-white uppercase truncate text-[11px]">{currentTeam!.name}</div>
            <div className="text-[9px] text-detective-crimson font-mono font-bold tracking-widest">{currentTeam!.team_id_label}</div>
          </div>
        </div>

        {/* Center: Main display board */}
        <div className="flex-grow flex flex-col overflow-hidden bg-black/5">

          {/* Briefing panel */}
          {activeTab === 'brief' && (
            <div className="flex-grow p-4 sm:p-6 overflow-y-auto flex items-start justify-center">
              <CaseBriefing
                caseInfo={caseData!}
                teamName={currentTeam!.name}
                isBeforeStart={false}
              />
            </div>
          )}

          {/* Inquiry panel */}
          {activeTab === 'questions' && (
            <div className="flex-grow overflow-hidden relative">
              <QuestionSheet
                questions={questions}
                options={options}
                answers={drafts}
                onAnswerChange={(qId, text, selected) => {
                  const q        = questions.find((item) => item.id === qId);
                  const isChoice = q && ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);
                  updateAnswer(qId, text, selected, !!isChoice);
                }}
                activeQuestionIndex={activeQuestionIdx}
              />

              {/* Prev / Next / Submit bar */}
              <div className="absolute bottom-0 left-0 w-full h-14 bg-white border-t border-black/10 px-4 sm:px-8 flex justify-between items-center z-10">
                <button
                  id="btn-prev-q"
                  disabled={activeQuestionIdx === 0}
                  onClick={() => setActiveQuestionIdx(p => p - 1)}
                  className="px-3 sm:px-4 py-1.5 rounded border border-black/20 text-xs font-bold text-black/60 hover:bg-black/5 disabled:opacity-30 transition-colors"
                >
                  PREV
                </button>

                <span className="text-xs text-stone-500 font-bold">
                  {activeQuestionIdx + 1} / {questions.length}
                </span>

                {activeQuestionIdx < questions.length - 1 ? (
                  <button
                    id="btn-next-q"
                    onClick={() => setActiveQuestionIdx(p => p + 1)}
                    className="px-3 sm:px-4 py-1.5 rounded bg-detective-dark hover:bg-detective-crimson text-white text-xs font-bold transition-colors"
                  >
                    NEXT
                  </button>
                ) : (
                  <button
                    id="btn-review-submit"
                    onClick={() => navigate('/review')}
                    className="px-3 sm:px-5 py-2 rounded bg-detective-crimson hover:bg-detective-alert text-white text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(139,0,0,0.2)]"
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
