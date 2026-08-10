import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/integrations/supabase/saas";
import { createCheckoutSession } from "@/lib/billing.functions";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Dubai SkyView" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1) Create the auth user, then ensure we have a session (email confirmation
      //    must be disabled in Supabase Auth for the immediate-checkout flow).
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (!signUp.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          throw new Error("Account created — please confirm your email, then sign in to finish payment.");
        }
      }

      // 2) Create the organization (owner = this user) via the SECURITY DEFINER RPC.
      const { data: tenantId, error: rpcError } = await sbAny.rpc("create_tenant_for_owner", {
        _name: org,
      });
      if (rpcError || !tenantId) throw rpcError ?? new Error("Could not create organization");

      // 3) Start Stripe Checkout and hand off to the hosted payment page.
      const { url } = await createCheckoutSession({ data: { tenantId: tenantId as string, period } });
      if (!url) throw new Error("Could not start checkout");
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto grid max-w-md px-4 py-16">
        <div className="glass-strong gold-hairline rounded-3xl p-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Get started</div>
          <h1 className="mt-1 font-display text-4xl text-cream">
            Create your <span className="text-gold-gradient">workspace</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            100 AED / {period === "month" ? "month" : "year"} — billed securely by Stripe.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="org" className="text-cream">Organization name</Label>
              <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} required
                className="glass gold-hairline mt-1 text-cream" placeholder="Acme Real Estate" />
            </div>
            <div>
              <Label htmlFor="email" className="text-cream">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="glass gold-hairline mt-1 text-cream" />
            </div>
            <div>
              <Label htmlFor="password" className="text-cream">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} className="glass gold-hairline mt-1 text-cream" />
            </div>

            <div>
              <Label className="text-cream">Billing period</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["month", "year"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={`glass gold-hairline rounded-xl px-3 py-2 text-sm transition ${
                      period === p ? "ring-2 ring-gold text-gold" : "text-cream hover:text-gold"
                    }`}>
                    {p === "month" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={loading} className="shimmer w-full bg-gold text-gold-foreground hover:bg-gold/90">
              {loading ? "Please wait…" : "Continue to payment"}
            </Button>
          </form>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account? <Link to="/auth" className="text-gold hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
