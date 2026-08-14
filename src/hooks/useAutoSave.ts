import { useState, useEffect, useRef, useCallback } from 'react';
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
  const isLoadedRef = useRef<boolean>(false);

  // Load authoritative draft answers from DB FIRST on mount
  const fetchAuthoritativeDrafts = useCallback(async () => {
    if (!teamId) return;

    try {
      // 1. Query Supabase for authoritative draft answers
      const { data, error } = await supabase
        .from('draft_answers')
        .select('question_id, answer_text, selected_options')
        .eq('team_id', teamId);

      let serverDrafts: AnswerDraft[] = [];
      if (!error && data && data.length > 0) {
        serverDrafts = data.map((d: any) => ({
          question_id: d.question_id,
          answer_text: d.answer_text || '',
          selected_options: d.selected_options || [],
        }));
      }

      // 2. Check local storage cache as backup merge
      const savedLocal = localStorage.getItem(`mystery_y_drafts_${teamId}`);
      let localDrafts: AnswerDraft[] = [];
      if (savedLocal) {
        try {
          localDrafts = JSON.parse(savedLocal);
        } catch (e) {
          // ignore
        }
      }

      // Merge: server drafts take precedence over local unless local has more recent keys
      const mergedMap = new Map<string, AnswerDraft>();
      serverDrafts.forEach((d) => mergedMap.set(d.question_id, d));
      localDrafts.forEach((d) => {
        if (!mergedMap.has(d.question_id)) {
          mergedMap.set(d.question_id, d);
        }
      });

      const finalDrafts = Array.from(mergedMap.values());
      setDrafts(finalDrafts);
      pendingUpdatesRef.current = finalDrafts;
      localStorage.setItem(`mystery_y_drafts_${teamId}`, JSON.stringify(finalDrafts));
      isLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to sync drafts from database', err);
    }
  }, [teamId]);

  useEffect(() => {
    fetchAuthoritativeDrafts();
  }, [fetchAuthoritativeDrafts]);

  // Performs the actual network save operation (upserts to database atomically)
  const saveToServer = async (updatedDrafts: AnswerDraft[]) => {
    if (!teamId || updatedDrafts.length === 0) return;
    setSyncStatus('saving');

    try {
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

      // Retry after 4 seconds
      setTimeout(() => {
        saveToServer(updatedDrafts);
      }, 4000);
    }
  };

  const updateAnswer = (
    questionId: string,
    answerText: string,
    selectedOptions: string[],
    isImmediateChoice: boolean = false
  ) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.question_id === questionId);
      let nextDrafts = [...prev];

      const newDraft: AnswerDraft = {
        question_id: questionId,
        answer_text: answerText,
        selected_options: selectedOptions,
      };

      if (idx !== -1) {
        nextDrafts[idx] = newDraft;
      } else {
        nextDrafts.push(newDraft);
      }

      // Update local cache immediately
      if (teamId) {
        localStorage.setItem(`mystery_y_drafts_${teamId}`, JSON.stringify(nextDrafts));
      }

      pendingUpdatesRef.current = nextDrafts;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (isImmediateChoice) {
        // Save immediately for option selections
        saveToServer(nextDrafts);
      } else {
        // Debounce text inputs (600ms)
        setSyncStatus('saving');
        debounceTimerRef.current = setTimeout(() => {
          saveToServer(pendingUpdatesRef.current);
        }, 600);
      }

      return nextDrafts;
    });
  };

  const getAnswer = (questionId: string) => {
    return (
      drafts.find((d) => d.question_id === questionId) || {
        question_id: questionId,
        answer_text: '',
        selected_options: [],
      }
    );
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
    clearLocalDrafts,
    refetchDrafts: fetchAuthoritativeDrafts,
  };
}
