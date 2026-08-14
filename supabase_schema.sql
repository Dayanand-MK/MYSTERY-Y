-- =========================================================================
-- MYSTERY Y — Complete Database Schema
-- Version: 2.0 (Supabase Production Ready)
-- Execute this entire script in the Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. TABLE DEFINITIONS
-- =========================================================================

-- Profiles / Admin Roles
-- NOTE: profile rows are created AFTER the Supabase Auth user exists.
--       The 'id' must match auth.users.id exactly.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'evaluator', 'coordinator')),
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enforce exactly one Super Admin: only the permanent email may hold super_admin role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'check_only_one_super_admin'
          AND table_name = 'profiles'
    ) THEN
        ALTER TABLE public.profiles ADD CONSTRAINT check_only_one_super_admin CHECK (
            (role = 'super_admin' AND email = 'vh13155_ml23@velhightech.com') OR (role != 'super_admin')
        );
    END IF;
END $$;

-- Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paused', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cases Table
CREATE TABLE IF NOT EXISTS public.cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    case_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    video_path TEXT,                          -- Legacy field kept for compatibility
    briefing_media_type TEXT NOT NULL DEFAULT 'none' CHECK (briefing_media_type IN ('none', 'video', 'audio')),
    briefing_media_url TEXT,
    briefing_title TEXT DEFAULT 'Case Briefing',
    briefing_text TEXT,
    duration_limit INTEGER NOT NULL DEFAULT 60,   -- In minutes
    total_marks INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Case Access Codes Table
CREATE TABLE IF NOT EXISTS public.case_access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    team_id UUID,                              -- Populated when assigned to a team
    assigned_at TIMESTAMP WITH TIME ZONE,
    used_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'used', 'disabled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    team_id_label TEXT NOT NULL UNIQUE,        -- e.g. 'TEAM-001'
    name TEXT NOT NULL,
    case_id UUID NOT NULL REFERENCES public.cases(id),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'submitted', 'flagged', 'disqualified')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_team_name_per_event UNIQUE (event_id, name)
);

-- Add FK from case_access_codes -> teams (circular; handled safely)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_case_access_codes_teams'
          AND table_name = 'case_access_codes'
    ) THEN
        ALTER TABLE public.case_access_codes
            ADD CONSTRAINT fk_case_access_codes_teams
            FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Team Members
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('member_1', 'member_2', 'member_3')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Investigation Sessions
CREATE TABLE IF NOT EXISTS public.investigation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    access_code_id UUID NOT NULL REFERENCES public.case_access_codes(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'terminated', 'flagged')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_active_session_per_team UNIQUE (team_id, case_id)
);

-- Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id_label TEXT NOT NULL UNIQUE,  -- e.g. 'SUB-014827'
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    duration INTEGER NOT NULL,                 -- In seconds, computed server-side
    score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    graded_by UUID REFERENCES public.profiles(id),
    grading_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_submission_per_team_case UNIQUE (team_id, case_id)
);

-- Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('single_choice', 'multiple_choice', 'short_answer', 'long_answer', 'number', 'time', 'evidence_selection')),
    marks INTEGER NOT NULL DEFAULT 10,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    evaluation_notes TEXT,     -- Admin-only grading guide; NEVER exposed to participants
    expected_concepts TEXT[],  -- Admin-only AI rubric concepts; NEVER exposed to participants
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Question Options Table
CREATE TABLE IF NOT EXISTS public.question_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,  -- CRITICAL: application must NEVER expose this to participants
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Question Rubrics Table
CREATE TABLE IF NOT EXISTS public.question_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    criterion TEXT NOT NULL,
    description TEXT,
    max_marks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Answers Table (final submitted answers)
CREATE TABLE IF NOT EXISTS public.answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id),
    answer_text TEXT,
    selected_options UUID[],                   -- Array of option UUIDs for choice questions
    score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ai_score NUMERIC(5,2),                     -- AI provisional score
    ai_reasoning TEXT,                         -- AI explanation (admin only)
    matched_concepts TEXT[],                   -- Concepts matched by AI (admin only)
    ai_confidence NUMERIC(3,2),                -- 0.00-1.00
    review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'override')),
    grader_notes TEXT,
    is_graded BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_answer_per_question UNIQUE (submission_id, question_id)
);

-- Draft Answers (Auto-saves during active investigation)
CREATE TABLE IF NOT EXISTS public.draft_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    selected_options UUID[],
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_draft_per_team_question UNIQUE (team_id, question_id)
);

-- Security Logs
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_event_id UUID UNIQUE,
    team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.investigation_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    admin_action TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disciplinary Actions Audit
CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.investigation_sessions(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('warning', 'flag', 'disqualification', 'override_unlock')),
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin Activity Logs
CREATE TABLE IF NOT EXISTS public.admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event Settings (key-value pairs)
CREATE TABLE IF NOT EXISTS public.event_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Immutable Official Result Snapshots
CREATE TABLE IF NOT EXISTS public.result_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    finalized_by UUID NOT NULL REFERENCES public.profiles(id),
    finalized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    snapshot_data JSONB NOT NULL DEFAULT '{}'::JSONB
);


-- =========================================================================
-- 2. INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_teams_event ON public.teams(event_id);
CREATE INDEX IF NOT EXISTS idx_cases_event ON public.cases(event_id);
CREATE INDEX IF NOT EXISTS idx_questions_case ON public.questions(case_id);
CREATE INDEX IF NOT EXISTS idx_options_question ON public.question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON public.case_access_codes(code);
CREATE INDEX IF NOT EXISTS idx_submissions_team ON public.submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_answers_submission ON public.answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_team ON public.security_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_session ON public.security_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_draft_answers_team ON public.draft_answers(team_id);


-- =========================================================================
-- 3. SECURE HELPER FUNCTIONS
-- =========================================================================

-- is_admin: Returns TRUE if user has any admin role and is active
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id
          AND role IN ('super_admin', 'evaluator', 'coordinator')
          AND status = 'active'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

-- is_super_admin: Returns TRUE only for the permanent Super Admin account
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id
          AND id = '13d593a7-1f40-4583-9979-9d9db465c320'::UUID
          AND email = 'vh13155_ml23@velhightech.com'
          AND role = 'super_admin'
          AND status = 'active'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO service_role;


-- =========================================================================
-- 4. SECURE TRANSACTION RPC FUNCTIONS
-- =========================================================================

