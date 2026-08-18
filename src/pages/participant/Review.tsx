import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useInvestigationTimer } from '../../hooks/useInvestigationTimer';
import { supabase } from '../../lib/supabase';
import { ShieldAlert, ChevronLeft, Send, Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Review() {
  const navigate = useNavigate();
  const { currentTeam, currentSession, participantLogout } = useAuth();
  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Sync draft answers
  const { drafts, clearLocalDrafts } = useAutoSave(currentTeam?.id);

  // Sync count-up timer
  const { formattedTime } = useInvestigationTimer(currentSession?.started_at);

  useEffect(() => {
    if (!currentTeam) {
      navigate('/register');
      return;
    }
    if (!currentSession) {
      navigate('/verify-case');
      return;
    }

    async function loadQuestions() {
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('case_id', currentTeam!.case_id)
        .order('sort_order', { ascending: true });

      if (qData) setQuestions(qData);

      const { data: oData } = await supabase
        .from('question_options')
        .select('id, question_id, option_text');

      if (oData) setOptions(oData);
    }

    loadQuestions();
  }, [currentTeam, currentSession, navigate]);

  const handleSubmit = async () => {
    if (!currentSession || !currentTeam) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    // Prepare client answers JSON payload to sync to RPC
    const clientAnswersPayload = questions.map((q) => {
      const draft = drafts.find((d) => d.question_id === q.id) || {
        question_id: q.id,
        answer_text: '',
        selected_options: []
      };
      return {
        question_id: q.id,
        answer_text: draft.answer_text,
        selected_options: draft.selected_options
      };
    });

    try {
      const { data, error } = await supabase.rpc('submit_investigation_transaction', {
        p_session_id: currentSession.id,
        p_client_answers: clientAnswersPayload
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      if (data && !data.success) {
        setErrorMessage(data.error);
        setIsSubmitting(false);
        return;
      }

      // Success! Store submission details locally for the confirmation display
      const receipt = {
        submission_id_label: data.submission_id_label,
        team_name: currentTeam.name,
        case_number: currentTeam.team_id_label, // Wait, team label or case number?
        time_taken: formattedTime,
        submitted_at: data.submitted_at
      };

      localStorage.setItem('mystery_y_receipt', JSON.stringify(receipt));

      // Trigger success confetti celebration
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });

      // Clear local states
      clearLocalDrafts();
      participantLogout();
      setIsSubmitting(false);

      navigate('/submitted');
    } catch (err: any) {
      console.error('Final submission failed', err);
      setErrorMessage(err.message || 'An error occurred during final submission');
      setIsSubmitting(false);
    }
  };

  const isDossierComplete = questions.every((q) => {
    const d = drafts.find((dr) => dr.question_id === q.id);
    if (!d) return false;
    if (['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)) {
      return d.selected_options.length > 0;
    }
    return d.answer_text.trim().length > 0;
  });

  return (
    <div className="min-h-screen w-full bg-detective-dark py-12 px-4 cctv-overlay flex flex-col items-center">
      <div className="max-w-2xl w-full bg-detective-paper text-detective-dark rounded p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-l-[16px] border-detective-crimson">
        
        {/* Top Header */}
        <div className="flex justify-between items-start border-b border-dashed border-detective-dark/20 pb-4 mb-6">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-stone-500">Investigation Review</h2>
            <h1 className="text-2xl font-mono font-bold uppercase tracking-tight text-detective-dark">
              Case Dossier Final Audit
            </h1>
          </div>
          <div className="text-right">
            <span className="text-detective-crimson font-mono font-bold border-2 border-detective-crimson text-xs uppercase tracking-widest px-2.5 py-0.5 inline-block">
              AUDIT STAGE
            </span>
          </div>
        </div>

        {/* Display validation errors */}
        {errorMessage && (
          <div className="flex items-center gap-2 border border-detective-crimson/30 bg-detective-crimson/5 text-detective-crimson p-3.5 rounded mb-6 font-mono text-xs uppercase">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Brief metadata log */}
        <div className="bg-black/5 p-4 rounded border border-black/5 font-mono text-xs text-detective-dark space-y-1.5 mb-6">
          <div>TEAM ID: <span className="font-bold text-detective-crimson">{currentTeam?.team_id_label}</span></div>
          <div>INVESTIGATORS: <span className="font-bold uppercase">{currentTeam?.name}</span></div>
          <div>RECORDED DURATION: <span className="font-bold">{formattedTime}</span></div>
          <div>DOSSIER INTEGRITY: {isDossierComplete ? (
            <span className="text-detective-green font-bold uppercase">COMPLETE</span>
          ) : (
            <span className="text-detective-crimson font-bold uppercase">INCOMPLETE - CLUES MISSING</span>
          )}</div>
        </div>

        {/* Answer checklist */}
        <div className="space-y-4 mb-8">
          <h3 className="font-bold text-xs uppercase text-stone-600 tracking-wider mb-2">Deduction Index Checklist</h3>
          
          {questions.map((q, index) => {
            const draft = drafts.find((d) => d.question_id === q.id);
            const isCompleted = draft
              ? ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)
                ? draft.selected_options.length > 0
                : draft.answer_text.trim().length > 0
              : false;

            // Gather readable choices
            let answerPreview = '';
            if (draft) {
              if (['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type)) {
                const selectedNames = options
                  .filter((o) => draft.selected_options.includes(o.id))
                  .map((o) => o.option_text);
                answerPreview = selectedNames.join(', ');
              } else {
                answerPreview = draft.answer_text;
              }
            }

            return (
              <div key={q.id} className="p-3 bg-black/5 rounded border border-black/5 flex items-start gap-3">
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4 text-detective-green mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-detective-amber mt-0.5 flex-shrink-0" />
                )}
                <div className="font-mono text-xs space-y-1.5 flex-grow truncate">
                  <div className="font-bold text-detective-dark text-xs flex justify-between">
                    <span className="truncate pr-4">Q{index + 1}. {q.question_text}</span>
                    <span className="text-[10px] text-stone-500 flex-shrink-0">({q.marks}M)</span>
                  </div>
                  <div className="text-stone-700 bg-white/40 p-2 rounded italic text-[11px] truncate">
                    {answerPreview || <span className="text-detective-crimson font-bold uppercase">No Clue Logged</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Critical audit warning */}
        <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-crimson p-4 rounded mb-8 font-mono text-xs leading-relaxed">
          <strong>CRITICAL DEDUCTION ADVISORY:</strong> Finalizing this submission locks the case file. Under forensic protocols, answers cannot be altered after lock-in. Time elapsed is finalized server-side.
        </div>

        {/* Submission Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border-t border-dashed border-detective-dark/20 pt-6">
          <button
            onClick={() => navigate('/investigation')}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center gap-1.5 font-mono text-xs uppercase font-bold text-stone-500 hover:text-stone-900 p-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Resume Investigation
          </button>

          <button
            onClick={() => setIsConfirming(true)}
            disabled={isSubmitting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-3 px-8 rounded font-mono uppercase tracking-wider font-bold transition-all duration-300 shadow-[0_0_15px_rgba(139,0,0,0.3)] disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 animate-spin" /> Finalizing Case...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Final Submit Case
              </>
            )}
          </button>
        </div>

      </div>

      {isConfirming && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
          <div className="max-w-md w-full bg-detective-panel border border-detective-crimson shadow-2xl p-6">
            <div className="text-[10px] text-detective-crimson font-bold tracking-widest uppercase">Final confirmation</div>
            <h2 className="mt-2 text-lg text-white font-bold uppercase">Submit this investigation?</h2>
            <p className="mt-3 text-xs text-stone-300 leading-relaxed">Once submitted, your answers cannot be changed. Your final score remains classified.</p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button disabled={isSubmitting} onClick={() => setIsConfirming(false)} className="min-h-11 px-4 border border-detective-border text-detective-muted text-xs font-bold uppercase">Cancel</button>
              <button disabled={isSubmitting} onClick={handleSubmit} className="min-h-11 px-4 bg-detective-crimson text-white text-xs font-bold uppercase disabled:opacity-50">{isSubmitting ? 'Submitting...' : 'Submit Final'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
