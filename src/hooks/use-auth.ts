import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { clearSessionWindow, getSessionExpiresAt } from "@/lib/auth-session";

const SESSION_EXPIRED_NOTICE_KEY = "dubai:session-expired";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;

    const expiresAt = getSessionExpiresAt(session);
    if (expiresAt == null) return;

    const expire = () => {
      window.sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, "1");
      clearSessionWindow(session);
      setSession(null);
      void supabase.auth.signOut({ scope: "local" });
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }

    const timeout = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeout);
  }, [session]);

  return { session, user: session?.user ?? null as User | null, ready };
}

export function useIsAdmin(user: User | null) {
  return useQuery({
    queryKey: ["is-admin", user?.id ?? "none"],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
}
