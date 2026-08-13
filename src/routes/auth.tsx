import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/integrations/supabase/saas";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Dubai Residences" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error: rlErr } = await sbAny.rpc("check_login_rate");
      if (rlErr) {
        toast.error("Too many failed attempts from your network. Try again in about an hour.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        await sbAny.rpc("record_login_failure", { _email: email });
        throw error;
      }
      toast.success("Welcome back.");
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
