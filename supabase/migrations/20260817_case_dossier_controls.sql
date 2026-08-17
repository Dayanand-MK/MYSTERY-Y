-- Server-authoritative destructive controls for the admin Cases area.
create or replace function public.delete_unused_case_access_code(p_code_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code public.case_access_codes%rowtype;
begin
  if not public.is_admin(auth.uid()) then return jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ADMIN'); end if;
  select * into v_code from public.case_access_codes where id = p_code_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'ACCESS_CODE_NOT_FOUND'); end if;
  if v_code.status <> 'available' or v_code.team_id is not null then return jsonb_build_object('success', false, 'error', 'USED_OR_ASSIGNED_CODES_CANNOT_BE_DELETED'); end if;
  delete from public.case_access_codes where id = p_code_id;
  insert into public.admin_actions (admin_id, action_type, details)
  values (auth.uid(), 'ACCESS_CODE_DELETED', jsonb_build_object('case_id', v_code.case_id, 'code_id', p_code_id));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_case_dossier(p_case_id uuid, p_case_number_confirmation text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_case public.cases%rowtype; v_submissions integer; v_teams integer;
begin
  if not public.is_super_admin(auth.uid()) then return jsonb_build_object('success', false, 'error', 'SUPER_ADMIN_REQUIRED'); end if;
  select * into v_case from public.cases where id = p_case_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'CASE_NOT_FOUND'); end if;
  if p_case_number_confirmation <> v_case.case_number then return jsonb_build_object('success', false, 'error', 'CASE_NUMBER_CONFIRMATION_MISMATCH'); end if;
  select count(*) into v_submissions from public.submissions where case_id = p_case_id;
  select count(*) into v_teams from public.teams where case_id = p_case_id;
  if v_submissions > 0 or v_teams > 0 then return jsonb_build_object('success', false, 'error', 'CASE_HAS_PARTICIPANT_HISTORY'); end if;
  delete from public.cases where id = p_case_id;
  insert into public.admin_actions (admin_id, action_type, details)
  values (auth.uid(), 'CASE_DELETED', jsonb_build_object('case_id', p_case_id, 'case_number', v_case.case_number));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.delete_unused_case_access_code(uuid) from public;
revoke all on function public.delete_case_dossier(uuid, text) from public;
grant execute on function public.delete_unused_case_access_code(uuid) to authenticated;
grant execute on function public.delete_case_dossier(uuid, text) to authenticated;
