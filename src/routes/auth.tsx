import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sbAny, isCurrentUserBlocked, fetchMyTenants, canAccessTenant } from "@/integrations/supabase/saas";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const BLOCKED_MESSAGE = "أنت محظور من دخول الموقع.";
const SUBSCRIPTION_ENDED_MESSAGE = "Your subscription has ended. Sign in to renew it.";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Dubai Residences" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Set by the _authenticated guard when it signs a blocked session out, so the
  // reason survives the redirect back to this page.
  const [blockedNotice, setBlockedNotice] = useState(false);
  // Same idea for a subscription that ran out: the guard signs the session out,
  // this explains why.
  const [endedNotice, setEndedNotice] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("dubai:blocked")) {
      sessionStorage.removeItem("dubai:blocked");
      setBlockedNotice(true);
    }
    if (sessionStorage.getItem("dubai:subscription-ended")) {
      sessionStorage.removeItem("dubai:subscription-ended");
      setEndedNotice(true);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error: rlErr } = await sbAny.rpc("check_login_rate");
      if (rlErr) {
        toast.error("Too many failed attempts from your network. Try again in 5 minutes.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // A blocked account also carries a Supabase Auth ban, so Auth rejects it
        // before any RPC runs. Report the block, not "invalid credentials".
        if (/banned|blocked/i.test(error.message)) throw new Error(BLOCKED_MESSAGE);
        await sbAny.rpc("record_login_failure", { _email: email });
        throw error;
      }

      // Second gate for a block applied while a session already existed. Tolerates
      // the RPC being absent (see isCurrentUserBlocked) so an unapplied migration
      // cannot lock everyone out; any other failure signs the session back out.
      if (await isCurrentUserBlocked()) {
        await supabase.auth.signOut();
        throw new Error(BLOCKED_MESSAGE);
      }

      toast.success("Welcome back.");
      // Land a lapsed account on the pay page instead of /admin. The guard on
      // /admin signs an account with no live subscription straight back out, so
      // sending them there would bounce them to /auth and they could never reach
      // checkout to renew. Any failure here falls through to /admin, where the
      // guard decides — never a silent unlock.
      try {
        const mine = await fetchMyTenants();
        if (!mine.some((m) => canAccessTenant(m.tenant))) {
          navigate({ to: "/billing" });
          return;
        }
      } catch {
        /* fall through to /admin and let the guard rule */
      }
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto grid max-w-md px-4 py-16">
        <div className="glass-strong gold-hairline rounded-3xl p-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</div>
          <h1 className="mt-1 font-display text-4xl text-cream"><span className="text-gold-gradient">KEYORA</span></h1>
          {blockedNotice && (
            <div role="alert" className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {BLOCKED_MESSAGE}
            </div>
          )}
          {endedNotice && (
            <div role="alert" className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-3 text-sm text-cream">
              {SUBSCRIPTION_ENDED_MESSAGE}
            </div>
          )}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" className="text-cream">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="glass gold-hairline mt-1 text-cream" />
            </div>
            <div>
              <Label htmlFor="password" className="text-cream">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="glass gold-hairline mt-1 text-cream" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
              {loading ? "Please wait…" : "KEYORA"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
