-- Preserve the deployed scoring/session logic; only add validation before writes.
BEGIN;
DO $migration$
DECLARE
    definition text;
BEGIN
    SELECT pg_get_functiondef('public.submit_investigation_transaction(uuid,jsonb)'::regprocedure) INTO definition;
    IF position('NO ANSWERS RECEIVED. RELOAD THE REVIEW BEFORE SUBMITTING' IN definition) = 0 THEN
        IF definition !~* '\mBEGIN\M' THEN
            RAISE EXCEPTION 'Unexpected submission function; migration rolled back';
        END IF;
        definition := regexp_replace(definition, '\mBEGIN\M', 'BEGIN' || $guard$
    -- Reject incomplete payloads before creating a submission or closing a session.
    IF jsonb_typeof(p_client_answers) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ANSWERS MUST BE AN ARRAY');
    END IF;
    IF jsonb_array_length(p_client_answers) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO ANSWERS RECEIVED. RELOAD THE REVIEW BEFORE SUBMITTING');
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_client_answers) a
        WHERE NOT EXISTS (
            SELECT 1 FROM public.questions q
            JOIN public.investigation_sessions s ON s.case_id = q.case_id
            WHERE s.id = p_session_id AND q.id = (a->>'question_id')::uuid
        )
    ) OR EXISTS (
        SELECT 1 FROM public.questions q
        JOIN public.investigation_sessions s ON s.case_id = q.case_id
        WHERE s.id = p_session_id AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_client_answers) a
            WHERE (a->>'question_id')::uuid = q.id
        )
    ) OR (SELECT count(*) FROM jsonb_array_elements(p_client_answers)) <>
         (SELECT count(DISTINCT a->>'question_id') FROM jsonb_array_elements(p_client_answers) a) THEN
        RETURN jsonb_build_object('success', false, 'error', 'QUESTION LIST CHANGED OR IS INCOMPLETE. RELOAD THE REVIEW');
    END IF;
$guard$, 'i');
        EXECUTE definition;
    END IF;
END;
$migration$;
COMMIT;
