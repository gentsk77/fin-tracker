import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Bypasses RLS.**
 *
 * Use this ONLY in trusted server-side code, and only for:
 *   - shared reference data that isn't owned by a single user (e.g. the
 *     `securities` table, which every user's holdings point at), or
 *   - sync/maintenance writes that are already explicitly scoped by `user_id`
 *     in application code.
 *
 * It relies on `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_` prefix), so the key is
 * never shipped to the browser. Never import this from a Client Component.
 *
 * Why this exists: `securities` has RLS enabled with no policy for the
 * `authenticated` role, so the signed-in user (which `createClient()` runs as)
 * can neither read nor insert securities. Securities are global reference
 * data, so reading/writing them with the service role is the correct model;
 * per-user `holdings` stay on the user-scoped client where RLS applies.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
