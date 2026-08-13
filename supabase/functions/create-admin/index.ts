// supabase/functions/create-admin/index.ts
// MYSTERY Y — Secure Admin Creation Edge Function
// Deploy with: supabase functions deploy create-admin
//
// Required environment variables (Supabase Dashboard → Project Settings → Edge Functions → Secrets):
//   SUPABASE_URL              - Auto-provided
//   SUPABASE_ANON_KEY         - Auto-provided
//   SUPABASE_SERVICE_ROLE_KEY - Set manually; NEVER expose in frontend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPER_ADMIN_UUID = '13d593a7-1f40-4583-9979-9d9db465c320';
const SUPER_ADMIN_EMAIL = 'vh13155_ml23@velhightech.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'MISSING_AUTHORIZATION: No valid JWT provided.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '');
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user: requestingUser }, error: userError } = await supabaseAnon.auth.getUser();
    if (userError || !requestingUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHORIZED: Invalid or expired session.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (requestingUser.id !== SUPER_ADMIN_UUID || requestingUser.email !== SUPER_ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ success: false, error: 'ACCESS_DENIED: Only the Super Admin may create administrator accounts.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: requesterProfile, error: profileErr } = await supabaseAnon
      .from('profiles')
      .select('role, status')
      .eq('id', requestingUser.id)
      .single();

    if (profileErr || !requesterProfile || requesterProfile.role !== 'super_admin' || requesterProfile.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'ACCESS_DENIED: Super Admin profile not found or inactive.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { email, name, role, temporaryPassword } = body;

    if (!email || !name || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'VALIDATION: email, name, and role are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (role === 'super_admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'ACCESS_DENIED: Cannot create another Super Admin account.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['evaluator', 'coordinator'].includes(role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'VALIDATION: Role must be evaluator or coordinator.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (email.toLowerCase().trim() === SUPER_ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ success: false, error: 'ACCESS_DENIED: Cannot duplicate the permanent Super Admin email.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const tempPassword = temporaryPassword?.trim() ||
      `Myst${Math.random().toString(36).slice(2, 8).toUpperCase()}!${Math.floor(Math.random() * 9000) + 1000}`;

    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: name.trim(), role },
    });

    if (createError) {
      if (createError.message.includes('already been registered') || createError.message.includes('already exists')) {
        return new Response(
          JSON.stringify({ success: false, error: `EMAIL_EXISTS: An account with this email already exists.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: `AUTH_ERROR: ${createError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newUserId = newAuthUser.user.id;

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role,
        status: 'active',
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileUpsertError) {
      console.error('Profile upsert failed:', profileUpsertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `AUTH_USER_CREATED_BUT_PROFILE_FAILED: ${profileUpsertError.message}. Auth user ID: ${newUserId}.`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabaseAdmin.from('admin_actions').insert({
      admin_id: SUPER_ADMIN_UUID,
      action_type: 'ADMIN_CREATED',
      details: { created_email: email.toLowerCase().trim(), created_role: role, created_name: name.trim(), new_user_id: newUserId },
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        email: email.toLowerCase().trim(),
        role,
        name: name.trim(),
        temporary_password: tempPassword,
        message: 'Admin account created successfully.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: `SERVER_ERROR: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
