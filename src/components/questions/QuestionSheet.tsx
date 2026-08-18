import React, { useMemo } from 'react';
import { AnswerDraft } from '../../hooks/useAutoSave';
import { CheckSquare, Square, CheckCircle, Circle, Hash, Clock, FileText } from 'lucide-react';

interface Option {
  id: string;
  question_id: string;
  option_text: string;
  sort_order: number;
}

interface Question {
  id: string;
  question_text: string;
  type: 'single_choice' | 'multiple_choice' | 'short_answer' | 'long_answer' | 'number' | 'time' | 'evidence_selection';
  marks: number;
  is_required: boolean;
  sort_order: number;
}

interface QuestionSheetProps {
  questions: Question[];
  options: Option[];
  answers: AnswerDraft[];
  onAnswerChange: (questionId: string, answerText: string, selectedOptions: string[]) => void;
  activeQuestionIndex: number;
  disabled?: boolean;
}

// Simple deterministic shuffle using a seed string (team_id) to give each team a stable, unique ordering
function seededShuffle<T>(arr: T[], seed: string): T[] {
  if (arr.length <= 1) return [...arr];
  
  const result = [...arr];
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum += seed.charCodeAt(i);
  }

  for (let i = result.length - 1; i > 0; i--) {
    const r = (seedNum * (i + 1)) % (i + 1);
    const temp = result[i];
    result[i] = result[r];
    result[r] = temp;
  }
  return result;
}

