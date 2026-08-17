// Presentation for a tenant's subscription period. Shared by the platform
// subscribers list, the platform users list, the navbar chip and the billing
// page so all four read the same way.
//
// `current_period_end` is written solely by the Stripe webhook, never the
// client. A NULL period on an otherwise active tenant therefore means the org
// was never put on a Stripe clock at all — the seeded "Default Organization"
// is the case that matters — so its access does not expire. That is reported
// as "Unlimited" rather than left blank, because blank is indistinguishable
// from "data still loading".
import { isActiveStatus } from "@/integrations/supabase/saas";

export type PeriodDisplay = {
  // Short text for the pill, e.g. "Ends 12 Sep 2026" or "Unlimited".
  label: string;
  // Secondary text, e.g. "27 days left". Null when there is nothing to add.
  detail: string | null;
  // Tailwind text colour conveying urgency.
  cls: string;
  // Native tooltip with the unabbreviated value.
  title: string;
};

const MS_PER_DAY = 86_400_000;

// Midnight-anchored so "ends today" does not flip to "ended" partway through
// the final day, which a raw millisecond comparison would do.
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function formatSubscriptionPeriod(
  periodEnd: string | null | undefined,
  status?: string | null,
  options?: { suspended?: boolean | null },
): PeriodDisplay | null {
  if (options?.suspended) {
    return {
      label: "Suspended",
      detail: null,
      cls: "text-destructive",
      title: "Access is suspended by a platform administrator",
    };
  }

  if (!periodEnd) {
    // Only an active org without a period is genuinely open-ended. An
    // incomplete or canceled one has simply never had a period, which is not
    // the same thing and must not read as unlimited.
    if (isActiveStatus(status)) {
      return {
        label: "Unlimited",
        detail: null,
        cls: "text-emerald-400",
        title: "No billing period end — this organization's access does not expire",
      };
    }
    return null;
  }

  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return null;

  const day = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const daysLeft = Math.round((startOfDay(end) - startOfDay(new Date())) / MS_PER_DAY);
  const title = `Subscription period ends ${end.toLocaleString()}`;

  if (daysLeft < 0) {
    return { label: `Ended ${day}`, detail: null, cls: "text-destructive", title };
  }
  if (daysLeft === 0) {
    return { label: `Ends today, ${day}`, detail: null, cls: "text-amber-400", title };
  }
  return {
    label: `Ends ${day}`,
    detail: `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    // Flag the final week so an imminent lapse stands out from a distant one.
    cls: daysLeft <= 7 ? "text-amber-400" : "text-muted-foreground",
    title,
  };
}