-- RPC 1: REGISTER TEAM TRANSACTION
CREATE OR REPLACE FUNCTION public.register_team_transaction(
    p_event_id UUID,
    p_name TEXT,
    p_member_names TEXT[],
    p_access_code TEXT
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_case_id UUID;
    v_code_id UUID;
    v_code_status TEXT;
    v_team_id UUID;
    v_next_val INTEGER;
    v_team_label TEXT;
    v_member_name TEXT;
    v_member_idx INTEGER := 1;
    v_normalized_name TEXT;
BEGIN
    -- Normalize team name for duplicate check
    v_normalized_name := LOWER(TRIM(REGEXP_REPLACE(p_name, '\s+', ' ', 'g')));

    -- 1. Validate team name uniqueness (normalized, case-insensitive)
    IF EXISTS (
        SELECT 1 FROM public.teams
        WHERE event_id = p_event_id
          AND LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) = v_normalized_name
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'TEAM NAME ALREADY REGISTERED');
    END IF;

    -- 2. Validate team size (2-3 members)
    IF array_length(p_member_names, 1) < 2 OR array_length(p_member_names, 1) > 3 THEN
        RETURN jsonb_build_object('success', false, 'error', 'TEAM SIZE MUST BE 2 OR 3 MEMBERS');
    END IF;

    -- 3. Validate access code
    SELECT id, case_id, status
    INTO v_code_id, v_case_id, v_code_status
    FROM public.case_access_codes
    WHERE code = UPPER(TRIM(p_access_code));

    IF v_code_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CASE NOT FOUND: INVALID ACCESS CODE');
    END IF;

    IF v_code_status != 'available' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACCESS CODE ALREADY ASSIGNED OR USED');
    END IF;

    -- 4. Generate unique TEAM label (e.g. TEAM-001)
    SELECT COALESCE(MAX(CAST(SUBSTRING(team_id_label FROM '\d+') AS INTEGER)), 0) + 1
    INTO v_next_val
    FROM public.teams;
    v_team_label := 'TEAM-' || LPAD(v_next_val::TEXT, 3, '0');

    -- 5. Insert Team
    INSERT INTO public.teams (event_id, team_id_label, name, case_id, status)
    VALUES (p_event_id, v_team_label, TRIM(p_name), v_case_id, 'registered')
    RETURNING id INTO v_team_id;

    -- 6. Insert Team Members
    FOREACH v_member_name IN ARRAY p_member_names LOOP
        IF TRIM(v_member_name) != '' THEN
            INSERT INTO public.team_members (team_id, name, role)
            VALUES (v_team_id, TRIM(v_member_name), ('member_' || v_member_idx)::TEXT);
            v_member_idx := v_member_idx + 1;
        END IF;
    END LOOP;

    -- 7. Assign and lock access code
    UPDATE public.case_access_codes
    SET team_id = v_team_id, assigned_at = NOW(), status = 'assigned'
    WHERE id = v_code_id;

    RETURN jsonb_build_object(
        'success', true,
        'team_id', v_team_id,
        'team_id_label', v_team_label,
        'case_id', v_case_id,
        'access_code_id', v_code_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_team_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_team_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.register_team_transaction TO authenticated;


-- RPC 2: BEGIN INVESTIGATION TRANSACTION
CREATE OR REPLACE FUNCTION public.begin_investigation_transaction(
    p_team_id UUID,
    p_case_id UUID,
    p_code_id UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_id UUID;
    v_started_at TIMESTAMP WITH TIME ZONE;
    v_status TEXT;
BEGIN
    -- Check if session already exists (recovery check)
    SELECT id, started_at, status
    INTO v_session_id, v_started_at, v_status
    FROM public.investigation_sessions
    WHERE team_id = p_team_id AND case_id = p_case_id;

    IF v_session_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'session_id', v_session_id,
            'started_at', v_started_at,
            'status', v_status,
            'recovered', true
        );
    END IF;

    -- Verify access code belongs to this team and is assigned
    IF NOT EXISTS (
        SELECT 1 FROM public.case_access_codes
        WHERE id = p_code_id AND team_id = p_team_id AND status = 'assigned'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID OR ALREADY USED ACCESS CODE');
    END IF;

    -- Mark code as used
    UPDATE public.case_access_codes SET status = 'used', used_at = NOW() WHERE id = p_code_id;

    -- Set team active
    UPDATE public.teams SET status = 'active' WHERE id = p_team_id;

    -- Create session with authoritative server timestamp
    INSERT INTO public.investigation_sessions (team_id, case_id, access_code_id, started_at, status)
    VALUES (p_team_id, p_case_id, p_code_id, NOW(), 'active')
    RETURNING id, started_at, status INTO v_session_id, v_started_at, v_status;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'started_at', v_started_at,
        'status', v_status,
        'recovered', false
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_investigation_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_investigation_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.begin_investigation_transaction TO authenticated;


-- RPC 3: SUBMIT INVESTIGATION TRANSACTION
CREATE OR REPLACE FUNCTION public.submit_investigation_transaction(
    p_session_id UUID,
    p_client_answers JSONB  -- Array: [{question_id, answer_text, selected_options:[]}]
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_team_id UUID;
    v_case_id UUID;
    v_started_at TIMESTAMP WITH TIME ZONE;
    v_ended_at TIMESTAMP WITH TIME ZONE := NOW();
    v_duration INTEGER;
    v_submission_id UUID;
    v_next_val INTEGER;
    v_submission_label TEXT;
    v_status TEXT;
    v_item JSONB;
    v_auto_score NUMERIC(5,2);
    v_total_auto_score NUMERIC(5,2) := 0.00;
    v_q_type TEXT;
    v_q_marks INTEGER;
BEGIN
    -- 1. Fetch and lock session
    SELECT team_id, case_id, started_at, status
    INTO v_team_id, v_case_id, v_started_at, v_status
    FROM public.investigation_sessions
    WHERE id = p_session_id
    FOR UPDATE;

    IF v_team_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVESTIGATION SESSION UNAVAILABLE');
    END IF;

    IF v_status = 'submitted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'SUBMISSION ALREADY FINALIZED');
    END IF;

    -- 2. Calculate server-side duration
    v_duration := EXTRACT(EPOCH FROM (v_ended_at - v_started_at))::INTEGER;

    -- 3. Generate submission label
    SELECT COALESCE(MAX(CAST(SUBSTRING(submission_id_label FROM '\d+') AS INTEGER)), 100000) + 1
    INTO v_next_val
    FROM public.submissions;
    v_submission_label := 'SUB-' || v_next_val::TEXT;

    -- 4. Create submission record
    INSERT INTO public.submissions (
        submission_id_label, team_id, case_id, started_at, submitted_at, duration, score, is_finalized
    )
    VALUES (
        v_submission_label, v_team_id, v_case_id, v_started_at, v_ended_at, v_duration, 0.00, false
    )
    RETURNING id INTO v_submission_id;

    -- 5. Process each answer with server-side auto-scoring
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_client_answers) LOOP
        v_auto_score := 0.00;

        SELECT type, marks INTO v_q_type, v_q_marks
        FROM public.questions
        WHERE id = (v_item->>'question_id')::UUID;

        IF v_q_type = 'single_choice' THEN
            IF EXISTS (
                SELECT 1 FROM public.question_options
                WHERE id = (v_item->'selected_options'->>0)::UUID
                  AND question_id = (v_item->>'question_id')::UUID
                  AND is_correct = TRUE
            ) THEN
                v_auto_score := v_q_marks::NUMERIC;
            END IF;

        ELSIF v_q_type IN ('multiple_choice', 'evidence_selection') THEN
            SELECT
                CASE
                    WHEN COUNT(CASE WHEN is_correct = TRUE THEN 1 END)
                         = COUNT(CASE WHEN id = ANY(
                             SELECT val::UUID FROM jsonb_array_elements_text(v_item->'selected_options') AS val
                         ) AND is_correct = TRUE THEN 1 END)
                     AND COUNT(CASE WHEN id = ANY(
                             SELECT val::UUID FROM jsonb_array_elements_text(v_item->'selected_options') AS val
                         ) AND is_correct = FALSE THEN 1 END) = 0
                    THEN v_q_marks::NUMERIC
                    ELSE 0.00
                END
            INTO v_auto_score
            FROM public.question_options
            WHERE question_id = (v_item->>'question_id')::UUID;
        END IF;

        v_total_auto_score := v_total_auto_score + COALESCE(v_auto_score, 0.00);

        INSERT INTO public.answers (
            submission_id, question_id, answer_text, selected_options, score, is_graded
        )
        VALUES (
            v_submission_id,
            (v_item->>'question_id')::UUID,
            v_item->>'answer_text',
            (SELECT ARRAY_AGG(val::UUID) FROM jsonb_array_elements_text(v_item->'selected_options') AS val),
            COALESCE(v_auto_score, 0.00),
            CASE
                WHEN v_q_type IN ('single_choice', 'multiple_choice', 'evidence_selection') THEN TRUE
                ELSE FALSE
            END
        );
    END LOOP;

    -- 6. Update submission total score
    UPDATE public.submissions SET score = v_total_auto_score WHERE id = v_submission_id;

    -- 7. Close session
    UPDATE public.investigation_sessions
    SET status = 'submitted', ended_at = v_ended_at
    WHERE id = p_session_id;

    -- 8. Update team status
    UPDATE public.teams SET status = 'submitted' WHERE id = v_team_id;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', v_submission_id,
        'submission_id_label', v_submission_label,
        'duration', v_duration,
        'submitted_at', v_ended_at,
        'auto_score', v_total_auto_score
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_investigation_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_investigation_transaction TO anon;
GRANT EXECUTE ON FUNCTION public.submit_investigation_transaction TO authenticated;


-- RPC 4: FINALIZE RESULTS SNAPSHOT
CREATE OR REPLACE FUNCTION public.finalize_results_transaction(
    p_event_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_snapshot_data JSONB;
    v_team_count INTEGER;
BEGIN
    -- Verify requester is Super Admin
    IF NOT public.is_super_admin(p_admin_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: SUPER ADMIN PRIVILEGES REQUIRED');
    END IF;

    -- Build ranking snapshot with tie-breaker rules
    SELECT jsonb_agg(row_to_json(t_rank))
    INTO v_snapshot_data
    FROM (
        SELECT
            RANK() OVER (
                ORDER BY
                    sub.score DESC,
                    (
                        SELECT COALESCE(SUM(a.score), 0)
                        FROM public.answers a
                        JOIN public.questions q ON a.question_id = q.id
                        WHERE a.submission_id = sub.id
                          AND q.type IN ('evidence_selection', 'long_answer')
                    ) DESC,
                    sub.duration ASC,
                    sub.submitted_at ASC
            ) AS rank,
            teams.team_id_label,
            teams.name AS team_name,
            sub.id AS submission_id,
            sub.submission_id_label,
            sub.score AS total_score,
            sub.duration AS duration_seconds,
            sub.submitted_at
        FROM public.submissions sub
        JOIN public.teams teams ON sub.team_id = teams.id
        WHERE teams.event_id = p_event_id
          AND teams.status != 'disqualified'
    ) t_rank;

    v_team_count := COALESCE(jsonb_array_length(v_snapshot_data), 0);

    INSERT INTO public.result_snapshots (event_id, finalized_by, snapshot_data)
    VALUES (p_event_id, p_admin_id, COALESCE(v_snapshot_data, '[]'::JSONB));

    UPDATE public.events SET status = 'closed' WHERE id = p_event_id;

    INSERT INTO public.admin_actions (admin_id, action_type, details)
    VALUES (p_admin_id, 'finalize_results',
            jsonb_build_object('event_id', p_event_id, 'team_count', v_team_count));

    RETURN jsonb_build_object('success', true, 'team_count', v_team_count);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_results_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_results_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_results_transaction TO service_role;


-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies before recreating (makes script idempotent)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- ---- PROFILES ----
CREATE POLICY admin_read_all_profiles ON public.profiles
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY user_read_own_profile ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY super_admin_write_profiles ON public.profiles
    FOR ALL USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY service_role_all_profiles ON public.profiles
    FOR ALL USING (auth.role() = 'service_role');

-- ---- EVENTS ----
CREATE POLICY anon_read_open_events ON public.events
    FOR SELECT USING (status = 'open');

CREATE POLICY admin_all_events ON public.events
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- CASES ----
CREATE POLICY anon_read_active_cases ON public.cases
    FOR SELECT USING (status = 'active');

CREATE POLICY admin_all_cases ON public.cases
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- CASE ACCESS CODES ----
CREATE POLICY anon_read_available_codes ON public.case_access_codes
    FOR SELECT USING (status IN ('available', 'assigned'));

CREATE POLICY admin_all_codes ON public.case_access_codes
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- TEAMS ----
CREATE POLICY admin_all_teams ON public.teams
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- TEAM MEMBERS ----
CREATE POLICY admin_all_team_members ON public.team_members
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- INVESTIGATION SESSIONS ----
CREATE POLICY admin_all_sessions ON public.investigation_sessions
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- QUESTIONS ----
CREATE POLICY anon_read_questions ON public.questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.cases c
            WHERE c.id = questions.case_id AND c.status = 'active'
        )
    );

CREATE POLICY admin_all_questions ON public.questions
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- QUESTION OPTIONS ----
-- Participants can read option text/id/sort_order, but the application must
-- NEVER select is_correct when serving participants.
CREATE POLICY anon_read_options ON public.question_options
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            JOIN public.cases c ON q.case_id = c.id
            WHERE q.id = question_options.question_id AND c.status = 'active'
        )
    );

