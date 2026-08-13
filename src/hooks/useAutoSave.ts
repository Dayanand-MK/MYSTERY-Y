import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface AnswerDraft {
  question_id: string;
  answer_text: string;
  selected_options: string[];
}

export function useAutoSave(
  teamId: string | null | undefined,
  initialDrafts: AnswerDraft[] = []
) {
  const [drafts, setDrafts] = useState<AnswerDraft[]>(initialDrafts);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<AnswerDraft[]>([]);

  // Load draft answers from DB or local storage on start
  useEffect(() => {
    if (!teamId) return;

    const savedLocal = localStorage.getItem(`mystery_y_drafts_${teamId}`);
    if (savedLocal) {
      setDrafts(JSON.parse(savedLocal));
      return;
    }

    async function fetchServerDrafts() {
      try {
        const { data, error } = await supabase
          .from('draft_answers')
          .select('question_id, answer_text, selected_options')
          .eq('team_id', teamId);

        if (!error && data && data.length > 0) {
          const loadedDrafts = data.map((d: any) => ({
            question_id: d.question_id,
            answer_text: d.answer_text || '',
            selected_options: d.selected_options || []
          }));
          setDrafts(loadedDrafts);
          localStorage.setItem(`mystery_y_drafts_${teamId}`, JSON.stringify(loadedDrafts));
        }
      } catch (err) {
        console.error('Failed to sync drafts from database', err);
      }
    }

    fetchServerDrafts();
  }, [teamId]);

  // Performs the actual network save operation (upserts to database atomically)
  const saveToServer = async (updatedDrafts: AnswerDraft[]) => {
    if (!teamId) return;
    setSyncStatus('saving');

    try {
      // Batch upsert — uses the unique constraint (team_id, question_id)
      // This replaces the old race-prone select→insert/update pattern
      const upsertRows = updatedDrafts.map((draft) => ({
        team_id: teamId,
        question_id: draft.question_id,
        answer_text: draft.answer_text,
        selected_options: draft.selected_options,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await (supabase as any)
        .from('draft_answers')
        .upsert(upsertRows, { onConflict: 'team_id,question_id' });

      if (error) {
        throw new Error(error.message);
      }

      setSyncStatus('saved');
      setSyncError(null);
    } catch (err: any) {
      console.error('AutoSave failed', err);
      setSyncStatus('error');
      setSyncError('Connection interrupted — retrying...');

      // Retry after 5 seconds
      setTimeout(() => {
        saveToServer(updatedDrafts);
      }, 5000);
    }
  };

  const updateAnswer = (questionId: string, answerText: string, selectedOptions: string[]) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.question_id === questionId);
      let nextDrafts = [...prev];

      const newDraft = { question_id: questionId, answer_text: answerText, selected_options: selectedOptions };

      if (idx !== -1) {
        nextDrafts[idx] = newDraft;
      } else {
        nextDrafts.push(newDraft);
      }

      // Update local cache
      if (teamId) {
        localStorage.setItem(`mystery_y_drafts_${teamId}`, JSON.stringify(nextDrafts));
      }

      // Add to pending updates queue
      pendingUpdatesRef.current = nextDrafts;

      // Debounce database write (1.5 seconds)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setSyncStatus('saving');
      debounceTimerRef.current = setTimeout(() => {
        saveToServer(pendingUpdatesRef.current);
      }, 1500);

      return nextDrafts;
    });
  };

  const getAnswer = (questionId: string) => {
    return drafts.find((d) => d.question_id === questionId) || { question_id: questionId, answer_text: '', selected_options: [] };
  };

  const clearLocalDrafts = () => {
    if (teamId) {
      localStorage.removeItem(`mystery_y_drafts_${teamId}`);
    }
    setDrafts([]);
  };

  return {
    drafts,
    updateAnswer,
    getAnswer,
    syncStatus,
    syncError,
    clearLocalDrafts
  };
}
