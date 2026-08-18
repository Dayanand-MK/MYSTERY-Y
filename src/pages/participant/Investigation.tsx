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
import InvestigationNotes from '../../components/investigation/InvestigationNotes';
import InvestigationProgress from '../../components/investigation/InvestigationProgress';
import EvidenceLocker from '../../components/investigation/EvidenceLocker';
import {
  Clock,
  ShieldAlert,
  CheckCircle,
  Database,
  BookOpen,
  Send,
  AlertTriangle,
  User,
  Maximize2,
  RefreshCw,
  Lock,
  ShieldCheck,
  Ban,
  Menu,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WorkspacePhase = 'loading' | 'ready' | 'error' | 'locked' | 'terminated';

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
  session_id: string;
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
  const navigate = useNavigate();

  const {
    currentTeam,
    currentSession,
    isParticipantLoading,
  } = useAuth();

  // ── Workspace state ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<WorkspacePhase>('loading');
  const [initError, setInitError] = useState<string | null>(null);

  // ── Fetched data ───────────────────────────────────────────────────────────
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'brief' | 'questions'>(() => {
    const s = localStorage.getItem('mystery_y_active_section');
    return s === 'questions' ? 'questions' : 'brief';
  });
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCaseDrawerOpen, setIsCaseDrawerOpen] = useState(false);

  // Prevent stale async responses
  const initGen = useRef(0);

  // Persist tab preference
  const switchTab = useCallback((tab: 'brief' | 'questions') => {
    setActiveTab(tab);
    localStorage.setItem('mystery_y_active_section', tab);
  }, []);

  // ── Fullscreen management ──────────────────────────────────────────────────
  const requestAppFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      return Boolean(document.fullscreenElement);
    } catch (err) {
      console.warn('[MYSTERY-Y][INVESTIGATION] Fullscreen request error:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onChange);

    // Initial fullscreen check
    setIsFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

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
        return;
      }

      console.debug('[MYSTERY-Y][INVESTIGATION] Auth confirmed. Loading case + submission + questions...');

      // 1. Load case data
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

      // 2. Find / restore submission
      let activeSub: SubmissionRow | null = null;
      const storedSubId = localStorage.getItem('mystery_y_submission_id');
      if (storedSubId) {
        const { data: subById } = await supabase
          .from('submissions')
          .select('id, session_id, started_at, is_finalized')
          .eq('id', storedSubId)
          .maybeSingle();
        if (subById && subById.session_id === currentSession.id) activeSub = subById as SubmissionRow;
      }

      if (!activeSub) {
        const { data: subByTeam } = await supabase
          .from('submissions')
          .select('id, session_id, started_at, is_finalized')
          .eq('team_id', currentTeam.id)
          .eq('case_id', currentTeam.case_id)
          .eq('session_id', currentSession.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subByTeam) activeSub = subByTeam as SubmissionRow;
      }

      if (gen !== initGen.current) return;

      if (activeSub) {
        setSubmission(activeSub);
        localStorage.setItem('mystery_y_submission_id', activeSub.id);
      }

      // 3. Load questions + options in parallel
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

      clearTimeout(timeoutId);

      if (gen !== initGen.current) return;

      // 4. Check if session/team was terminated
      if (currentSession.status === 'terminated') {
        setPhase('terminated');
        return;
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
  }, [currentTeam, currentSession, isParticipantLoading, navigate, requestAppFullscreen]);

  // Re-run initialize whenever auth state settles
  useEffect(() => {
    if (isParticipantLoading) return;
    initialize();
  }, [isParticipantLoading, initialize]);

  // ── Autosave (only active when workspace is ready and not locked) ───────────
  const { drafts, updateAnswer, syncStatus, syncError, isOnline, lastSavedAt } = useAutoSave(
    phase === 'ready' ? currentTeam?.id : undefined
  );

  // ── Security monitor — unified 3-strike monitoring ─────────────────────────
  const {
    violations,
    activeWarning,
    lastEvent,
    isLocked,
    isTerminated,
    sessionRestored,
    dismissSessionRestored,
    dismissWarning
  } = useSecurityMonitor(
    phase === 'ready' || phase === 'locked' ? currentTeam?.id : undefined,
    phase === 'ready' || phase === 'locked' ? currentSession?.id : undefined,
    // Security listeners must stay active for an active investigation even if
    // the browser declines a delayed fullscreen request. The monitor itself
    // only treats an exit as a violation after fullscreen was actually entered.
    phase === 'ready'
  );

  // ── Timer — authoritative source: submission.started_at → session fallback ─
  const timerStartedAt = submission?.started_at ?? currentSession?.started_at;
  const isSecurityPaused = Boolean(activeWarning && lastEvent.toUpperCase().includes('FULLSCREEN'));
  const { formattedRemaining, isWarning: isTimerWarning, isCritical: isTimerCritical } = useInvestigationTimer(
    phase === 'ready' || phase === 'locked' ? timerStartedAt : undefined,
    caseData?.duration_limit ?? 60,
    isSecurityPaused
  );

  // Handle return to fullscreen from warning overlay
  const handleReturnFullscreen = async () => {
    const restored = await requestAppFullscreen();
    if (restored) dismissWarning();
  };

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

  // ── Render: Terminated by Administrator ────────────────────────────────────
  if (phase === 'terminated' || isTerminated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson rounded-lg p-8 text-center shadow-2xl">
          <Ban className="w-12 h-12 text-detective-crimson mx-auto mb-4 animate-pulse" />
          <div className="text-detective-crimson font-bold tracking-widest text-base mb-2 uppercase">
            [ INVESTIGATION TERMINATED ]
          </div>
          <div className="text-detective-muted text-xs mb-6 leading-relaxed">
            This investigation session has been permanently terminated by the event security administrator. All records and answers have been securely preserved.
          </div>
          <div className="text-[10px] text-detective-alert border border-detective-crimson/40 bg-detective-crimson/10 rounded p-3 font-mono font-bold">
            STATUS: TERMINATED / FINALIZED
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-detective-dark font-mono px-4">
        <div className="max-w-md w-full bg-detective-panel border border-detective-crimson/50 rounded-lg p-8 text-center shadow-2xl">
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
              className="w-full flex items-center justify-center gap-2 bg-detective-crimson/20 border border-detective-crimson/50 text-detective-crimson font-bold py-2.5 px-4 rounded text-xs tracking-wider hover:bg-detective-crimson/30 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> [ RETRY ]
            </button>
            <button
              id="btn-return-briefing"
              onClick={() => navigate('/verify-case')}
              className="w-full border border-detective-border text-detective-muted py-2 px-4 rounded text-xs tracking-wider hover:bg-detective-panel transition-colors cursor-pointer"
            >
              [ RETURN TO CASE BRIEFING ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Ready / Active Workspace ───────────────────────────────────────
  // The server session status is authoritative: an admin can restore a 3/3 session
  // without deleting its incident history.
  const isCurrentlyLocked = isLocked;

  const answeredCount = questions.filter((q) => {
    const draft = drafts.find((d) => d.question_id === q.id);
    if (!draft) return false;
    if (['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)) {
      return draft.selected_options.length > 0;
    }
    return draft.answer_text.trim().length > 0;
  }).length;

  return (
    <div className="h-[100dvh] flex flex-col bg-detective-dark font-mono overflow-hidden">

      {/* Security overlay for every incident or 3/3 lock */}
      {(activeWarning || isCurrentlyLocked) && (
        <SecurityWarning
          type={isCurrentlyLocked ? 'block' : activeWarning!}
          violations={violations}
          onDismiss={dismissWarning}
          onReturnFullscreen={handleReturnFullscreen}
          eventType={lastEvent}
        />
      )}

      {sessionRestored && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[10000] bg-detective-green/95 border border-detective-green text-white px-5 py-3 rounded shadow-2xl text-xs font-bold tracking-wider">
          [ SESSION RESTORED ] An administrator has authorized this investigation to continue.
          <button onClick={dismissSessionRestored} className="ml-3 underline">DISMISS</button>
        </div>
      )}

      {/* ── Top Command Bar ──────────────────────────────────────────────── */}
      <header className="h-14 bg-detective-panel border-b border-detective-border px-4 sm:px-6 flex items-center justify-between z-30 flex-shrink-0">

        {/* Left: Branding + Identifiers */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <span className="font-bold text-detective-crimson uppercase tracking-wider text-xs sm:text-sm select-none flex-shrink-0">
            🔎 MYSTERY Y
          </span>

          <button onClick={() => setIsCaseDrawerOpen(true)} className="md:hidden min-h-11 min-w-11 inline-flex items-center justify-center border border-detective-border text-detective-muted hover:text-white" aria-label="Open case file">
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden sm:flex items-center gap-1.5 text-xs bg-black/30 border border-detective-border rounded px-2 py-1 flex-shrink-0">
            <span className="text-detective-muted">CASE:</span>
            <span className="text-white font-bold">{caseData!.case_number}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-xs bg-black/30 border border-detective-border rounded px-2 py-1 flex-shrink-0">
            <span className="text-detective-muted">TEAM:</span>
            <span className="text-white font-bold truncate max-w-[100px]">{currentTeam!.team_id_label}</span>
          </div>

          {/* Unified 3-Strike Security badge */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border font-bold flex-shrink-0 ${
            violations >= 3
              ? 'bg-detective-crimson/20 border-detective-crimson text-detective-crimson animate-pulse'
              : violations > 0
                ? 'bg-detective-amber/15 border-detective-amber text-detective-amber'
                : 'bg-detective-green/10 border-detective-green/30 text-detective-green'
          }`}>
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">SECURITY ATTEMPTS:</span>
            <span>{violations} / 3</span>
          </div>
        </div>

        {/* Right: Fullscreen status indicator + Autosave + Timer */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

          {/* Mandatory Fullscreen State Indicator & Re-enter Button */}
          {isFullscreen ? (
            <div className="hidden lg:flex items-center gap-1.5 text-[10px] bg-detective-green/10 border border-detective-green/30 text-detective-green px-2.5 py-1 rounded font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3 h-3" />
              <span>🔒 SECURE MODE (FULLSCREEN ACTIVE)</span>
            </div>
          ) : (
            <button
              id="btn-reenter-fullscreen"
              onClick={requestAppFullscreen}
              className="flex items-center gap-1 text-[11px] bg-detective-crimson hover:bg-detective-alert text-white border border-detective-crimson/60 px-2.5 py-1 rounded font-bold uppercase tracking-wider animate-pulse transition-all shadow-[0_0_10px_rgba(211,47,47,0.4)] cursor-pointer"
              title="Fullscreen mode is mandatory during investigation"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>[ FULLSCREEN ]</span>
            </button>
          )}

          {/* Autosave sync indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs min-w-[60px]">
            {syncStatus === 'saving' && (
              <span className="text-detective-amber flex items-center gap-1 text-[10px]">
                <Database className="w-3 h-3 animate-pulse" /> Saving...
              </span>
            )}
            {syncStatus === 'saved' && (
              <span className="text-detective-green flex items-center gap-1 text-[10px]">
                <CheckCircle className="w-3 h-3" /> Saved {lastSavedAt || ''}
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="text-detective-alert flex items-center gap-1 animate-pulse text-[10px]">
                <AlertTriangle className="w-3 h-3" />
                <span>{syncError || 'Retry'}</span>
              </span>
            )}
          </div>

          <div className={`hidden sm:flex items-center gap-1 text-[10px] font-bold ${isOnline ? 'text-detective-green' : 'text-detective-alert'}`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>

          <div className={`flex items-center gap-1.5 text-white bg-black/40 border px-2.5 py-1 rounded font-mono text-xs sm:text-sm tracking-wider font-bold ${isTimerCritical ? 'border-detective-crimson text-detective-alert animate-pulse' : isTimerWarning ? 'border-detective-amber text-detective-amber' : 'border-detective-border'}`}>
            <Clock className="w-3.5 h-3.5" />
            <span>{formattedRemaining}</span><span className="hidden sm:inline text-[9px]">REMAINING</span>
          </div>
        </div>
      </header>

      {isCaseDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Case file">
          <button className="absolute inset-0 bg-black/70" aria-label="Close case file" onClick={() => setIsCaseDrawerOpen(false)} />
          <aside className="relative h-full w-[min(86vw,360px)] bg-detective-panel border-r border-detective-border shadow-2xl flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-detective-border">
              <div><div className="text-[10px] text-detective-crimson font-bold tracking-widest">MYSTERY Y</div><h2 className="text-sm font-bold text-white uppercase">Case File</h2></div>
              <button className="min-h-11 min-w-11 inline-flex items-center justify-center text-detective-muted hover:text-white" onClick={() => setIsCaseDrawerOpen(false)} aria-label="Close case file"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2 border-b border-detective-border">
              <button onClick={() => { switchTab('brief'); setIsCaseDrawerOpen(false); }} className={`min-h-11 border text-[10px] font-bold uppercase ${activeTab === 'brief' ? 'border-detective-crimson bg-detective-crimson text-white' : 'border-detective-border text-detective-muted'}`}>Briefing</button>
              <button disabled={isCurrentlyLocked || isSecurityPaused} onClick={() => { switchTab('questions'); setIsCaseDrawerOpen(false); }} className={`min-h-11 border text-[10px] font-bold uppercase ${activeTab === 'questions' ? 'border-detective-crimson bg-detective-crimson text-white' : 'border-detective-border text-detective-muted'} disabled:opacity-40`}>Inquiry</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <InvestigationProgress answered={answeredCount} total={questions.length} />
              <div className="pt-2 text-[10px] text-detective-muted font-bold uppercase tracking-wider">Question files</div>
              {questions.map((q, idx) => {
                const draft = drafts.find((d) => d.question_id === q.id);
                const complete = draft && (['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type) ? draft.selected_options.length > 0 : draft.answer_text.trim().length > 0);
                return <button key={q.id} disabled={isCurrentlyLocked || isSecurityPaused} onClick={() => { switchTab('questions'); setActiveQuestionIdx(idx); setIsCaseDrawerOpen(false); }} className={`min-h-11 w-full flex items-center justify-between px-3 border text-left text-xs ${idx === activeQuestionIdx && activeTab === 'questions' ? 'border-detective-crimson text-white bg-detective-crimson/10' : 'border-detective-border text-detective-muted'} disabled:opacity-40`}><span>Q{q.sort_order}</span><span aria-label={complete ? 'Answered' : 'Unanswered'} className={complete ? 'text-detective-green' : 'text-detective-muted'}>{complete ? '✓' : '○'}</span></button>;
              })}
              <EvidenceLocker caseNumber={caseData!.case_number} briefingTitle={caseData!.briefing_title} />
              <InvestigationNotes teamId={currentTeam!.id} sessionId={currentSession!.id} disabled={isCurrentlyLocked || isSecurityPaused} />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Workspace ───────────────────────────────────────────────── */}
      <div className="flex-grow flex flex-col md:flex-row overflow-hidden relative">

        {/* Left nav pane */}
        <div className="hidden md:flex w-64 bg-detective-panel border-r border-detective-border flex-col flex-shrink-0">

          {/* Tab selector */}
          <div className="p-3 border-b border-detective-border grid grid-cols-2 gap-1 bg-black/10">
            <button
              id="tab-briefing"
              onClick={() => switchTab('brief')}
              className={`py-2 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors flex flex-col items-center gap-0.5 cursor-pointer ${
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
              disabled={isCurrentlyLocked}
              className={`py-2 px-1 text-center rounded text-[10px] uppercase font-bold tracking-wider transition-colors flex flex-col items-center gap-0.5 cursor-pointer ${
                activeTab === 'questions'
                  ? 'bg-detective-crimson text-white'
                  : 'bg-black/25 hover:bg-black/50 text-detective-muted'
              } ${isCurrentlyLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                    { label: 'CASE ID', value: caseData!.case_number, cls: 'text-white' },
                    { label: 'TEAM', value: currentTeam!.name, cls: 'text-white truncate' },
                    { label: 'ID', value: currentTeam!.team_id_label, cls: 'text-detective-amber font-mono' },
                    { label: 'STATUS', value: isCurrentlyLocked ? 'SESSION LOCKED' : 'ACTIVE INVESTIGATION', cls: isCurrentlyLocked ? 'text-detective-crimson animate-pulse' : 'text-detective-green' },
                    { label: 'REMAINING', value: formattedRemaining, cls: 'text-detective-amber font-mono' },
                    { label: 'SECURITY', value: `${violations} / 3`, cls: violations >= 3 ? 'text-detective-crimson' : violations > 0 ? 'text-detective-amber' : 'text-detective-green' },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center px-2 py-1.5">
                      <span className="text-detective-muted">{row.label}</span>
                      <span className={`font-bold max-w-[110px] text-right truncate ${row.cls}`}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-black/20 border border-detective-border/40 rounded p-2.5 text-detective-muted leading-relaxed text-[10px]">
                  Review the physical case file and briefing materials carefully. All answers autosave.
                </div>
                <InvestigationProgress answered={answeredCount} total={questions.length} />
                <EvidenceLocker caseNumber={caseData!.case_number} briefingTitle={caseData!.briefing_title} />
                <InvestigationNotes teamId={currentTeam!.id} sessionId={currentSession!.id} disabled={isCurrentlyLocked || isSecurityPaused} />
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
                  const draft = drafts.find((d) => d.question_id === q.id);
                  const isCompleted = draft
                    ? ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)
                      ? draft.selected_options.length > 0
                      : draft.answer_text.trim().length > 0
                    : false;

                  return (
                    <button
                      key={q.id}
                      id={`q-nav-${idx}`}
                      disabled={isCurrentlyLocked}
                      onClick={() => { switchTab('questions'); setActiveQuestionIdx(idx); }}
                      className={`w-full flex items-center justify-between p-2.5 text-left rounded border transition-all text-xs cursor-pointer ${
                        activeTab === 'questions' && idx === activeQuestionIdx
                          ? 'border-detective-crimson bg-detective-crimson/8 font-bold text-white'
                          : 'border-detective-border/40 hover:bg-black/20 text-detective-muted'
                      } ${isCurrentlyLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="truncate flex-grow pr-1.5 text-[10px]">
                        Q{q.sort_order}. {q.question_text}
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
          <div className="p-3 bg-black/40 border-t border-detective-border text-xs space-y-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-detective-muted text-[10px]">
              <User className="w-3 h-3" /> ACTIVE INVESTIGATOR
            </div>
            <div className="font-bold text-white uppercase truncate text-[11px]">{currentTeam!.name}</div>
            <div className="text-[9px] text-detective-crimson font-mono font-bold tracking-widest">{currentTeam!.team_id_label}</div>
          </div>
        </div>

        {/* Center: Main display board */}
        <div className="flex-grow flex flex-col overflow-hidden bg-black/5 relative">

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
              {isCurrentlyLocked && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs z-20 flex items-center justify-center p-4">
                  <div className="max-w-sm w-full bg-detective-panel border border-detective-crimson rounded p-6 text-center shadow-2xl">
                    <Lock className="w-8 h-8 text-detective-crimson mx-auto mb-2 animate-pulse" />
                    <div className="text-sm font-bold text-detective-alert uppercase mb-1">
                      SESSION LOCKED (3/3)
                    </div>
                    <p className="text-xs text-detective-muted mb-4">
                      An administrator must review your session before you can submit further answers.
                    </p>
                  </div>
                </div>
              )}

              <QuestionSheet
                questions={questions}
                options={options}
                answers={drafts}
                onAnswerChange={(qId, text, selected) => {
                  if (isCurrentlyLocked) return;
                  const q = questions.find((item) => item.id === qId);
                  const isChoice = q && ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);
                  updateAnswer(qId, text, selected, !!isChoice);
                }}
                activeQuestionIndex={activeQuestionIdx}
                disabled={isCurrentlyLocked || isSecurityPaused}
              />

              {/* Prev / Next / Submit bar */}
              <div className="absolute bottom-0 left-0 w-full h-14 bg-white border-t border-black/10 px-4 sm:px-8 flex justify-between items-center z-10">
                <button
                  id="btn-prev-q"
                  disabled={activeQuestionIdx === 0 || isCurrentlyLocked || isSecurityPaused}
                  onClick={() => setActiveQuestionIdx((p) => p - 1)}
                  className="px-3 sm:px-4 py-1.5 rounded border border-black/20 text-xs font-bold text-black/60 hover:bg-black/5 disabled:opacity-30 transition-colors cursor-pointer"
                >
                  PREV
                </button>

                <span className="text-xs text-stone-500 font-bold">
                  {activeQuestionIdx + 1} / {questions.length}
                </span>

                {activeQuestionIdx < questions.length - 1 ? (
                  <button
                    id="btn-next-q"
                    disabled={isCurrentlyLocked || isSecurityPaused}
                    onClick={() => setActiveQuestionIdx((p) => p + 1)}
                    className="px-3 sm:px-4 py-1.5 rounded bg-detective-dark hover:bg-detective-crimson text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-30"
                  >
                    NEXT
                  </button>
                ) : (
                  <button
                    id="btn-review-submit"
                    disabled={isCurrentlyLocked || isSecurityPaused}
                    onClick={() => navigate('/review')}
                    className="px-3 sm:px-5 py-2 rounded bg-detective-crimson hover:bg-detective-alert text-white text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(211,47,47,0.3)] disabled:opacity-40 cursor-pointer"
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