CREATE POLICY admin_all_options ON public.question_options
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- QUESTION RUBRICS (admin only) ----
CREATE POLICY admin_all_rubrics ON public.question_rubrics
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- SUBMISSIONS ----
CREATE POLICY admin_all_submissions ON public.submissions
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- ANSWERS ----
CREATE POLICY admin_all_answers ON public.answers
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- DRAFT ANSWERS ----
-- Open to anon (participants are not Supabase Auth users)
CREATE POLICY anon_all_drafts ON public.draft_answers
    FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY admin_read_all_drafts ON public.draft_answers
    FOR SELECT USING (public.is_admin(auth.uid()));

-- ---- SECURITY LOGS ----
CREATE POLICY anon_insert_security_log ON public.security_logs
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY admin_all_logs ON public.security_logs
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- DISCIPLINARY ACTIONS ----
CREATE POLICY admin_all_disciplinary ON public.disciplinary_actions
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- ADMIN ACTIONS ----
CREATE POLICY admin_all_actions ON public.admin_actions
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- EVENT SETTINGS ----
CREATE POLICY public_read_settings ON public.event_settings
    FOR SELECT USING (TRUE);

CREATE POLICY admin_all_settings ON public.event_settings
    FOR ALL USING (public.is_admin(auth.uid()));

