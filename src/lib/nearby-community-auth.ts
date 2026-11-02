import { supabase, supabaseAdminSession } from "@/lib/db/router";
import { SCAN_SESSION_EXPIRED_MSG } from "@/lib/nearby-scan-errors";
/** Keep the imported separate admin and member sessions; server verifies the bearer. */
export async function scanAuthHeaders(admin = false): Promise<HeadersInit> {
  const client = admin ? supabaseAdminSession : supabase;
  let { data } = await client.auth.getSession();
  // A token about to expire is refreshed first so the server never sees a stale bearer.
  const exp = data.session?.expires_at ?? 0;
  if (data.session && exp * 1000 - Date.now() < 60_000) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.data.session) data = { session: refreshed.data.session };
  }
  const access = data.session?.access_token;
  if (!access) throw new Error(SCAN_SESSION_EXPIRED_MSG);
  return { Authorization: `Bearer ${access}` };
}
