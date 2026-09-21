-- Allow 2–4 members while preserving the deployed registration logic.
BEGIN;

ALTER TABLE public.team_members
    DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_role_check
    CHECK (role IN ('member_1', 'member_2', 'member_3', 'member_4'));

DO $migration$
DECLARE
    registration_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.register_team_transaction(uuid,text,text[],text)'::regprocedure
    ) INTO registration_definition;

    IF position('array_length(p_member_names, 1) > 3' IN registration_definition) = 0
       AND position('array_length(p_member_names, 1) > 4' IN registration_definition) = 0 THEN
        RAISE EXCEPTION 'Unexpected registration team-size validation; migration rolled back';
    END IF;

    registration_definition := replace(registration_definition,
        'array_length(p_member_names, 1) > 3',
        'array_length(p_member_names, 1) > 4');
    registration_definition := replace(registration_definition,
        'TEAM SIZE MUST BE 2 OR 3 MEMBERS', 'TEAM SIZE MUST BE 2 TO 4 MEMBERS');
    registration_definition := replace(registration_definition, '2-3 members', '2-4 members');
    registration_definition := replace(registration_definition, '2 to 3 members', '2 to 4 members');
    EXECUTE registration_definition;
END;
$migration$;

INSERT INTO public.event_settings (key, value)
VALUES ('max_team_size', '4')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;