-- ---- RESULT SNAPSHOTS ----
CREATE POLICY admin_all_snapshots ON public.result_snapshots
    FOR ALL USING (public.is_admin(auth.uid()));


-- =========================================================================
-- 6. SEED DATA
-- =========================================================================
-- IMPORTANT: The Super Admin Auth user MUST be created first in Supabase
-- Dashboard (Authentication > Users > Invite/Add User) with:
--   Email: vh13155_ml23@velhightech.com
--   UUID:  13d593a7-1f40-4583-9979-9d9db465c320
--
-- Then run this INSERT to register the profile row.

-- Super Admin Profile
INSERT INTO public.profiles (id, email, role, name, status)
VALUES (
    '13d593a7-1f40-4583-9979-9d9db465c320',
    'vh13155_ml23@velhightech.com',
    'super_admin',
    'Super Administrator',
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    email = 'vh13155_ml23@velhightech.com',
    status = 'active';

-- Default Symposium Event (fixed valid UUID)
INSERT INTO public.events (id, name, year, status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Mystery Y Symposium 2026',
    2026,
    'open'
)
ON CONFLICT (id) DO NOTHING;

-- Default Demo Case (fixed valid UUID)
INSERT INTO public.cases (
    id, event_id, case_number, title, description,
    briefing_media_type, briefing_title, briefing_text,
    duration_limit, total_marks, status
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'CASE-001',
    'The Silent Alibi',
    'A corporate CFO was found missing. Only a mysterious video feed and physical logs remain. Crack the code and solve the mystery.',
    'none',
    'Case Briefing — The Silent Alibi',
    E'Welcome, Investigation Team.\n\nYou have been assigned Case File #001 for independent investigation.\n\nReview the physical case file carefully. Examine all statements, records, evidence, and the timeline.\n\nYour task is not simply to identify a suspect. Reconstruct what you believe happened and support your conclusion using evidence from the case file.\n\nDiscuss your findings with your team before submitting your final investigation.\n\nYour investigation begins now.',
    60,
    100,
    'active'
)
ON CONFLICT (id) DO NOTHING;

-- Available Access Codes for Demo Case
INSERT INTO public.case_access_codes (case_id, code, status)
VALUES
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-ALPHA-12', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-BRAVO-34', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-CHARLIE-56', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-DELTA-78', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-ECHO-90', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-FOXTROT-11', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-GOLF-22', 'available'),
    ('00000000-0000-0000-0000-000000000002', 'MYSTERY-HOTEL-33', 'available')
ON CONFLICT (code) DO NOTHING;

-- Default Event Settings
INSERT INTO public.event_settings (key, value)
VALUES
    ('event_status', 'OPEN'),
    ('max_team_size', '3'),
    ('violation_threshold', '3'),
    ('leaderboard_published', 'false'),
    ('ai_evaluation_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- 1. TABLES DEFINITIONS
-- =========================================================================

-- Profiles / Admin Roles
create table if not exists public.profiles (
    id uuid primary key references auth.users on delete cascade,
    email text not null,
    role text not null check (role in ('super_admin', 'evaluator', 'coordinator')),
    name text,
    status text not null default 'active' check (status in ('active', 'disabled')),
    last_login timestamp with time zone,
    created_at timestamp with time zone default now()
);

-- Enforce exactly one Super Admin rule at database level
alter table public.profiles add constraint check_only_one_super_admin check (
    (role = 'super_admin' and email = 'vh13155_ml23@velhightech.com') or (role != 'super_admin')
);

-- Events Table
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    year integer not null,
    status text not null default 'draft' check (status in ('draft', 'open', 'paused', 'closed')),
    created_at timestamp with time zone default now()
);

-- Cases Table
create table if not exists public.cases (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    case_number text not null unique,
    title text not null,
    description text,
    video_path text, -- Path in Supabase storage bucket (CCTV fallback)
    briefing_media_type text not null default 'none' check (briefing_media_type in ('none', 'video', 'audio')),
    briefing_media_url text,
    briefing_title text default 'Case Briefing',
    briefing_text text,
    duration_limit integer not null default 60, -- In minutes
    total_marks integer not null default 100,
    status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Case Access Codes Table
create table if not exists public.case_access_codes (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.cases(id) on delete cascade,
    code text not null unique,
    team_id uuid, -- Associated team (nullable, unique when assigned)
    assigned_at timestamp with time zone,
    used_at timestamp with time zone,
    status text not null default 'available' check (status in ('available', 'assigned', 'used', 'disabled')),
    created_at timestamp with time zone default now()
);

-- Teams Table
create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    team_id_label text not null unique, -- E.g. 'TEAM-001'
    name text not null,
    case_id uuid not null references public.cases(id),
    status text not null default 'registered' check (status in ('registered', 'active', 'submitted', 'flagged', 'disqualified')),
    created_at timestamp with time zone default now(),
    constraint unique_team_name_per_event unique (event_id, name)
);

-- Add foreign key constraint to case_access_codes for team_id (circular check handled by transaction)
alter table public.case_access_codes 
    add constraint fk_case_access_codes_teams 
    foreign key (team_id) references public.teams(id) on delete set null;

-- Team Members
create table if not exists public.team_members (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id) on delete cascade,
    name text not null,
    role text not null check (role in ('member_1', 'member_2', 'member_3')),
    created_at timestamp with time zone default now()
);

