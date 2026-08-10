import { createFileRoute, Link } from "@tanstack/react-router";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/billing/cancel")({
  ssr: false,
  head: () => ({ meta: [{ title: "Checkout canceled — Dubai SkyView" }] }),
  component: BillingCancelPage,
});

function BillingCancelPage() {
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto grid max-w-md place-items-center px-4 py-24 text-center">
        <div className="glass-strong gold-hairline rounded-3xl p-8">
          <h1 className="font-display text-2xl text-cream">Checkout canceled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No payment was taken. You can subscribe whenever you're ready.
          </p>
          <Button asChild className="mt-6 bg-gold text-gold-foreground hover:bg-gold/90">
            <Link to="/billing">Back to subscribe</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
