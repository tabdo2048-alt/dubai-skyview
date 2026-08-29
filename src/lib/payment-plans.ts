import type { ProjectPaymentPlanInstallmentRow, ProjectPaymentPlanRow } from "@/lib/types";

export type DisplayPaymentPlan = Pick<
  ProjectPaymentPlanRow,
  "id" | "label" | "details" | "is_default" | "sort_order"
> & { installments: ProjectPaymentPlanInstallmentRow[] };

export function sortPaymentPlans(items: DisplayPaymentPlan[]): DisplayPaymentPlan[] {
  return [...items].sort((a, b) => {
    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (order) return order;
    return a.label.localeCompare(b.label);
  });
}

/**
 * The plans to show for a project. Falls back to the legacy single
 * projects.payment_plan column when a project has no plan rows yet — the same
 * shape as displayUnitTypes' fallback to starting_price_aed, so a project that
 * predates supabase/migrations/20260821000000_project_payment_plans.sql (or whose
 * backfill did not run) still shows the plan it always did.
 */
export function displayPaymentPlans(
  plans: DisplayPaymentPlan[] | null | undefined,
  legacyPlan: string | null | undefined,
): DisplayPaymentPlan[] {
  const sorted = sortPaymentPlans(plans ?? []);
  if (sorted.length) return sorted;
  const legacy = legacyPlan?.trim();
  if (!legacy) return [];
  return [{ id: "legacy-payment-plan", label: legacy, details: null, is_default: true, sort_order: 0, installments: [] }];
}

/**
 * What the collapsed tile reads. One plan shows its name; several show a count,
 * because the tile is a single truncating line and concatenating three plan names
 * into it would just render an ellipsis.
 */
export function paymentPlanSummary(plans: DisplayPaymentPlan[]): string {
  if (!plans.length) return "Flexible";
  if (plans.length === 1) return plans[0].label;
  return `${plans.length} plans`;
}

/**
 * What to write to the legacy projects.payment_plan column when saving plan rows.
 *
 * The column cannot just be left alone: the map popup and the project list read it
 * and never see the plan rows (PROJECT_LIST_SELECT deliberately omits
 * project_payment_plans, because naming a missing TABLE 400s the whole map),
 * and displayPaymentPlans uses it as the fallback. A stale value would show one
 * plan on the map and another on the project page.
 *
 * Cleared only when the admin removed rows that existed before. A project that
 * never had rows keeps its text: on a database where the migration has not been
 * applied there are no rows to have, and clearing would throw away the only copy.
 *
 * `next` is typed structurally rather than as DisplayPaymentPlan so the admin's
 * unsaved draft rows, which have no id yet, are accepted.
 */
export function legacyPaymentPlanValue(
  next: Array<{ label: string }>,
  previous: Array<{ id: string }>,
  current: string | null | undefined,
): string | null {
  const labels = next.map((plan) => plan.label.trim()).filter(Boolean);
  if (labels.length) return labels.join(" · ");
  if (previous.length) return null;
  const kept = current?.trim();
  return kept ? kept : null;
}