-- Investigation Sessions
create table if not exists public.investigation_sessions (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id) on delete cascade,
    case_id uuid not null references public.cases(id) on delete cascade,
    access_code_id uuid not null references public.case_access_codes(id),
    started_at timestamp with time zone not null default now(),
    last_seen_at timestamp with time zone not null default now(),
    ended_at timestamp with time zone,
    status text not null default 'active' check (status in ('active', 'submitted', 'terminated', 'flagged')),
    created_at timestamp with time zone default now(),
    constraint unique_active_session_per_team unique (team_id, case_id) -- Only one session per team/case
);

-- Submissions Table
create table if not exists public.submissions (
    id uuid primary key default gen_random_uuid(),
    submission_id_label text not null unique, -- E.g., 'SUB-014827'
    team_id uuid not null references public.teams(id) on delete cascade,
    case_id uuid not null references public.cases(id),
    started_at timestamp with time zone not null,
    submitted_at timestamp with time zone not null default now(),
    duration integer not null, -- In seconds, computed server side
    score numeric(5,2) not null default 0.00,
    is_finalized boolean not null default false,
    graded_by uuid references public.profiles(id),
    grading_notes text,
    created_at timestamp with time zone default now(),
    constraint unique_submission_per_team_case unique (team_id, case_id)
);

-- Questions Table
create table if not exists public.questions (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.cases(id) on delete cascade,
    question_text text not null,
    type text not null check (type in ('single_choice', 'multiple_choice', 'short_answer', 'long_answer', 'number', 'time', 'evidence_selection')),
    marks integer not null default 10,
    is_required boolean not null default true,
    sort_order integer not null default 0,
    evaluation_notes text,
    expected_concepts text[],
    created_at timestamp with time zone default now()
);

-- Question Options Table
create table if not exists public.question_options (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    option_text text not null,
    is_correct boolean not null default false, -- Crucial: RLS hide this
    sort_order integer not null default 0
);

-- Question Rubrics Table
create table if not exists public.question_rubrics (
    id uuid primary key default gen_random_uuid(),
    question_id uuid not null references public.questions(id) on delete cascade,
    criterion text not null,
    description text,
    max_marks integer not null default 0,
    created_at timestamp with time zone default now()
);

-- Answers Table
create table if not exists public.answers (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references public.submissions(id) on delete cascade,
    question_id uuid not null references public.questions(id),
    answer_text text,
    selected_options uuid[], -- Array of option UUIDs for MCQs
    score numeric(5,2) not null default 0.00,
    grader_notes text,
    is_graded boolean not null default false,
    updated_at timestamp with time zone default now(),
    constraint unique_answer_per_question unique (submission_id, question_id)
);

-- Draft Answers (Auto-saves drafts during active investigation)
create table if not exists public.draft_answers (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id) on delete cascade,
    question_id uuid not null references public.questions(id) on delete cascade,
    answer_text text,
    selected_options uuid[],
    updated_at timestamp with time zone default now(),
    constraint unique_draft_per_team_question unique (team_id, question_id)
);

-- Security Logs
create table if not exists public.security_logs (
    id uuid primary key default gen_random_uuid(),
    team_id uuid references public.teams(id) on delete cascade,
    session_id uuid references public.investigation_sessions(id) on delete cascade,
    event_type text not null,
    details jsonb not null default '{}'::jsonb,
    severity text not null check (severity in ('low', 'medium', 'high')),
    is_reviewed boolean not null default false,
    admin_action text,
    created_at timestamp with time zone default now()
);

-- Disciplinary Actions Audit
create table if not exists public.disciplinary_actions (
    id uuid primary key default gen_random_uuid(),
    team_id uuid not null references public.teams(id) on delete cascade,
    session_id uuid references public.investigation_sessions(id) on delete set null,
    action text not null check (action in ('warning', 'flag', 'disqualification')),
    reason text not null,
    created_by uuid not null references public.profiles(id),
    created_at timestamp with time zone default now()
);

-- Admin Activity Logs
create table if not exists public.admin_actions (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references public.profiles(id) on delete cascade,
    action_type text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone default now()
);

-- Event settings key-value pair
create table if not exists public.event_settings (
    key text primary key,
    value text not null,
    updated_at timestamp with time zone default now()
);

-- Immutable official snapshots
create table if not exists public.result_snapshots (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    finalized_by uuid not null references public.profiles(id),
    finalized_at timestamp with time zone not null default now(),
    snapshot_data jsonb not null default '{}'::jsonb
);

-- =========================================================================
-- 2. INDEXES
-- =========================================================================
create index idx_teams_event on public.teams(event_id);
create index idx_cases_event on public.cases(event_id);
create index idx_questions_case on public.questions(case_id);
create index idx_options_question on public.question_options(question_id);
create index idx_access_codes_code on public.case_access_codes(code);
create index idx_submissions_team on public.submissions(team_id);
create index idx_answers_submission on public.answers(submission_id);
create index idx_security_logs_team on public.security_logs(team_id);

-- =========================================================================
-- 3. SECURE TRANSACTION RPC FUNCTIONS
-- =========================================================================

-- RPC 1: REGISTER TEAM TRANSACTION
create or replace function public.register_team_transaction(
    p_event_id uuid,
    p_name text,
    p_member_names text[],
    p_access_code text
)
returns jsonb
language plpgsql
security definer -- Elevates permissions for validation & locking
as $$
declare
    v_case_id uuid;
    v_code_id uuid;
    v_code_status text;
    v_team_id uuid;
    v_next_val integer;
    v_team_label text;
    v_member_name text;
    v_member_idx integer := 1;