export default function QuestionSheet({
  questions,
  options,
  answers,
  onAnswerChange,
  activeQuestionIndex,
  disabled = false
}: QuestionSheetProps) {
  const activeQuestion = questions[activeQuestionIndex];

  if (!activeQuestion) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-xs text-detective-muted">
        SELECT A CASE INQUIRY FROM THE NAVIGATION PANEL.
      </div>
    );
  }

  // Find current answer draft
  const currentDraft = answers.find(a => a.question_id === activeQuestion.id) || {
    question_id: activeQuestion.id,
    answer_text: '',
    selected_options: []
  };

  // Get options for this question
  const questionOptions = useMemo(() => {
    const rawOpts = options.filter(o => o.question_id === activeQuestion.id);
    
    // Stable shuffle based on the active question ID (acting as a seed)
    // This randomizes option order uniquely per question, remaining stable during renders
    return seededShuffle(rawOpts, activeQuestion.id);
  }, [options, activeQuestion.id]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onAnswerChange(activeQuestion.id, e.target.value, currentDraft.selected_options);
  };

  const handleOptionToggle = (optionId: string, isSingle: boolean) => {
    if (disabled) return;
    let nextOptions: string[] = [];
    if (isSingle) {
      nextOptions = [optionId];
    } else {
      const idx = currentDraft.selected_options.indexOf(optionId);
      if (idx !== -1) {
        nextOptions = currentDraft.selected_options.filter(id => id !== optionId);
      } else {
        nextOptions = [...currentDraft.selected_options, optionId];
      }
    }
    onAnswerChange(activeQuestion.id, currentDraft.answer_text, nextOptions);
  };

  return (
    <div className="flex flex-col h-full bg-white text-detective-dark p-6 md:p-8 font-mono select-none">
      
      {/* Title with Marks Badge */}
      <div className="flex justify-between items-start gap-4 border-b border-black/10 pb-4 mb-6">
        <div className="flex gap-2">
          <span className="text-detective-crimson font-bold text-lg">Q{activeQuestion.sort_order}.</span>
          <h2 className="text-md md:text-lg font-bold leading-relaxed">{activeQuestion.question_text}</h2>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-[10px] uppercase font-bold bg-detective-dark text-white px-2.5 py-1 rounded">
            {activeQuestion.marks} Marks
          </span>
          {activeQuestion.is_required && (
            <div className="text-[8px] text-detective-crimson uppercase font-bold mt-1.5">[Required]</div>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-detective-crimson">
        <FileText className="w-3.5 h-3.5" />
        {activeQuestion.type === 'evidence_selection' ? 'Evidence Board' : activeQuestion.type === 'number' ? 'Forensic Record' : activeQuestion.type === 'time' ? 'Chronology Record' : activeQuestion.type === 'long_answer' ? 'Final Investigative POV' : activeQuestion.type === 'multiple_choice' ? 'Evidence Selection' : activeQuestion.type === 'single_choice' ? 'Case Decision' : 'Investigator Notes'}
      </div>

      {/* Render based on Question Type */}
      <div className="flex-grow overflow-y-auto space-y-6 pr-2 pb-20">
        {/* 1. SINGLE CHOICE */}
        {activeQuestion.type === 'single_choice' && (
          <div className="space-y-3">
            {questionOptions.map((opt) => {
              const isSelected = currentDraft.selected_options.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => handleOptionToggle(opt.id, true)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 p-4 rounded border text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-detective-crimson bg-detective-crimson/5 font-bold shadow-[inset_0_0_10px_rgba(139,0,0,0.05)]'
                      : 'border-black/10 hover:border-black/30 hover:bg-black/5'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle className="w-5 h-5 text-detective-crimson flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-black/20 flex-shrink-0" />
                  )}
                  <span className="text-sm">{opt.option_text}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 2. MULTIPLE CHOICE */}
        {activeQuestion.type === 'multiple_choice' && (
          <div className="space-y-3">
            {questionOptions.map((opt) => {
              const isSelected = currentDraft.selected_options.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => handleOptionToggle(opt.id, false)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 p-4 rounded border text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-detective-crimson bg-detective-crimson/5 font-bold shadow-[inset_0_0_10px_rgba(139,0,0,0.05)]'
                      : 'border-black/10 hover:border-black/30 hover:bg-black/5'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-detective-crimson flex-shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-black/20 flex-shrink-0" />
                  )}
                  <span className="text-sm">{opt.option_text}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3. EVIDENCE SELECTION (Styled as evidence markers/dossier logs) */}
        {activeQuestion.type === 'evidence_selection' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {questionOptions.map((opt) => {
              const isSelected = currentDraft.selected_options.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => handleOptionToggle(opt.id, false)}
                  disabled={disabled}
                  className={`relative flex flex-col p-4 rounded border text-left transition-all duration-200 ${
                    isSelected
                      ? 'border-detective-crimson bg-detective-crimson/5 shadow-[0_4px_12px_rgba(139,0,0,0.1)]'
                      : 'border-black/10 hover:border-black/30 bg-black/5 hover:bg-black/10'
                  }`}
                >
                  <div className="absolute top-2 right-2 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border border-black/20 text-black/40">
                    Marker
                  </div>
                  <span className="font-bold text-xs text-detective-crimson/70 mb-2">[TOKEN_ID: {opt.id.slice(0, 8).toUpperCase()}]</span>
                  <span className="text-sm font-bold text-detective-dark">{opt.option_text}</span>
                  <div className="mt-4 flex justify-end">
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                      isSelected ? 'border-detective-crimson text-detective-crimson' : 'border-black/20 text-black/40'
                    }`}>
                      {isSelected ? 'MARKED AS CLUE' : 'MARK CLUE'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 4. NUMBER */}
        {activeQuestion.type === 'number' && (
          <div className="max-w-xs space-y-2">
            <div className="flex items-center border-b border-black/30 focus-within:border-detective-crimson py-2 transition-colors">
              <Hash className="w-4 h-4 text-black/30 mr-2" />
              <input
                type="number"
                value={currentDraft.answer_text}
                onChange={handleTextChange}
                disabled={disabled}
                placeholder="Enter value"
                className="w-full bg-transparent border-none outline-none focus:ring-0 text-md font-bold"
              />
            </div>
            <span className="text-[10px] text-detective-muted">Only integer numerical input is accepted.</span>
          </div>
        )}

        {/* 5. TIME */}
        {activeQuestion.type === 'time' && (
          <div className="max-w-xs space-y-2">
            <div className="flex items-center border-b border-black/30 focus-within:border-detective-crimson py-2 transition-colors">
              <Clock className="w-4 h-4 text-black/30 mr-2" />
              <input
                type="text"
                value={currentDraft.answer_text}
                onChange={handleTextChange}
                disabled={disabled}
                placeholder="HH:MM:SS"
                className="w-full bg-transparent border-none outline-none focus:ring-0 text-md font-bold uppercase"
              />
            </div>
            <span className="text-[10px] text-detective-muted">Enter in 24h format matching the CCTV log header.</span>
          </div>
        )}

        {/* 6. SHORT ANSWER */}
        {activeQuestion.type === 'short_answer' && (
          <div className="space-y-2">
            <input
              type="text"
              value={currentDraft.answer_text}
              onChange={handleTextChange}
              disabled={disabled}
              placeholder="State motive, alibi, or suspect connection..."
              className="w-full dossier-input py-2 text-md"
            />
            <span className="text-[10px] text-detective-muted">Keep answer concise (typically under 100 characters).</span>
          </div>
        )}

        {/* 7. LONG ANSWER */}
        {activeQuestion.type === 'long_answer' && (
          <div className="space-y-2 h-full flex flex-col">
            <textarea
              value={currentDraft.answer_text}
              onChange={handleTextChange}
              disabled={disabled}
              rows={8}
              placeholder="Deduce case timeline discrepancies, alibi falsifications, or forensic findings. Detail your logical POV..."
              className="w-full flex-grow p-4 bg-black/5 border border-black/10 rounded focus:outline-none focus:border-detective-crimson focus:ring-1 focus:ring-detective-crimson text-sm leading-relaxed"
            />
            <span className="text-[10px] text-detective-muted">Be detailed. This response is graded manually against rubrics.</span>
          </div>
        )}
      </div>
    </div>
  );
}
