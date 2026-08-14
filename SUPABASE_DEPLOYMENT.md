# MYSTERY Y — Production Supabase Deployment & Setup Guide

This document provides step-by-step instructions to connect, configure, deploy, and verify the **MYSTERY Y Investigation Platform** with your live Supabase backend.

---

## 1. Environment Variables Configuration

Create or verify the `.env` file in the root directory:

```env
VITE_SUPABASE_URL=https://fsukaclvjbnfjfdrygku.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ **CRITICAL SECURITY RULES:**
> - Never hardcode Supabase keys in source code.
> - Never expose `service_role` key in frontend code or `.env`.
> - Keep `.env` out of version control (listed in `.gitignore`).

---

## 2. Database Schema Execution

1. Open your **Supabase Dashboard** → **SQL Editor**.
2. Create a **New Query**.
3. Copy and paste the complete content of [`supabase_schema.sql`](file:///d:/Zephoria%202026/MYSTERY%20Y/supabase_schema.sql).
4. Click **Run**.

This will:
- Enable the `uuid-ossp` extension.
- Create all 18 production tables (`profiles`, `events`, `cases`, `case_access_codes`, `teams`, `team_members`, `investigation_sessions`, `submissions`, `questions`, `question_options`, `question_rubrics`, `answers`, `draft_answers`, `security_logs`, `disciplinary_actions`, `admin_actions`, `event_settings`, `result_snapshots`).
- Create secure RPC functions (`register_team_transaction`, `begin_investigation_transaction`, `submit_investigation_transaction`, `finalize_results_transaction`, `is_admin`, `is_super_admin`).
- Enable Row Level Security (RLS) and apply strict policies on all tables.
- Insert initial seed data (Symposium 2026 event, Demo Case, 8 Access Codes).

---

## 3. Permanent Super Admin Account Setup

The permanent Super Admin account must be created in **Supabase Auth**:

1. Go to **Supabase Dashboard** → **Authentication** → **Users**.
2. Click **Add User** → **Create User**.
3. Enter:
   - **Email:** `vh13155_ml23@velhightech.com`
   - **Password:** Set your strong secure password
   - **Auto-Confirm User:** Checked (Yes)
4. After creation, click on the user to copy their **User UID**.
5. Ensure the User UID is: `13d593a7-1f40-4583-9979-9d9db465c320`

> *Note:* If Supabase auto-generates a different UUID, update the profile record in the SQL Editor:
> ```sql
> UPDATE public.profiles
> SET id = 'YOUR_ACTUAL_SUPABASE_AUTH_UUID'
> WHERE email = 'vh13155_ml23@velhightech.com';
> ```

---

## 4. Deploying the `create-admin` Edge Function

To enable secure administrator creation from the Super Admin dashboard without exposing `service_role` keys:

### Prerequisites
Install the Supabase CLI:
```bash
npm install -g supabase
```

### Deployment Steps
1. Log in to Supabase CLI:
   ```bash
   supabase login
   ```
2. Link your project:
   ```bash
   supabase link --project-ref fsukaclvjbnfjfdrygku
   ```
3. Set the service role secret for the Edge Function:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
4. Deploy the function:
   ```bash
   supabase functions deploy create-admin
   ```

---

## 5. Storage Bucket Configuration (Case Briefing Media)

1. Go to **Supabase Dashboard** → **Storage** → **Buckets**.
2. Click **New Bucket**.
3. Bucket Name: `case-briefings`
4. Public Bucket: **Enabled** (or set appropriate public SELECT policies).
5. File size limit: `50MB`
6. Allowed MIME types: `video/*, audio/*, image/*`

---

## 6. Realtime Configuration

Enable Realtime for live monitoring on the admin dashboard:

1. Go to **Supabase Dashboard** → **Database** → **Publications**.
2. Click on `supabase_realtime`.
3. Add the following tables to publication:
   - `security_logs`
   - `investigation_sessions`
   - `submissions`

---

## 7. Admin Roles Reference

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access. Manage administrators, cases, questions, access codes, teams, submissions, security logs, scoring, finalization, settings. |
| `evaluator` | View submissions, review answers, review AI scores, modify provisional scores, add grading notes, finalize scores if permitted. Cannot manage admins or change roles. |
| `coordinator` | Manage event/cases/questions/access codes/teams as permitted, view operational info, live monitors. Cannot manage admins. |
| `participant` | Investigation interface only. No admin access, no correct answers, no scores, no leaderboard. |

---

## 8. Verification Checklist

- [ ] `npm run build` compiles with 0 TypeScript/Vite errors.
- [ ] Admin login at `/admin/login` using `vh13155_ml23@velhightech.com` succeeds.
- [ ] Admin Management page displays permanent Super Admin account.
- [ ] Creating an evaluator via `create-admin` Edge Function generates Auth user and profile.
- [ ] Team registration at `/register` using code `MYSTERY-ALPHA-12` succeeds.
- [ ] Investigation timer starts at `00:00` (count-up) and survives page refresh.
- [ ] Draft answers auto-save to `draft_answers` table.
- [ ] Security violation (tab switch/blur) logs exactly 1 event to `security_logs`.
- [ ] Returning to tab does NOT log duplicate violation.
- [ ] 3rd violation locks session and displays warning overlay.
- [ ] Final submission calculates server-side duration and locks answers.
- [ ] Correct answers/scores are NEVER visible in Network tab/participant UI.
# Security-monitoring migration

Before deploying this release, run [20260814_security_monitoring.sql](supabase/migrations/20260814_security_monitoring.sql) in the project's Supabase SQL Editor. It installs the atomic `record_security_violation` RPC, locks a session on its third incident, and adds `security_logs` to Realtime. Do not use the old direct client `security_logs` insert path.