begin
    -- 1. Validate team name uniqueness in this event
    if exists (select 1 from public.teams where event_id = p_event_id and lower(name) = lower(p_name)) then
        return jsonb_build_object('success', false, 'error', 'TEAM NAME ALREADY REGISTERED');
    end if;

    -- 2. Validate team size constraints (2 to 3 members)
    if array_length(p_member_names, 1) < 2 or array_length(p_member_names, 1) > 3 then
        return jsonb_build_object('success', false, 'error', 'TEAM SIZE MUST BE 2 OR 3 MEMBERS');
    end if;

    -- 3. Validate access code status and case association
    select id, case_id, status 
    into v_code_id, v_case_id, v_code_status
    from public.case_access_codes 
    where code = p_access_code;

    if v_code_id is null then
        return jsonb_build_object('success', false, 'error', 'CASE NOT FOUND');
    end if;

    if v_code_status != 'available' then
        return jsonb_build_object('success', false, 'error', 'ACCESS CODE ALREADY ASSIGNED OR USED');
    end if;

    -- 4. Generate unique TEAM label (e.g. TEAM-001)
    select coalesce(max(cast(substring(team_id_label from '\d+') as integer)), 0) + 1 
    into v_next_val
    from public.teams;
    
    v_team_label := 'TEAM-' || lpad(v_next_val::text, 3, '0');

    -- 5. Insert Team record
    insert into public.teams (event_id, team_id_label, name, case_id, status)
    values (p_event_id, v_team_label, p_name, v_case_id, 'registered')
    returning id into v_team_id;

    -- 6. Insert Team Members
    foreach v_member_name in array p_member_names loop
        insert into public.team_members (team_id, name, role)
        values (v_team_id, v_member_name, ('member_' || v_member_idx)::text);
        v_member_idx := v_member_idx + 1;
    end loop;

    -- 7. Assign and lock access code
    update public.case_access_codes
    set team_id = v_team_id,
        assigned_at = now(),
        status = 'assigned'
    where id = v_code_id;

    return jsonb_build_object(
        'success', true,
        'team_id', v_team_id,
        'team_id_label', v_team_label,
        'case_id', v_case_id,
        'access_code_id', v_code_id
    );
exception
    when others then
        return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;


-- RPC 2: BEGIN INVESTIGATION TRANSACTION
create or replace function public.begin_investigation_transaction(
    p_team_id uuid,
    p_case_id uuid,
    p_code_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_session_id uuid;
    v_started_at timestamp with time zone;
    v_status text;
begin
    -- Check if session already exists for this team/case (recovery check)
    select id, started_at, status 
    into v_session_id, v_started_at, v_status
    from public.investigation_sessions
    where team_id = p_team_id and case_id = p_case_id;

    if v_session_id is not null then
        return jsonb_build_object(
            'success', true,
            'session_id', v_session_id,
            'started_at', v_started_at,
            'status', v_status,
            'recovered', true
        );
    end if;

    -- Lock and verify access code is assigned to this team
    if not exists (
        select 1 from public.case_access_codes 
        where id = p_code_id and team_id = p_team_id and status = 'assigned'
    ) then
        return jsonb_build_object('success', false, 'error', 'INVALID OR LOCK-FAILED ACCESS CODE');
    end if;

    -- Update access code to used status
    update public.case_access_codes
    set status = 'used',
        used_at = now()
    where id = p_code_id;

    -- Update team status to active
    update public.teams
    set status = 'active'
    where id = p_team_id;

    -- Insert new investigation session with server timestamp
    insert into public.investigation_sessions (team_id, case_id, access_code_id, started_at, status)
    values (p_team_id, p_case_id, p_code_id, now(), 'active')
    returning id, started_at, status into v_session_id, v_started_at, v_status;

    return jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'started_at', v_started_at,
        'status', v_status,
        'recovered', false
    );
exception
    when others then
        return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;


