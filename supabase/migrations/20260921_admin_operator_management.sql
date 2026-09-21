-- Migration: 20260921_admin_operator_management.sql
-- Enables Super Admin to directly create, assign passwords, change passwords, and manage Coordinators & Evaluators in Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Create or Update Operator Account (with direct password and role assignment)
CREATE OR REPLACE FUNCTION public.create_operator_account(
    p_email TEXT,
    p_password TEXT,
    p_role TEXT,
    p_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_user_id UUID;
    v_encrypted_pw TEXT;
    v_existing_id UUID;
    v_clean_email TEXT;
    v_clean_name TEXT;
    v_clean_role TEXT;
BEGIN
    v_clean_email := lower(trim(p_email));
    v_clean_name := trim(p_name);
    v_clean_role := lower(trim(p_role));

    -- 1. Verify caller has Super Admin clearance
    SELECT role, email INTO v_caller_role, v_caller_email
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'super_admin'
       AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Super Admin clearance required');
    END IF;

    -- 2. Validate parameters
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Email clearance ID is required');
    END IF;

    IF p_password IS NULL OR length(trim(p_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
    END IF;

    IF v_clean_role NOT IN ('evaluator', 'coordinator') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Role must be evaluator or coordinator');
    END IF;

    IF v_clean_email = 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot duplicate or overwrite the permanent Super Admin account');
    END IF;

    -- Hash password using bcrypt
    v_encrypted_pw := crypt(trim(p_password), gen_salt('bf'));

    -- 3. Check if user already exists in auth.users
    SELECT id INTO v_existing_id
    FROM auth.users
    WHERE email = v_clean_email;

    IF v_existing_id IS NOT NULL THEN
        -- Update password and role for existing operator
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            raw_user_meta_data = jsonb_build_object('name', v_clean_name, 'role', v_clean_role),
            updated_at = now()
        WHERE id = v_existing_id;

        INSERT INTO public.profiles (id, email, role, name, status, created_at)
        VALUES (v_existing_id, v_clean_email, v_clean_role, v_clean_name, 'active', now())
        ON CONFLICT (id) DO UPDATE SET
            role = v_clean_role,
            name = v_clean_name,
            status = 'active';

        -- Log administrative action
        INSERT INTO public.admin_actions (admin_id, action_type, details)
        VALUES (auth.uid(), 'ADMIN_UPDATED', jsonb_build_object(
            'email', v_clean_email,
            'role', v_clean_role,
            'name', v_clean_name
        ));

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Operator credentials updated successfully',
            'user_id', v_existing_id,
            'email', v_clean_email,
            'role', v_clean_role,
            'name', v_clean_name
        );
    END IF;

    -- 4. Create new user in auth.users
    v_user_id := gen_random_uuid();

    BEGIN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            v_encrypted_pw,
            now(),
            jsonb_build_object('provider', 'email', 'providers', array['email']),
            jsonb_build_object('name', v_clean_name, 'role', v_clean_role),
            now(),
            now(),
            '',
            ''
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Failed to create auth user: ' || SQLERRM);
    END;

    -- Best-effort insert into auth.identities
    BEGIN
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
            'email',
            v_clean_email,
            now(),
            now(),
            now()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. Insert profile record in public.profiles
    INSERT INTO public.profiles (id, email, role, name, status, created_at)
    VALUES (v_user_id, v_clean_email, v_clean_role, v_clean_name, 'active', now())
    ON CONFLICT (id) DO UPDATE SET
        role = v_clean_role,
        name = v_clean_name,
        status = 'active';

    -- Log action
    INSERT INTO public.admin_actions (admin_id, action_type, details)
    VALUES (auth.uid(), 'ADMIN_CREATED', jsonb_build_object(
        'email', v_clean_email,
        'role', v_clean_role,
        'name', v_clean_name,
        'user_id', v_user_id
    ));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Operator account created and stored successfully',
        'user_id', v_user_id,
        'email', v_clean_email,
        'role', v_clean_role,
        'name', v_clean_name
    );
END;
$$;

-- 2. Update Operator Password
CREATE OR REPLACE FUNCTION public.update_operator_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_encrypted_pw TEXT;
    v_target_email TEXT;
BEGIN
    -- Verify caller has Super Admin clearance
    SELECT role, email INTO v_caller_role, v_caller_email
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'super_admin'
       AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Super Admin clearance required');
    END IF;

    IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
        RETURN jsonb_build_object('success', false, 'error', 'New password must be at least 6 characters');
    END IF;

    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
    IF v_target_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operator profile not found');
    END IF;

    v_encrypted_pw := crypt(trim(p_new_password), gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.admin_actions (admin_id, action_type, details)
    VALUES (auth.uid(), 'ADMIN_PASSWORD_RESET', jsonb_build_object(
        'target_id', p_user_id,
        'target_email', v_target_email
    ));

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Password assigned successfully',
        'email', v_target_email
    );
END;
$$;

-- 3. Delete Operator Account
CREATE OR REPLACE FUNCTION public.delete_operator_account(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_target_email TEXT;
BEGIN
    SELECT role, email INTO v_caller_role, v_caller_email
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'super_admin'
       AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Super Admin clearance required');
    END IF;

    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
    IF lower(coalesce(v_target_email, '')) = 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'The permanent Super Admin account cannot be deleted');
    END IF;

    DELETE FROM public.profiles WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    INSERT INTO public.admin_actions (admin_id, action_type, details)
    VALUES (auth.uid(), 'ADMIN_ACCESS_REMOVED', jsonb_build_object(
        'target_id', p_user_id,
        'target_email', v_target_email
    ));

    RETURN jsonb_build_object('success', true, 'message', 'Operator access revoked and profile removed');
END;
$$;

-- Grant execution permissions to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.create_operator_account(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_operator_password(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_operator_account(UUID) TO authenticated, anon;
