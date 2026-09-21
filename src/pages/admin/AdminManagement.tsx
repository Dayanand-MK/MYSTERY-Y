import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader,
  ShieldAlert,
  CheckCircle2,
  User,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  Sparkles,
  Database
} from 'lucide-react';

const SQL_MIGRATION_SNIPPET = `-- Run this in your Supabase Dashboard -> SQL Editor:
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

    SELECT role, email INTO v_caller_role, v_caller_email
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'super_admin'
       AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Super Admin clearance required');
    END IF;

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
        RETURN jsonb_build_object('success', false, 'error', 'Cannot duplicate or overwrite permanent Super Admin');
    END IF;

    v_encrypted_pw := crypt(trim(p_password), gen_salt('bf'));

    SELECT id INTO v_existing_id
    FROM auth.users
    WHERE email = v_clean_email;

    IF v_existing_id IS NOT NULL THEN
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

        RETURN jsonb_build_object('success', true, 'message', 'Operator credentials updated successfully', 'user_id', v_existing_id, 'email', v_clean_email, 'role', v_clean_role);
    END IF;

    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
        v_clean_email, v_encrypted_pw, now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('name', v_clean_name, 'role', v_clean_role),
        now(), now(), '', ''
    );

    BEGIN
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_user_id::text, v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
            'email', v_clean_email, now(), now(), now()
        );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    INSERT INTO public.profiles (id, email, role, name, status, created_at)
    VALUES (v_user_id, v_clean_email, v_clean_role, v_clean_name, 'active', now())
    ON CONFLICT (id) DO UPDATE SET
        role = v_clean_role,
        name = v_clean_name,
        status = 'active';

    RETURN jsonb_build_object('success', true, 'message', 'Operator account created successfully', 'user_id', v_user_id, 'email', v_clean_email, 'role', v_clean_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_operator_password(p_user_id UUID, p_new_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_encrypted_pw TEXT;
    v_target_email TEXT;
BEGIN
    SELECT role, email INTO v_caller_role, v_caller_email FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'super_admin' AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
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
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, updated_at = now() WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'message', 'Password updated successfully', 'email', v_target_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_operator_account(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_email TEXT;
    v_target_email TEXT;
BEGIN
    SELECT role, email INTO v_caller_role, v_caller_email FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS DISTINCT FROM 'super_admin' AND lower(coalesce(v_caller_email, '')) IS DISTINCT FROM 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Super Admin clearance required');
    END IF;
    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
    IF lower(coalesce(v_target_email, '')) = 'vh13155_ml23@velhightech.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permanent Super Admin cannot be deleted');
    END IF;
    DELETE FROM public.profiles WHERE id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'message', 'Operator deleted successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_operator_account(TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_operator_password(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_operator_account(UUID) TO authenticated, anon;`;