-- RPC 3: SUBMIT INVESTIGATION TRANSACTION
create or replace function public.submit_investigation_transaction(
    p_session_id uuid,
    p_client_answers jsonb -- Array of objects: { question_id, answer_text, selected_options }
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_team_id uuid;
    v_case_id uuid;
    v_started_at timestamp with time zone;
    v_ended_at timestamp with time zone := now();
    v_duration integer; -- Duration in seconds
    v_submission_id uuid;
    v_next_val integer;
    v_submission_label text;
    v_status text;
    v_item jsonb;
    v_auto_score numeric(5,2);
    v_total_auto_score numeric(5,2) := 0.00;
    v_correct_count integer;
    v_total_options_count integer;
begin
    -- 1. Fetch and Lock Investigation Session
    select team_id, case_id, started_at, status
    into v_team_id, v_case_id, v_started_at, v_status
    from public.investigation_sessions
    where id = p_session_id
    for update;

    if v_team_id is null then
        return jsonb_build_object('success', false, 'error', 'INVESTIGATION SESSION UNAVAILABLE');
    end if;

    if v_status = 'submitted' then
        return jsonb_build_object('success', false, 'error', 'SUBMISSION ALREADY FINALIZED');
    end if;

    -- 2. Calculate duration on server
    v_duration := extract(epoch from (v_ended_at - v_started_at))::integer;

    -- 3. Generate SUBMISSION label ID (e.g. SUB-014827)
    select coalesce(max(cast(substring(submission_id_label from '\d+') as integer)), 100000) + 1 
    into v_next_val
    from public.submissions;
    
    v_submission_label := 'SUB-' || v_next_val::text;

    -- 4. Create Submission
    insert into public.submissions (
        submission_id_label, team_id, case_id, started_at, submitted_at, duration, score, is_finalized
    )
    values (
        v_submission_label, v_team_id, v_case_id, v_started_at, v_ended_at, v_duration, 0.00, false
    )
    returning id into v_submission_id;

    -- 5. Insert answers and execute authoritative auto-scoring
    for v_item in select * from jsonb_array_elements(p_client_answers) loop
        v_auto_score := 0.00;

        -- Scoring logic for Single Choice & Multiple Choice questions
        -- Check question type
        select 
            case 
                when q.type = 'single_choice' then
                    -- If single choice, check if selected option matches the single correct option
                    case 
                        when exists (
                            select 1 from public.question_options 
                            where id = (v_item->'selected_options'->>0)::uuid 
                              and question_id = (v_item->>'question_id')::uuid 
                              and is_correct = true
                        ) then q.marks::numeric
                        else 0.00
                    end
                when q.type = 'multiple_choice' then
                    -- For MCQs, all correct options must be selected and no incorrect ones.
                    -- Count total correct options in DB
                    -- Count how many correct options match the selected ones, and make sure selected_options matches correct ones exactly
                    (
                        select 
                            case 
                                when count(case when is_correct = true then 1 end) = count(case when id = any(select jsonb_array_elements_text(v_item->'selected_options')::uuid) and is_correct = true then 1 end)
                                 and count(case when id = any(select jsonb_array_elements_text(v_item->'selected_options')::uuid) and is_correct = false then 1 end) = 0
                                then q.marks::numeric
                                else 0.00
                            end
                        from public.question_options 
                        where question_id = q.id
                    )
                when q.type = 'evidence_selection' then
                    -- Handle similar to MCQ or exact match
                    (
                        select 
                            case 
                                when count(case when is_correct = true then 1 end) = count(case when id = any(select jsonb_array_elements_text(v_item->'selected_options')::uuid) and is_correct = true then 1 end)
                                 and count(case when id = any(select jsonb_array_elements_text(v_item->'selected_options')::uuid) and is_correct = false then 1 end) = 0
                                then q.marks::numeric
                                else 0.00
                            end
                        from public.question_options 
                        where question_id = q.id
                    )
                else 0.00 -- Text reasoning is scored manually
            end
        into v_auto_score
        from public.questions q
        where q.id = (v_item->>'question_id')::uuid;

        v_total_auto_score := v_total_auto_score + coalesce(v_auto_score, 0.00);

        -- Insert the answer record
        insert into public.answers (
            submission_id, question_id, answer_text, selected_options, score, is_graded
        )
        values (
            v_submission_id,
            (v_item->>'question_id')::uuid,
            v_item->>'answer_text',
            (select array_agg(val::uuid) from jsonb_array_elements_text(v_item->'selected_options') as val),
            coalesce(v_auto_score, 0.00),
            case 
                when (select type from public.questions where id = (v_item->>'question_id')::uuid) in ('single_choice', 'multiple_choice', 'evidence_selection') then true
                else false
            end
        );
    end loop;

    -- Update total score inside the submission
    update public.submissions
    set score = v_total_auto_score
    where id = v_submission_id;

    -- 6. Close out active session status
    update public.investigation_sessions
    set status = 'submitted',
        ended_at = v_ended_at
    where id = p_session_id;

    -- Update team status
    update public.teams
    set status = 'submitted'
    where id = v_team_id;

    return jsonb_build_object(
        'success', true,
        'submission_id', v_submission_id,
        'submission_id_label', v_submission_label,
        'duration', v_duration,
        'submitted_at', v_ended_at,
        'auto_score', v_total_auto_score
    );
exception
    when others then
        return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;


-- RPC 4: FINALIZE RESULTS SNAPSHOT
create or replace function public.finalize_results_transaction(
    p_event_id uuid,
    p_admin_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_snapshot_data jsonb;
begin
    -- 1. Verify admin role exists and is super_admin
    if not exists (
        select 1 from public.profiles 
        where id = p_admin_id and role = 'super_admin'
    ) then
        return jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: SUPER ADMIN PRIVILEGES REQUIRED');
    end if;

    -- 2. Build the ranking snapshot based on official tie-breaker rules
    -- Order logic:
    -- 1. Total score (descending)
    -- 2. Evidence/reasoning score (we sum scores of questions of type 'evidence_selection' or similar reasoning tags)
    -- 3. Duration (ascending)
    -- 4. Submission time (ascending)
    select jsonb_agg(row_to_json(t_rank))
    into v_snapshot_data
    from (
        select 
            rank() over (
                order by 
                    sub.score desc,
                    -- Evidence score sum (objective evidence_selection)
                    (select coalesce(sum(a.score), 0) from public.answers a join public.questions q on a.question_id = q.id where a.submission_id = sub.id and q.type in ('evidence_selection', 'long_answer')) desc,
                    sub.duration asc,
                    sub.submitted_at asc
            ) as rank,
            teams.team_id_label,
            teams.name as team_name,
            sub.id as submission_id,
            sub.submission_id_label,
            sub.score as total_score,
            sub.duration as duration_seconds,
            sub.submitted_at
        from public.submissions sub
        join public.teams teams on sub.team_id = teams.id
        where teams.event_id = p_event_id and teams.status != 'disqualified'
    ) t_rank;

    -- 3. Save snapshot
    insert into public.result_snapshots (event_id, finalized_by, snapshot_data)
    values (p_event_id, p_admin_id, v_snapshot_data);

    -- 4. Mark event closed
    update public.events
    set status = 'closed'
    where id = p_event_id;

    -- 5. Log action
    insert into public.admin_actions (admin_id, action_type, details)
    values (
        p_admin_id, 
        'finalize_results', 
        jsonb_build_object('event_id', p_event_id, 'team_count', jsonb_array_length(v_snapshot_data))
    );

    return jsonb_build_object('success', true, 'team_count', jsonb_array_length(v_snapshot_data));
exception
    when others then
        return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;


-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.cases enable row level security;
alter table public.case_access_codes enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.investigation_sessions enable row level security;
alter table public.submissions enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_rubrics enable row level security;
alter table public.answers enable row level security;
alter table public.draft_answers enable row level security;
alter table public.security_logs enable row level security;
alter table public.disciplinary_actions enable row level security;
alter table public.admin_actions enable row level security;
alter table public.event_settings enable row level security;
alter table public.result_snapshots enable row level security;

-- Helper check function
create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer
as $$
    select exists (
        select 1 from public.profiles 
        where id = user_id and status = 'active'
    );
$$;

create or replace function public.is_super_admin(user_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
    return exists (
        select 1 from public.profiles 
        where id = user_id 
          and email = 'vh13155_ml23@velhightech.com'
          and role = 'super_admin'
          and status = 'active'
    );
end;
$$;

-- PROFILES Policies
create policy admin_read_all_profiles on public.profiles 
    for select using (public.is_admin(auth.uid()));

create policy user_read_own_profile on public.profiles 
    for select using (auth.uid() = id);

create policy super_admin_write_profiles on public.profiles 
    for all using (public.is_super_admin(auth.uid()))
    with check (public.is_super_admin(auth.uid()));

-- EVENTS Policies
create policy public_read_open_events on public.events 
    for select using (status = 'open');

create policy admin_all_events on public.events 
    for all using (public.is_admin(auth.uid()));

-- CASES Policies
create policy participant_read_active_cases on public.cases 
    for select using (status = 'active');

create policy admin_all_cases on public.cases 
    for all using (public.is_admin(auth.uid()));

-- CASE ACCESS CODES Policies
-- Participants can read case access code verification status if not locked
create policy participant_read_assigned_codes on public.case_access_codes
    for select using (status = 'available' or status = 'assigned');

create policy admin_all_codes on public.case_access_codes
    for all using (public.is_admin(auth.uid()));

-- TEAMS Policies
create policy participant_read_own_team on public.teams
    for select using (id = (select team_id from public.case_access_codes where team_id = teams.id));

create policy admin_all_teams on public.teams
    for all using (public.is_admin(auth.uid()));

-- QUESTIONS Policies
-- Participants can only read active questions
create policy participant_read_questions on public.questions
    for select using (exists (
        select 1 from public.cases c where c.id = questions.case_id and c.status = 'active'
    ));

create policy admin_all_questions on public.questions
    for all using (public.is_admin(auth.uid()));

-- QUESTION OPTIONS Policies
-- Participants can read text and option sort orders, but never the correctness evaluation!
create policy participant_read_options on public.question_options
    for select using (
        exists (
            select 1 from public.questions q 
            join public.cases c on q.case_id = c.id 
            where q.id = question_options.question_id and c.status = 'active'
        )
    );

create policy admin_all_options on public.question_options
    for all using (public.is_admin(auth.uid()));

-- SECURITY LOGS Policies
create policy participant_insert_own_log on public.security_logs
    for insert with check (true); -- Client pushes violations, server validates references

create policy admin_all_logs on public.security_logs
    for all using (public.is_admin(auth.uid()));

-- ANSWERS Policies
create policy participant_write_own_answers on public.answers
    for all using (
        exists (
            select 1 from public.submissions s 
            join public.investigation_sessions isess on s.team_id = isess.team_id
            where s.id = answers.submission_id and isess.status = 'active'
        )
    );

create policy admin_all_answers on public.answers
    for all using (public.is_admin(auth.uid()));

-- Remaining general admin structures require admin privileges
create policy admin_all_rubrics on public.question_rubrics for all using (public.is_admin(auth.uid()));
create policy admin_all_submissions on public.submissions for all using (public.is_admin(auth.uid()));
create policy admin_all_disciplinary on public.disciplinary_actions for all using (public.is_admin(auth.uid()));
create policy admin_all_settings on public.event_settings for all using (public.is_admin(auth.uid()));
create policy admin_all_actions on public.admin_actions for all using (public.is_admin(auth.uid()));
create policy admin_all_snapshots on public.result_snapshots for all using (public.is_admin(auth.uid()));

-- DRAFT ANSWERS Policies
create policy participant_all_own_drafts on public.draft_answers
    for all using (team_id = (select team_id from public.case_access_codes where team_id = draft_answers.team_id));

create policy admin_read_all_drafts on public.draft_answers
    for select using (public.is_admin(auth.uid()));


-- =========================================================================
-- 5. INITIAL SEED DATA
-- =========================================================================

-- 1. Insert the default Admin Profile
INSERT INTO public.profiles (id, email, role)
VALUES ('b2ece65e-d728-4220-a40f-66f3234caeef', 'vh13155_ml23@velhightech.com', 'super_admin')
ON CONFLICT (id) DO UPDATE SET role = 'super_admin';

-- 2. Create the default Symposium Event
INSERT INTO public.events (id, name, year, status)
VALUES ('evt-2026-demo-uuid', 'Mystery Y Symposium 2026', 2026, 'open')
ON CONFLICT (id) DO NOTHING;

-- 3. Create the default Case File
INSERT INTO public.cases (id, event_id, case_number, title, description, video_path, duration_limit, total_marks, status)
VALUES (
  'case-2026-demo-uuid',
  'evt-2026-demo-uuid',
  'CASE-001',
  'The Silent Alibi',
  'A corporate CFO was found missing. Only a mysterious video feed and physical logs remain. Crack the code and solve the mystery.',
  'case-evidence/BigBuckBunny.mp4',
  60,
  100,
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Create Available Access Codes
INSERT INTO public.case_access_codes (case_id, code, status)
VALUES 
  ('case-2026-demo-uuid', 'MYSTERY-ALPHA-12', 'available'),
  ('case-2026-demo-uuid', 'MYSTERY-BRAVO-34', 'available'),
  ('case-2026-demo-uuid', 'MYSTERY-CHARLIE-56', 'available'),
  ('case-2026-demo-uuid', 'MYSTERY-DELTA-78', 'available'),
  ('case-2026-demo-uuid', 'MYSTERY-ECHO-90', 'available')
ON CONFLICT (code) DO NOTHING;


-- =========================================================================
-- 6. BEGIN INVESTIGATION TRANSACTION FUNCTION
--    Called by useAuth.tsx → beginInvestigation() via supabase.rpc(...)
--    Falls back gracefully: reuses an existing session if one already exists.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.begin_investigation_transaction(
  p_team_id   UUID,
  p_case_id   UUID,
  p_code_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session    investigation_sessions%ROWTYPE;
  v_submission submissions%ROWTYPE;
  v_sess_id    UUID;
  v_started_at TIMESTAMPTZ;
BEGIN
  -- 1. Reuse an existing session for this team (idempotent)
  SELECT * INTO v_session
  FROM public.investigation_sessions
  WHERE team_id = p_team_id
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session.id IS NULL THEN
    -- 2. Create a new session
    INSERT INTO public.investigation_sessions (team_id, case_id, status, started_at)
    VALUES (p_team_id, p_case_id, 'active', NOW())
    RETURNING * INTO v_session;

    -- 3. Mark access code as used (best-effort)
    IF p_code_id IS NOT NULL THEN
      UPDATE public.case_access_codes
      SET status = 'used', team_id = p_team_id
      WHERE id = p_code_id AND status = 'available';
    END IF;

    -- 4. Mark team as active
    UPDATE public.teams
    SET status = 'active'
    WHERE id = p_team_id;
  END IF;

  -- 5. Ensure submission row exists (idempotent)
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE team_id = p_team_id AND case_id = p_case_id
  LIMIT 1;

  IF v_submission.id IS NULL THEN
    INSERT INTO public.submissions (team_id, case_id, session_id, started_at)
    VALUES (p_team_id, p_case_id, v_session.id, v_session.started_at)
    RETURNING * INTO v_submission;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'session_id',     v_session.id,
    'submission_id',  v_submission.id,
    'started_at',     v_session.started_at,
    'status',         v_session.status
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.begin_investigation_transaction(UUID, UUID, UUID)
  TO anon, authenticated;



