-- Apply this migration to the existing Supabase project before deploying the client.
-- The transaction serializes violations per investigation session and is the only
-- participant write path for public.security_logs.
alter table public.security_logs add column if not exists client_event_id uuid;
create unique index if not exists security_logs_client_event_id_key
  on public.security_logs (client_event_id) where client_event_id is not null;

alter table public.investigation_sessions drop constraint if exists investigation_sessions_status_check;
alter table public.investigation_sessions add constraint investigation_sessions_status_check
  check (status in ('active', 'submitted', 'terminated', 'flagged', 'locked'));

create or replace function public.record_security_violation(
  p_team_id uuid,
  p_session_id uuid,
  p_event_type text,
  p_client_event_id uuid,
  p_details jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.investigation_sessions%rowtype;
  v_existing public.security_logs%rowtype;
  v_attempt integer;
  v_violation_id uuid;
  v_locked boolean := false;
begin
  if p_event_type not in ('TAB_SWITCH', 'WINDOW_BLUR', 'COPY_ATTEMPT', 'PASTE_ATTEMPT', 'CUT_ATTEMPT', 'CONTEXT_MENU', 'FULLSCREEN_EXIT', 'MULTIPLE_SESSION') then
    return jsonb_build_object('success', false, 'error', 'INVALID_SECURITY_EVENT');
  end if;

  -- Serialize all attempts for this session, preventing concurrent browser events
  -- from reading the same count and creating two attempts.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_session from public.investigation_sessions
    where id = p_session_id and team_id = p_team_id for update;
  if not found or v_session.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'ACTIVE_PARTICIPANT_SESSION_NOT_FOUND');
  end if;

  select * into v_existing from public.security_logs where client_event_id = p_client_event_id;
  if found then
    return jsonb_build_object('success', true, 'violation_id', v_existing.id,
      'attempt_number', coalesce((v_existing.details->>'attempt_number')::integer, 1),
      'max_attempts', 3, 'locked', false, 'event_type', v_existing.event_type, 'duplicate', true);
  end if;

  select count(*) + 1 into v_attempt from public.security_logs where session_id = p_session_id;
  v_locked := v_attempt >= 3;
  insert into public.security_logs (client_event_id, team_id, session_id, event_type, details, severity, is_reviewed)
  values (p_client_event_id, p_team_id, p_session_id, p_event_type,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('attempt_number', v_attempt, 'max_attempts', 3),
    case when v_locked then 'high' else 'medium' end, false)
  returning id into v_violation_id;

  if v_locked then update public.investigation_sessions set status = 'locked' where id = p_session_id; end if;
  return jsonb_build_object('success', true, 'violation_id', v_violation_id,
    'attempt_number', v_attempt, 'max_attempts', 3, 'locked', v_locked, 'event_type', p_event_type);
end;
$$;

revoke all on function public.record_security_violation(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.record_security_violation(uuid, uuid, text, uuid, jsonb) to anon, authenticated;

-- Participant clients must use the function above; retain admin read/write access.
drop policy if exists participant_insert_own_log on public.security_logs;
drop policy if exists anon_insert_security_log on public.security_logs;
alter table public.security_logs replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'security_logs'
  ) then
    alter publication supabase_realtime add table public.security_logs;
  end if;
end $$;