export default function AdminManagement() {
  const navigate = useNavigate();
  const { adminUser, isSuperAdmin } = useAuth();

  const [admins, setAdmins] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Operator / Admin form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<'evaluator' | 'coordinator'>('evaluator');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Newly Created Credentials Badge
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    role: string;
    name: string;
    password: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Edit Role state
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [editRole, setEditRole] = useState<'evaluator' | 'coordinator'>('evaluator');

  // Reset / Change Password Modal
  const [passwordTargetAdmin, setPasswordTargetAdmin] = useState<any | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // SQL Setup Modal
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) {
      const timer = setTimeout(() => {
        navigate('/admin');
      }, 3000);
      return () => clearTimeout(timer);
    }

    loadAdmins();
  }, [isSuperAdmin, navigate]);

  const loadAdmins = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        setErrorMsg(error.message);
      } else if (data) {
        setAdmins(data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch admin accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomPassword = (roleType: string) => {
    const prefix = roleType === 'evaluator' ? 'Eval' : 'Coord';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const symbols = ['!', '@', '#', '$'];
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const randChar = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `${prefix}@${randNum}${sym}${randChar}`;
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim() || !newPassword.trim()) {
      setErrorMsg('NAME, EMAIL, AND ASSIGNED PASSWORD ARE ALL REQUIRED.');
      return;
    }

    if (newPassword.trim().length < 6) {
      setErrorMsg('PASSWORD MUST BE AT LEAST 6 CHARACTERS.');
      return;
    }

    const emailClean = newEmail.trim().toLowerCase();
    const nameClean = newName.trim();
    const passwordClean = newPassword.trim();

    if (emailClean === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('CANNOT DUPLICATE THE PERMANENT SUPER ADMIN EMAIL.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Try secure PostgreSQL RPC function in Supabase
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_operator_account', {
        p_email: emailClean,
        p_password: passwordClean,
        p_role: newRole,
        p_name: nameClean
      });

      if (!rpcError && rpcData?.success) {
        setSuccessMsg(`OPERATOR ${emailClean.toUpperCase()} (${newRole.toUpperCase()}) ASSIGNED AND STORED IN SUPABASE.`);
        setCreatedCredentials({
          email: emailClean,
          role: newRole,
          name: nameClean,
          password: passwordClean
        });
        setNewEmail('');
        setNewName('');
        setNewPassword('');
        setShowAddForm(false);
        await loadAdmins();
        return;
      }

      // If RPC error indicates the function does not exist in DB yet, try fallback via separate auth client
      const rpcMissing = rpcError && (rpcError.message.includes('function') || rpcError.message.includes('does not exist') || rpcError.code === '42883');

      if (rpcMissing) {
        console.warn('RPC create_operator_account missing, attempting client fallback...');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

        if (supabaseUrl && supabaseAnonKey) {
          const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });

          const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
            email: emailClean,
            password: passwordClean,
            options: {
              data: { name: nameClean, role: newRole }
            }
          });

          if (signUpErr) {
            setErrorMsg(`Supabase Auth creation error: ${signUpErr.message}. Please run the operator migration SQL in Supabase SQL Editor.`);
            setShowSqlModal(true);
            return;
          }

          if (signUpData?.user) {
            // Upsert profile
            await supabase.from('profiles').upsert({
              id: signUpData.user.id,
              email: emailClean,
              name: nameClean,
              role: newRole,
              status: 'active',
              created_at: new Date().toISOString()
            });

            setSuccessMsg(`OPERATOR ${emailClean.toUpperCase()} CREATED AND STORED IN SUPABASE.`);
            setCreatedCredentials({
              email: emailClean,
              role: newRole,
              name: nameClean,
              password: passwordClean
            });
            setNewEmail('');
            setNewName('');
            setNewPassword('');
            setShowAddForm(false);
            await loadAdmins();
            return;
          }
        }
      }

      const errText = rpcError?.message || rpcData?.error || 'Operator creation failed.';
      setErrorMsg(`${errText} Click "Supabase SQL Setup" to verify SQL functions.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Operator creation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetAdmin || !resetPasswordVal.trim()) return;

    if (resetPasswordVal.trim().length < 6) {
      setErrorMsg('PASSWORD MUST BE AT LEAST 6 CHARACTERS.');
      return;
    }

    setIsResettingPassword(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const newPwClean = resetPasswordVal.trim();

    try {
      const { data, error } = await supabase.rpc('update_operator_password', {
        p_user_id: passwordTargetAdmin.id,
        p_new_password: newPwClean
      });

      if (error || (data && !data.success)) {
        const errText = error?.message || data?.error || 'Password update failed.';
        setErrorMsg(errText);
      } else {
        setSuccessMsg(`NEW PASSWORD ASSIGNED TO ${passwordTargetAdmin.email.toUpperCase()}.`);
        setCreatedCredentials({
          email: passwordTargetAdmin.email,
          role: passwordTargetAdmin.role,
          name: passwordTargetAdmin.name || 'Operator',
          password: newPwClean
        });
        setPasswordTargetAdmin(null);
        setResetPasswordVal('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update operator password.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleToggleStatus = async (admin: any) => {
    if (admin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ACCOUNT CANNOT BE DISABLED.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    const nextStatus = admin.status === 'active' ? 'disabled' : 'active';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: nextStatus })
        .eq('id', admin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`ADMIN ${admin.email.toUpperCase()} HAS BEEN ${nextStatus.toUpperCase()}.`);
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Status update failed.');
    }
  };

  const handleEditRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    if (editingAdmin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ROLE CANNOT BE CHANGED.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: editRole })
        .eq('id', editingAdmin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`ROLE FOR ${editingAdmin.email.toUpperCase()} CHANGED TO ${editRole.toUpperCase()}.`);
        setEditingAdmin(null);
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Role change failed.');
    }
  };

  const handleRemoveAdmin = async (admin: any) => {
    if (admin.email === 'vh13155_ml23@velhightech.com') {
      setErrorMsg('THE PERMANENT SUPER ADMIN ACCOUNT CANNOT BE DELETED.');
      return;
    }

    const confirmDelete = window.confirm(`ARE YOU SURE YOU WANT TO REVOKE ACCESS AND REMOVE: ${admin.email.toUpperCase()}?`);
    if (!confirmDelete) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Try RPC first to delete from auth.users as well
      const { data: rpcData, error: rpcError } = await supabase.rpc('delete_operator_account', {
        p_user_id: admin.id
      });

      if (!rpcError && rpcData?.success) {
        setSuccessMsg(`OPERATOR ${admin.email.toUpperCase()} REMOVED.`);
        await loadAdmins();
        return;
      }

      // Fallback to table delete
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', admin.id);

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg(`SYSTEM ACCESS REVOKED FOR ${admin.email.toUpperCase()}.`);
        await loadAdmins();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Admin removal failed.');
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const loginUrl = `${window.location.origin}/admin/login`;
    const text = `MYSTERY Y ADMIN CREDENTIALS:\nName: ${createdCredentials.name}\nEmail / Operator ID: ${createdCredentials.email}\nRole: ${createdCredentials.role.toUpperCase()}\nAssigned Password: ${createdCredentials.password}\nLogin Portal: ${loginUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 3000);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_SNIPPET);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center bg-detective-dark/20 text-center font-mono p-6">
        <ShieldAlert className="w-16 h-16 text-detective-crimson mb-4 animate-pulse" />
        <h1 className="text-xl font-bold text-white uppercase tracking-wider mb-2">ACCESS RESTRICTED</h1>
        <p className="text-sm text-detective-muted max-w-md leading-relaxed uppercase">
          CLEARANCE CODE ERROR: Only the permanent Super Admin is authorized to access the Admin Management center.
        </p>
        <span className="text-[10px] text-detective-muted mt-6 animate-pulse-subtle">
          REDIRECTING SECURE LINK BACK TO WORKSTATION COMMAND...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-detective-border pb-4">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-detective-crimson" /> Coordinator & Evaluator Management
          </h1>
          <p className="text-xs text-detective-muted uppercase tracking-widest mt-1">
            Create, Assign Passwords & Manage Security Roles in Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSqlModal(true)}
            className="flex items-center gap-1.5 bg-black/40 hover:bg-black/60 border border-detective-border text-stone-300 hover:text-white px-3 py-2 rounded text-xs tracking-wider uppercase transition-colors"
            title="View Supabase SQL Setup Script"
          >
            <Database className="w-4 h-4 text-detective-muted" /> SQL Setup
          </button>
          <button
            onClick={() => {
              setNewPassword(generateRandomPassword('evaluator'));
              setShowAddForm(true);
            }}
            className="flex items-center gap-1.5 bg-detective-crimson hover:bg-detective-alert text-white px-4 py-2 rounded text-xs font-bold tracking-wider uppercase transition-colors shadow-lg"
          >
            <Plus className="w-4 h-4" /> Assign New Operator
          </button>
        </div>
      </div>

      {/* Advisory notifications */}
      {errorMsg && (
        <div className="border border-detective-crimson/40 bg-detective-crimson/10 text-detective-alert p-3 rounded text-xs uppercase flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-[10px] text-stone-400 hover:text-white uppercase underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="border border-detective-green/30 bg-detective-green/10 text-detective-green p-3 rounded text-xs uppercase flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-[10px] text-stone-400 hover:text-white uppercase underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Newly Created / Assigned Credentials Card */}
      {createdCredentials && (
        <div className="border border-detective-amber/50 bg-black/40 p-4 rounded text-xs space-y-3 font-mono shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-detective-amber"></div>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
            <div className="font-bold uppercase tracking-wider flex items-center gap-2 text-white">
              <Key className="w-4 h-4 text-detective-amber" /> Assigned Credentials (Saved in Supabase):
            </div>
            <button
              onClick={handleCopyCredentials}
              className="flex items-center gap-1.5 bg-detective-amber/20 hover:bg-detective-amber/30 text-detective-amber border border-detective-amber/40 px-3 py-1 rounded text-xs font-bold tracking-wider uppercase transition-colors self-start sm:self-auto"
            >
              {copiedCredentials ? <Check className="w-3.5 h-3.5 text-detective-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCredentials ? 'Copied to Clipboard' : 'Copy Full Credentials'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-black/60 p-3 rounded border border-detective-border text-xs">
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Operator</span>
              <span className="font-bold text-white uppercase">{createdCredentials.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Email Login ID</span>
              <span className="font-bold text-stone-200">{createdCredentials.email}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Assigned Role</span>
              <span className="font-bold text-detective-amber uppercase">{createdCredentials.role}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Secret Password</span>
              <span className="font-bold text-white bg-detective-amber/20 px-2 py-0.5 rounded border border-detective-amber/40 inline-block">
                {createdCredentials.password}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-400">
            <span>
              This operator can immediately authenticate at <strong className="text-white">/admin/login</strong> with these credentials.
            </span>
            <button
              onClick={() => setCreatedCredentials(null)}
              className="text-stone-500 hover:text-white uppercase text-[10px] underline ml-2"
            >
              Close Banner
            </button>
          </div>
        </div>
      )}

      {/* Operators Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-detective-muted">
          <Loader className="w-6 h-6 animate-spin text-detective-crimson mr-2" />
          QUERYING OPERATOR PROFILES FROM SUPABASE...
        </div>
      ) : (
        <div className="overflow-x-auto border border-detective-border rounded bg-detective-panel shadow-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-black/40 border-b border-detective-border text-detective-muted font-bold">
                <th className="p-4">OPERATOR NAME</th>
                <th className="p-4">EMAIL ID</th>
                <th className="p-4">ROLE</th>
                <th className="p-4">STATUS</th>
                <th className="p-4">REGISTERED</th>
                <th className="p-4">LAST LOGIN</th>
                <th className="p-4 text-right">SECURITY ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-detective-border/40 font-mono text-[11px]">
              {admins.map((adm) => {
                const isPermanentSA = adm.email === 'vh13155_ml23@velhightech.com';

                return (
                  <tr key={adm.id} className="hover:bg-black/10 transition-colors">
                    <td className="p-4 text-white uppercase font-bold flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-detective-muted" />
                      {adm.name || 'SYSTEM OPERATOR'}
                    </td>
                    <td className="p-4 text-stone-300 font-bold">{adm.email}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase ${
                          adm.role === 'super_admin'
                            ? 'border-detective-crimson text-detective-alert bg-detective-crimson/10'
                            : adm.role === 'evaluator'
                            ? 'border-detective-amber text-detective-amber bg-detective-amber/10'
                            : 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10'
                        }`}
                      >
                        {adm.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={`font-bold uppercase tracking-wider ${
                          adm.status === 'active' ? 'text-detective-green' : 'text-detective-alert'
                        }`}
                      >
                        {adm.status || 'active'}
                      </span>
                    </td>
                    <td className="p-4 text-detective-muted">
                      {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : 'INITIAL'}
                    </td>
                    <td className="p-4 text-detective-muted">
                      {adm.last_login ? new Date(adm.last_login).toLocaleString() : 'NEVER'}
                    </td>
                    <td className="p-4 text-right space-x-1.5">
                      {isPermanentSA ? (
                        <span className="text-[10px] text-detective-muted font-bold uppercase tracking-wider px-2 py-1 bg-black/40 rounded border border-detective-border">
                          PERMANENT SA
                        </span>
                      ) : (
                        <>
                          {/* Assign New Password */}
                          <button
                            onClick={() => {
                              setPasswordTargetAdmin(adm);
                              setResetPasswordVal(generateRandomPassword(adm.role));
                            }}
                            className="bg-black/35 hover:bg-black/60 border border-detective-amber/40 text-detective-amber hover:text-white px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[10px]"
                            title="Assign New Password"
                          >
                            <Key className="w-3 h-3" /> Password
                          </button>

                          {/* Edit Role */}
                          <button
                            onClick={() => {
                              setEditingAdmin(adm);
                              setEditRole(adm.role === 'super_admin' ? 'evaluator' : adm.role);
                            }}
                            className="bg-black/35 hover:bg-black/60 border border-detective-border hover:border-white/30 text-stone-400 hover:text-white px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[10px]"
                            title="Edit Role"
                          >
                            <Edit className="w-3 h-3" /> Role
                          </button>

                          {/* Toggle Status */}
                          <button
                            onClick={() => handleToggleStatus(adm)}
                            className={`border px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[10px] ${
                              adm.status === 'active'
                                ? 'bg-black/30 border-detective-border text-stone-400 hover:bg-detective-crimson hover:text-white'
                                : 'bg-detective-green/10 border-detective-green/40 text-detective-green hover:bg-detective-green hover:text-white'
                            }`}
                            title={adm.status === 'active' ? 'Disable Account' : 'Enable Account'}
                          >
                            {adm.status === 'active' ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                            {adm.status === 'active' ? 'Disable' : 'Enable'}
                          </button>

                          {/* Remove Admin */}
                          <button
                            onClick={() => handleRemoveAdmin(adm)}
                            className="bg-black/40 hover:bg-detective-crimson border border-detective-crimson/50 hover:border-detective-crimson text-detective-alert hover:text-white px-2 py-1 rounded transition-colors inline-flex items-center gap-1 text-[10px]"
                            title="Revoke Access"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add New Operator Modal Popup */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddAdmin}
            className="bg-detective-panel border border-detective-border rounded p-6 max-w-md w-full font-mono text-xs space-y-4 shadow-2xl relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-crimson"></div>
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-detective-crimson" /> Assign Coordinator or Evaluator
            </h3>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                Operator Full Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Dr. Jane Foster"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                Clearance Email (Login Operator ID)
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="e.g. eval.jane@college.edu"
                required
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none focus:border-detective-crimson text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                Security Role Clearance
              </label>
              <select
                value={newRole}
                onChange={(e: any) => {
                  const r = e.target.value;
                  setNewRole(r);
                  setNewPassword(generateRandomPassword(r));
                }}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="evaluator">EVALUATOR (Grading & Scores Review + Security Audit)</option>
                <option value="coordinator">COORDINATOR (Teams, Cases, Submissions & Security Center)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[10px] uppercase text-detective-muted font-bold">
                  Assigned Secret Password
                </label>
                <button
                  type="button"
                  onClick={() => setNewPassword(generateRandomPassword(newRole))}
                  className="text-[10px] text-detective-amber hover:text-white inline-flex items-center gap-1 uppercase"
                >
                  <Sparkles className="w-3 h-3" /> Quick Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="w-full bg-black/40 border border-detective-border rounded p-2 pr-10 text-white focus:outline-none focus:border-detective-crimson text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-detective-muted hover:text-white"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-stone-500 mt-1">
                This password is saved into Supabase Auth. The operator will use this exact password to log in at /admin/login.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewEmail('');
                  setNewName('');
                  setNewPassword('');
                }}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting && <Loader className="w-3 h-3 animate-spin" />}
                {isSubmitting ? 'Storing in Supabase...' : 'Create & Assign Operator'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change / Reset Password Modal */}
      {passwordTargetAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdatePassword}
            className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs space-y-4 shadow-2xl relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-amber"></div>
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-detective-amber" /> Assign New Password
            </h3>

            <div>
              <span className="text-[10px] text-detective-muted uppercase block">Target Account</span>
              <span className="font-bold text-white text-xs block truncate mt-0.5">
                {passwordTargetAdmin.email}
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[10px] uppercase text-detective-muted font-bold">
                  New Secret Password
                </label>
                <button
                  type="button"
                  onClick={() => setResetPasswordVal(generateRandomPassword(passwordTargetAdmin.role))}
                  className="text-[10px] text-detective-amber hover:text-white inline-flex items-center gap-1 uppercase"
                >
                  <Sparkles className="w-3 h-3" /> Quick Generate
                </button>
              </div>
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="New password (min 6 characters)"
                  required
                  className="w-full bg-black/40 border border-detective-border rounded p-2 pr-10 text-white focus:outline-none focus:border-detective-amber text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-detective-muted hover:text-white"
                >
                  {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => {
                  setPasswordTargetAdmin(null);
                  setResetPasswordVal('');
                }}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isResettingPassword}
                className="px-4 py-1.5 rounded bg-detective-amber hover:bg-amber-500 text-black font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isResettingPassword && <Loader className="w-3 h-3 animate-spin" />}
                {isResettingPassword ? 'Saving Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Role Modal Popup */}
      {editingAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleEditRole}
            className="bg-detective-panel border border-detective-border rounded p-6 max-w-sm w-full font-mono text-xs space-y-4 shadow-2xl relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-crimson"></div>
            <h3 className="text-sm font-bold uppercase text-white border-b border-detective-border pb-2 mb-4 flex items-center gap-1.5">
              <Edit className="w-4 h-4 text-detective-amber" /> Modify Administrator Role
            </h3>

            <div>
              <span className="text-[10px] text-detective-muted uppercase block">Admin Account</span>
              <span className="font-bold text-white uppercase text-xs block truncate mt-0.5">
                {editingAdmin.email}
              </span>
            </div>

            <div>
              <label className="block text-[10px] uppercase text-detective-muted mb-1 font-bold">
                New Security Role Access
              </label>
              <select
                value={editRole}
                onChange={(e: any) => setEditRole(e.target.value)}
                className="w-full bg-black/40 border border-detective-border rounded p-2 text-white focus:outline-none text-xs"
              >
                <option value="evaluator">EVALUATOR (Grading & Scores Review + Security Audit)</option>
                <option value="coordinator">COORDINATOR (Teams, Cases, Submissions & Security Center)</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 border-t border-detective-border/40 pt-4">
              <button
                type="button"
                onClick={() => setEditingAdmin(null)}
                className="px-3 py-1.5 rounded border border-detective-border text-detective-muted hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-detective-crimson hover:bg-detective-alert text-white font-bold"
              >
                Save Role
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SQL Migration Setup Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-detective-panel border border-detective-border rounded p-6 max-w-2xl w-full font-mono text-xs space-y-4 shadow-2xl relative max-h-[85vh] flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-detective-crimson"></div>
            <div className="flex justify-between items-center border-b border-detective-border pb-2">
              <h3 className="text-sm font-bold uppercase text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-detective-crimson" /> Supabase SQL Functions Setup
              </h3>
              <button
                onClick={handleCopySql}
                className="flex items-center gap-1 bg-detective-crimson/20 hover:bg-detective-crimson text-white border border-detective-crimson/40 px-3 py-1 rounded text-xs font-bold transition-colors"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-detective-green" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}
              </button>
            </div>

            <p className="text-stone-300 text-[11px] leading-relaxed">
              If operator creation ever shows an RPC error, run this script once in your{' '}
              <strong className="text-white">Supabase Dashboard → SQL Editor</strong>. It provides secure server-side password hashing, direct user creation in <code className="text-detective-amber">auth.users</code>, and profile role linking.
            </p>

            <div className="flex-1 overflow-y-auto bg-black/70 p-3 rounded border border-detective-border text-[11px] text-stone-300 font-mono select-all">
              <pre>{SQL_MIGRATION_SNIPPET}</pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-detective-border/40">
              <button
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-1.5 rounded bg-black/40 hover:bg-black/60 border border-detective-border text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
