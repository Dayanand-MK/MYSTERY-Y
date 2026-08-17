import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Plus, HelpCircle, CheckSquare, ShieldCheck, Loader, Trash2, List, ShieldAlert, Tag } from 'lucide-react';

export default function QuestionBuilder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const caseId = searchParams.get('caseId');

  const [caseDetail, setCaseDetail] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Question Form state
  const [questionText, setQuestionText] = useState('');
  const [type, setType] = useState<'single_choice' | 'multiple_choice' | 'short_answer' | 'long_answer' | 'number' | 'time' | 'evidence_selection'>('single_choice');
  const [marks, setMarks] = useState(10);
  const [isRequired, setIsRequired] = useState(true);
  const [evaluationNotes, setEvaluationNotes] = useState('');
  const [conceptInput, setConceptInput] = useState('');
  const [expectedConcepts, setExpectedConcepts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // MCQ Options inputs
  const [optionTexts, setOptionTexts] = useState<string[]>(['', '']);
  const [correctOptionIdxs, setCorrectOptionIdxs] = useState<number[]>([0]);

  // Rubrics form states
  const [rubricCriterion, setRubricCriterion] = useState('');
  const [rubricDescription, setRubricDescription] = useState('');
  const [rubricMaxMarks, setRubricMaxMarks] = useState(5);
  const [activeQuestionForRubric, setActiveQuestionForRubric] = useState<any>(null);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [editOptions, setEditOptions] = useState<any[]>([]);

  const recalculateTotalMarks = async () => {
    const { data } = await supabase.from('questions').select('marks').eq('case_id', caseId);
    const total = (data || []).reduce((sum: number, q: any) => sum + Number(q.marks || 0), 0);
    await supabase.from('cases').update({ total_marks: total, updated_at: new Date().toISOString() }).eq('id', caseId);
  };

  useEffect(() => {
    if (!caseId) {
      navigate('/admin/cases');
      return;
    }
    loadData();
  }, [caseId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: cData } = await supabase.from('cases').select('*').eq('id', caseId).single();
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true });

      const { data: oData } = await supabase.from('question_options').select('*');
      const { data: rData } = await supabase.from('question_rubrics').select('*');

      if (cData) setCaseDetail(cData);
      if (qData) setQuestions(qData);
      if (oData) setOptions(oData);
      if (rData) setRubrics(rData);
    } catch (err) {
      console.error('Failed to load builder data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddConcept = () => {
    if (conceptInput.trim() && !expectedConcepts.includes(conceptInput.trim().toLowerCase())) {
      setExpectedConcepts([...expectedConcepts, conceptInput.trim().toLowerCase()]);
      setConceptInput('');
    }
  };

  const handleRemoveConcept = (concept: string) => {
    setExpectedConcepts(expectedConcepts.filter((c) => c !== concept));
  };

  const handleOptionTextChange = (idx: number, val: string) => {
    const next = [...optionTexts];
    next[idx] = val;
    setOptionTexts(next);
  };

  const handleCorrectOptionToggle = (idx: number) => {
    if (type === 'single_choice') {
      setCorrectOptionIdxs([idx]);
    } else {
      const existIdx = correctOptionIdxs.indexOf(idx);
      if (existIdx !== -1) {
        setCorrectOptionIdxs(correctOptionIdxs.filter((i) => i !== idx));
      } else {
        setCorrectOptionIdxs([...correctOptionIdxs, idx]);
      }
    }
  };

  const handleAddOptionField = () => {
    setOptionTexts([...optionTexts, '']);
  };

  const handleRemoveOptionField = (idx: number) => {
    if (optionTexts.length <= 2) return;
    const nextTexts = optionTexts.filter((_, i) => i !== idx);
    const nextCorrect = correctOptionIdxs
      .filter((i) => i !== idx)
      .map((i) => (i > idx ? i - 1 : i));

    setOptionTexts(nextTexts);
    setCorrectOptionIdxs(nextCorrect);
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    // MCQ validation
    const isMcq = ['single_choice', 'multiple_choice', 'evidence_selection'].includes(type);
    if (isMcq) {
      const activeTexts = optionTexts.filter((t) => t.trim().length > 0);
      if (activeTexts.length < 2) {
        setErrorMsg('PROVIDE AT LEAST TWO OPTIONS FOR THIS CHOICE TYPE');
        return;
      }
      if (correctOptionIdxs.length === 0) {
        setErrorMsg('SELECT AT LEAST ONE CORRECT ANSWER OPTION');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const sortOrder = questions.length + 1;

    try {
      // 1. Insert Question
      const { data: newQ, error: qErr } = await supabase
        .from('questions')
        .insert({
          case_id: caseId,
          question_text: questionText.trim(),
          type,
          marks: Number(marks),
          is_required: isRequired,
          sort_order: sortOrder,
          evaluation_notes: evaluationNotes.trim(),
          expected_concepts: expectedConcepts
        })
        .select()
        .single();

      if (qErr || !newQ) {
        setErrorMsg(qErr?.message || 'Question insertion failed');
        setIsSubmitting(false);
        return;
      }

      // 2. Insert Options if MCQ
      if (isMcq) {
        const optionsPayload = optionTexts
          .map((text, idx) => ({
            question_id: newQ.id,
            option_text: text.trim(),
            is_correct: correctOptionIdxs.includes(idx),
            sort_order: idx + 1
          }))
          .filter((o) => o.option_text.length > 0);

        await supabase.from('question_options').insert(optionsPayload);
      }

      // Clear states
      setQuestionText('');
      setEvaluationNotes('');
      setExpectedConcepts([]);
      setOptionTexts(['', '']);
      setCorrectOptionIdxs([0]);

      loadData();
      await recalculateTotalMarks();
    } catch (err: any) {
      setErrorMsg(err.message || 'Build transaction error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm('DELETE THIS INCIDENT INQUIRY? THIS REMOVES CORRESPONDING OPTIONS/ANSWERS.')) return;
    try {
      await supabase.from('questions').delete().eq('id', qId);
      await recalculateTotalMarks();
      loadData();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleAddRubric = async () => {
    if (!activeQuestionForRubric || !rubricCriterion.trim()) return;
    try {
      await supabase.from('question_rubrics').insert({
        question_id: activeQuestionForRubric.id,
        criterion: rubricCriterion.trim(),
        description: rubricDescription.trim(),
        max_marks: Number(rubricMaxMarks)
      });
      setRubricCriterion('');
      setRubricDescription('');
      loadData();
    } catch (err) {
      console.error('Failed to add rubric criteria', err);
    }
  };

  const handleDeleteRubric = async (rubId: string) => {
    try {
      await supabase.from('question_rubrics').delete().eq('id', rubId);
      loadData();
    } catch (err) {
      console.error('Delete rubric error', err);
    }
  };

  const getQuestionOptions = (qId: string) => {
    return options.filter((o) => o.question_id === qId);
  };

  const getQuestionRubrics = (qId: string) => {
    return rubrics.filter((r) => r.question_id === qId);
  };

  const openQuestionEditor = (question: any) => {
    setEditingQuestion({ ...question });
    setEditOptions(getQuestionOptions(question.id).map((option) => ({ ...option })));
  };

  const saveQuestionEditor = async () => {
    if (!editingQuestion?.question_text?.trim()) return;
    const isChoice = ['single_choice', 'multiple_choice', 'evidence_selection'].includes(editingQuestion.type);
    const usable = editOptions.filter((option) => option.option_text?.trim());
    if (isChoice && (usable.length < 2 || !usable.some((option) => option.is_correct))) {
      setErrorMsg('CHOICE QUESTIONS REQUIRE TWO OPTIONS AND AT LEAST ONE CORRECT ANSWER'); return;
    }
    const { error } = await supabase.from('questions').update({
      question_text: editingQuestion.question_text.trim(), type: editingQuestion.type, marks: Number(editingQuestion.marks),
      is_required: Boolean(editingQuestion.is_required), sort_order: Number(editingQuestion.sort_order),
      evaluation_notes: editingQuestion.evaluation_notes || '', expected_concepts: editingQuestion.expected_concepts || [],
    }).eq('id', editingQuestion.id);
    if (error) { setErrorMsg(error.message); return; }
    for (let index = 0; index < usable.length; index++) {
      const option = usable[index];
      const payload = { option_text: option.option_text.trim(), is_correct: Boolean(option.is_correct), sort_order: index + 1 };
      if (option.id) await supabase.from('question_options').update(payload).eq('id', option.id);
      else await supabase.from('question_options').insert({ ...payload, question_id: editingQuestion.id });
    }
    const retainedIds = usable.filter((option) => option.id).map((option) => option.id);
    const oldIds = getQuestionOptions(editingQuestion.id).map((option) => option.id).filter((id) => !retainedIds.includes(id));
    for (const id of oldIds) await supabase.from('question_options').delete().eq('id', id);
    await recalculateTotalMarks(); setEditingQuestion(null); loadData();
  };

  if (isLoading || !caseDetail) {
    return (
      <div className="h-full flex items-center justify-center font-mono text-xs text-detective-muted">
        <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
        LOADING CASE BUILDER ENVIRONMENT...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-xs">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-detective-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/cases')}
            className="p-1 border border-detective-border rounded hover:bg-black/20 text-detective-muted hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider text-white">Questionnaire Builder</h1>
            <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
              Incident Dossier: {caseDetail.case_number} — {caseDetail.title}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Creator Form */}
        <form onSubmit={handleSubmitQuestion} className="lg:col-span-5 bg-detective-panel border border-detective-border rounded p-6 space-y-4">
          <h3 className="text-xs font-bold uppercase border-b border-detective-border pb-2 text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-detective-crimson" /> Add Inquiry Question
          </h3>

          {errorMsg && (
            <div className="border border-detective-crimson/30 bg-detective-crimson/5 text-detective-alert p-2.5 rounded flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Question Text</label>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="e.g. State the primary vault breach timeline..."
              required
              rows={3}
              className="w-full bg-black/40 border border-detective-border rounded p-2.5 text-white focus:outline-none focus:border-detective-crimson text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Type</label>
              <select
                value={type}
                onChange={(e: any) => {
                  setType(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="single_choice">Single Choice</option>
                <option value="multiple_choice">Multiple Choice</option>
                <option value="evidence_selection">Evidence Tag Selection</option>
                <option value="short_answer">Short Text</option>
                <option value="long_answer">Long Reasoning POV</option>
                <option value="number">Number Val</option>
                <option value="time">Time Log HH:MM:SS</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Marks</label>
              <input
                type="number"
                value={marks}
                onChange={(e) => setMarks(Number(e.target.value))}
                min={1}
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Toggle Required */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isRequired"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded bg-black/45 border-detective-border text-detective-crimson focus:ring-0"
            />
            <label htmlFor="isRequired" className="text-[10px] text-white uppercase font-bold">
              Mark this inquiry as required
            </label>
          </div>

          {/* Render MCQ Option Builders */}
          {['single_choice', 'multiple_choice', 'evidence_selection'].includes(type) && (
            <div className="space-y-2 border-t border-detective-border/40 pt-3">
              <label className="block text-[10px] uppercase text-detective-muted font-bold flex justify-between">
                <span>Option Selections Builders</span>
                <span className="text-[8px] text-detective-amber font-normal">(Check mark the correct option)</span>
              </label>
              
              {optionTexts.map((optText, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={correctOptionIdxs.includes(idx)}
                    onChange={() => handleCorrectOptionToggle(idx)}
                    className="rounded bg-black/45 border-detective-border text-detective-crimson focus:ring-0"
                  />
                  <input
                    type="text"
                    value={optText}
                    onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-grow bg-black/40 border border-detective-border rounded p-1.5 text-white focus:outline-none text-xs"
                  />
                  {optionTexts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionField(idx)}
                      className="text-detective-muted hover:text-detective-alert"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddOptionField}
                className="text-[9px] uppercase tracking-wider font-bold text-detective-amber hover:text-white underline decoration-dotted mt-1.5"
              >
                + Add Option Field
              </button>
            </div>
          )}

          {/* Text/Manual notes rubrics builder */}
          {!['single_choice', 'multiple_choice', 'evidence_selection'].includes(type) && (
            <div className="space-y-3 border-t border-detective-border/40 pt-3">
              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Grading Evaluation Notes (Rubric)</label>
                <textarea
                  value={evaluationNotes}
                  onChange={(e) => setEvaluationNotes(e.target.value)}
                  placeholder="Expected points, alibi checks..."
                  rows={2}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
                />
              </div>

              {/* Tag concepts */}
              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold flex items-center gap-1">
                  <Tag className="w-3 h-3 text-detective-amber" /> Expected Keywords / Key Concepts
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={conceptInput}
                    onChange={(e) => setConceptInput(e.target.value)}
                    placeholder="e.g. clock offset"
                    className="flex-grow bg-black/40 border border-detective-border rounded p-1.5 text-white focus:outline-none text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddConcept}
                    className="bg-black/40 hover:bg-black/60 border border-detective-border px-3.5 rounded text-white"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {expectedConcepts.map((concept) => (
                    <span
                      key={concept}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/30 border border-detective-border text-[9px] text-white uppercase font-bold"
                    >
                      {concept}
                      <button
                        type="button"
                        onClick={() => handleRemoveConcept(concept)}
                        className="text-detective-crimson hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-detective-crimson hover:bg-detective-alert text-white py-2.5 rounded font-bold uppercase tracking-wider disabled:opacity-50 mt-4"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-3.5 h-3.5 animate-spin" /> Adding Inquiry...
              </>
            ) : (
              'Save Inquiry'
            )}
          </button>
        </form>

        {/* Right Side: Questions listing */}
        <div className="lg:col-span-7 bg-detective-panel border border-detective-border rounded p-6 h-[600px] flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
            <List className="w-3.5 h-3.5 text-detective-amber" /> Dossier Inquiry Checklist ({questions.length})
          </h3>

          <div className="flex-grow overflow-y-auto space-y-4 pr-2">
            {questions.length === 0 ? (
              <div className="h-full flex items-center justify-center text-detective-muted uppercase text-[10px]">
                No inquiry questions designed yet for this incident.
              </div>
            ) : (
              questions.map((q, index) => {
                const qOpts = getQuestionOptions(q.id);
                const qRubs = getQuestionRubrics(q.id);
                const isMcq = ['single_choice', 'multiple_choice', 'evidence_selection'].includes(q.type);

                return (
                  <div key={q.id} className="p-4 bg-black/25 rounded border border-detective-border/60 space-y-3 relative group">
                    
                    {/* Delete shortcut */}
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="absolute top-4 right-4 text-detective-muted hover:text-detective-alert opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => openQuestionEditor(q)} className="absolute top-4 right-11 text-detective-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      EDIT
                    </button>

                    {/* Question text */}
                    <div>
                      <div className="font-bold text-white flex justify-between pr-8">
                        <span>Q{index + 1}. {q.question_text}</span>
                        <span className="text-[10px] text-detective-crimson flex-shrink-0">({q.marks} Marks)</span>
                      </div>
                      <div className="text-[9px] text-detective-muted uppercase tracking-wider font-bold mt-1">
                        Type: {q.type.replace('_', ' ')}
                      </div>
                    </div>

                    {/* Option preview if MCQ */}
                    {isMcq && qOpts.length > 0 && (
                      <div className="bg-black/15 p-2.5 rounded border border-detective-border/40 space-y-1.5 text-[10px] text-detective-text">
                        {qOpts.map((o) => (
                          <div key={o.id} className="flex items-center gap-1.5">
                            {o.is_correct ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-detective-green flex-shrink-0" />
                            ) : (
                              <span className="w-1.5 h-1.5 bg-detective-border rounded-full flex-shrink-0 ml-1"></span>
                            )}
                            <span className={o.is_correct ? 'font-bold text-white' : ''}>{o.option_text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Manual concepts preview if text */}
                    {!isMcq && (
                      <div className="space-y-1.5 font-mono text-[9px] text-detective-muted">
                        {q.evaluation_notes && (
                          <div>
                            <span className="font-bold text-white uppercase block mb-0.5">Evaluation Rubric:</span>
                            <span className="italic leading-relaxed block bg-black/10 p-2 rounded">{q.evaluation_notes}</span>
                          </div>
                        )}
                        {q.expected_concepts && q.expected_concepts.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-1">
                            <span className="font-bold text-white uppercase mr-1">Expected Keywords:</span>
                            {q.expected_concepts.map((tag: string) => (
                              <span key={tag} className="px-1.5 py-0.5 rounded border border-detective-border bg-black/20 uppercase text-white font-bold">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Questions: Rubrics Criterion */}
                    {!isMcq && (
                      <div className="border-t border-detective-border/30 pt-2.5 space-y-2">
                        <div className="flex justify-between items-center text-[9px] font-bold uppercase text-white">
                          <span>Grade Rubrics ({qRubs.length})</span>
                          <button
                            onClick={() => setActiveQuestionForRubric(q)}
                            className="text-detective-amber hover:text-white underline decoration-dotted"
                          >
                            + Build Rubric Criteria
                          </button>
                        </div>

                        {qRubs.length > 0 && (
                          <div className="space-y-1.5">
                            {qRubs.map((rub) => (
                              <div key={rub.id} className="bg-black/15 p-2 rounded border border-detective-border/30 flex justify-between items-center text-[10px]">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-white uppercase">{rub.criterion}</span>
                                  <span className="text-detective-muted block text-[9px] leading-relaxed">{rub.description}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-detective-crimson">{rub.max_marks}M</span>
                                  <button
                                    onClick={() => handleDeleteRubric(rub.id)}
                                    className="text-detective-muted hover:text-detective-alert"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Rubric Builder Modal */}
      {activeQuestionForRubric && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs">
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
              Build Manual Grade Rubric Criterion
            </h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <span className="text-detective-muted uppercase block text-[10px]">Target Inquiry</span>
                <span className="font-bold text-white block uppercase max-h-12 overflow-y-auto">{activeQuestionForRubric.question_text}</span>
              </div>

              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Criterion Name</label>
                <input
                  type="text"
                  value={rubricCriterion}
                  onChange={(e) => setRubricCriterion(e.target.value)}
                  placeholder="e.g. Alibi timeline match"
                  required
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Description / Guideline</label>
                <textarea
                  value={rubricDescription}
                  onChange={(e) => setRubricDescription(e.target.value)}
                  placeholder="Explain rubric marks checks..."
                  rows={3}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">Max Marks</label>
                <input
                  type="number"
                  value={rubricMaxMarks}
                  onChange={(e) => setRubricMaxMarks(Number(e.target.value))}
                  min={1}
                  className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => setActiveQuestionForRubric(null)}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleAddRubric}
                disabled={!rubricCriterion.trim()}
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold disabled:opacity-50"
              >
                Add Criterion
              </button>
            </div>
          </div>
        </div>
      )}

      {editingQuestion && (
        <div className="fixed inset-0 bg-black/85 z-50 overflow-y-auto p-4 flex justify-center">
          <div className="my-auto max-w-2xl w-full bg-detective-panel border border-detective-crimson rounded p-6 font-mono text-xs space-y-4">
            <div className="flex justify-between border-b border-detective-border pb-3"><h3 className="font-bold text-white uppercase">Edit Inquiry Question</h3><button onClick={() => setEditingQuestion(null)}><Trash2 className="w-4 h-4 text-detective-muted" /></button></div>
            <textarea value={editingQuestion.question_text} onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })} rows={3} className="w-full bg-black/40 border border-detective-border rounded p-2 text-white" />
            <div className="grid grid-cols-2 gap-3">
              <select value={editingQuestion.type} onChange={(e) => setEditingQuestion({ ...editingQuestion, type: e.target.value })} className="bg-black/40 border border-detective-border rounded p-2 text-white">
                {['single_choice','multiple_choice','short_answer','long_answer','number','time','evidence_selection'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
              </select>
              <input type="number" value={editingQuestion.marks} onChange={(e) => setEditingQuestion({ ...editingQuestion, marks: Number(e.target.value) })} className="bg-black/40 border border-detective-border rounded p-2 text-white" />
            </div>
            <label className="flex gap-2 text-white"><input type="checkbox" checked={editingQuestion.is_required} onChange={(e) => setEditingQuestion({ ...editingQuestion, is_required: e.target.checked })} /> Required</label>
            {['single_choice','multiple_choice','evidence_selection'].includes(editingQuestion.type) && <div className="space-y-2 border-t border-detective-border pt-3"><b className="text-detective-amber uppercase">Options / Correct Answers</b>{editOptions.map((option, index) => <div key={option.id || index} className="flex gap-2"><input type="checkbox" checked={option.is_correct} onChange={(e) => setEditOptions(editOptions.map((item, i) => i === index ? { ...item, is_correct: e.target.checked } : item))} /><input value={option.option_text} onChange={(e) => setEditOptions(editOptions.map((item, i) => i === index ? { ...item, option_text: e.target.value } : item))} className="flex-1 bg-black/40 border border-detective-border rounded p-2 text-white"/><button onClick={() => setEditOptions(editOptions.filter((_, i) => i !== index))} className="text-detective-alert">DELETE</button></div>)}<button onClick={() => setEditOptions([...editOptions, { option_text: '', is_correct: false }])} className="text-detective-amber font-bold">+ ADD OPTION</button></div>}
            <div className="flex justify-end gap-3"><button onClick={() => setEditingQuestion(null)} className="px-3 py-2 border border-detective-border rounded text-detective-muted">Cancel</button><button onClick={saveQuestionEditor} className="px-3 py-2 bg-detective-crimson text-white rounded font-bold">Save Question</button></div>
          </div>
        </div>
      )}

    </div>
  );
}
