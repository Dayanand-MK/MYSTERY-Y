-- Read-only: run as project owner in Supabase SQL Editor.
-- Rows here bypass client RLS: compare answer_count with what the admin UI shows.
SELECT s.submission_id_label, s.id, s.team_id, s.score, s.is_finalized,
       (SELECT count(*) FROM public.answers a WHERE a.submission_id = s.id) AS answer_count,
       (SELECT count(*) FROM public.draft_answers d WHERE d.team_id = s.team_id) AS saved_draft_count,
       (SELECT count(*) FROM public.questions q WHERE q.case_id = s.case_id) AS question_count
FROM public.submissions s ORDER BY s.submitted_at DESC;

SELECT policyname, roles, cmd, qual FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('answers', 'submissions', 'questions');
