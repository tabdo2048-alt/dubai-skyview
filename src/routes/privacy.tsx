import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { CONTACT_EMAIL, CONTACT_WHATSAPP } from "@/lib/contact";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — KEYORA" },
      {
        name: "description",
        content: "How KEYORA collects, uses, protects, and retains personal data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNavbar />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <div className="glass-strong gold-hairline rounded-3xl p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-gold">Legal</p>
          <h1 className="mt-3 font-display text-4xl text-cream">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: 20 September 2026</p>

          <div className="mt-9 space-y-8 text-sm leading-7 text-cream/80">
            <PolicySection title="1. Who we are">
              KEYORA is a digital real-estate platform used to present projects, units, maps,
              documents, and virtual tours. The KEYORA platform operator acts as the controller for
              platform account and operational data. Organizations using KEYORA may also control the
              property and customer information they add to their workspace.
            </PolicySection>

            <PolicySection title="2. Data we collect">
              We may process account details such as name and email, organization membership and
              roles, project and unit content uploaded by authorized users, subscription and billing
              status, activity and security logs, and technical information needed to operate and
              protect the service. Card details are handled by Stripe and are not stored by KEYORA.
            </PolicySection>

            <PolicySection title="3. Why we use data">
              We use data to authenticate users, provide tenant-isolated workspaces, publish
              property content, generate requested documents, manage subscriptions, prevent abuse,
              investigate security events, maintain backups, and comply with applicable legal
              obligations.
            </PolicySection>

            <PolicySection title="4. Service providers and international processing">
              We use vetted infrastructure and service providers where needed, including Supabase
              for database, authentication, and private media storage; Vercel for hosting; Stripe
              for billing; Cloudinary for configured project media; and mapping services from
              Mapbox, Google, and Cesium. Analytics is used only when configured. These providers
              may process data outside Egypt or the UAE under their contractual and security
              safeguards.
            </PolicySection>

            <PolicySection title="5. Retention">
              Account and workspace data is kept while the service is active and as needed for the
              purposes above. When a paid tenant expires, the platform provides a ten-day warning
              and grace period before its scheduled workspace deletion process. Some records may be
              kept longer where required for fraud prevention, security, accounting, dispute
              resolution, or legal compliance.
            </PolicySection>

            <PolicySection title="6. Your choices and rights">
              Subject to applicable law, including Egypt&apos;s Personal Data Protection Law
              151/2020, you may request access, correction, deletion, restriction, or objection
              concerning your personal data, and may withdraw consent where consent is the legal
              basis. We may need to verify your identity before completing a request.
            </PolicySection>

            <PolicySection title="7. Security">
              We use access controls, tenant isolation, row-level security, private storage with
              signed access, encrypted transport, session limits, and activity logging. No online
              service can guarantee absolute security; please report suspected unauthorized access
              promptly.
            </PolicySection>

            <PolicySection title="8. Contact">
              <span>
                For privacy questions or data-rights requests, contact the KEYORA operator
              </span>
              {CONTACT_EMAIL ? (
                <>
                  {" at "}
                  <a
                    className="text-gold underline-offset-4 hover:underline"
                    href={`mailto:${CONTACT_EMAIL}`}
                  >
                    {CONTACT_EMAIL}
                  </a>
                </>
              ) : CONTACT_WHATSAPP ? (
                <>
                  {" through "}
                  <a
                    className="text-gold underline-offset-4 hover:underline"
                    href={`https://wa.me/${CONTACT_WHATSAPP}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    the published WhatsApp contact
                  </a>
                </>
              ) : (
                <> through the contact channel shown on the relevant property page</>
              )}
              .
            </PolicySection>

            <PolicySection title="9. Changes to this policy">
              We may update this notice when the platform, providers, or legal requirements change.
              The current version and its effective date will always be published on this page.
            </PolicySection>
          </div>

          <div className="mt-10 border-t border-white/10 pt-6">
            <Link to="/" className="text-sm font-medium text-gold hover:underline">
              Return to the map
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl text-cream">{title}</h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
