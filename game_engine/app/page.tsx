import GameShell from "@/components/Game";
import Landing from "@/components/landing/Landing";
import { createClient } from "@/lib/supabase/server";

/**
 * ONE URL, TWO FRONT DOORS.
 *
 * A stranger gets the landing page. Anyone with a session gets the city picker
 * they came back for. Same address either way, so a shared link works for both
 * and nobody has to know which one to send.
 *
 * `getUser()` and not `getSession()`: the session cookie is whatever the
 * browser says it is, while `getUser()` is checked against Supabase. This only
 * decides which page renders, so the stakes are low — but the middleware makes
 * the same call for real access decisions and having the two disagree is the
 * kind of thing that is very confusing later.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <GameShell /> : <Landing />;
}
