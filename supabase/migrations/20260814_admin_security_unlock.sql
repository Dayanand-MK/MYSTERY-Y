-- Administrator-only unlock. Security logs are preserved; only the session state changes.
create or replace function public.unlock_security_session(p_session_id uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_session public.investigation_sessions%rowtype; v_admin public.profiles%rowtype;
begin
  select * into v_admin from public.profiles where id = auth.uid() and status = 'active' and role in ('super_admin', 'evaluator', 'coordinator');
  if not found then return jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ADMIN'); end if;
  select * into v_session from public.investigation_sessions where id = p_session_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND'); end if;
  if v_session.status <> 'locked' then return jsonb_build_object('success', false, 'error', 'SESSION_NOT_LOCKED'); end if;
  update public.investigation_sessions set status = 'active', last_seen_at = now() where id = p_session_id;
  insert into public.disciplinary_actions (team_id, session_id, action, reason, created_by)
  values (v_session.team_id, p_session_id, 'override_unlock', coalesce(nullif(trim(p_note), ''), 'Security-session unlock approved by administrator'), auth.uid());
  insert into public.admin_actions (admin_id, action_type, details)
  values (auth.uid(), 'SECURITY_SESSION_UNLOCK', jsonb_build_object('team_id', v_session.team_id, 'session_id', p_session_id, 'admin_email', v_admin.email, 'note', p_note, 'unlocked_at', now()));
  return jsonb_build_object('success', true, 'session_id', p_session_id, 'team_id', v_session.team_id, 'unlocked_by', v_admin.email, 'unlocked_at', now());
end;
$$;
revoke all on function public.unlock_security_session(uuid, text) from public;
grant execute on function public.unlock_security_session(uuid, text) to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'investigation_sessions') then
    alter publication supabase_realtime add table public.investigation_sessions;
  end if;
end $$;
