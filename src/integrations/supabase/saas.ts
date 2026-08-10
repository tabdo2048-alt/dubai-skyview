// Hand-written types + helpers for the multi-tenant SaaS tables/columns added by
// the Phase 1 migration (tenants, tenant_members, tenant_id, is_public).
//
// The generated `types.ts` does not know about these yet — regenerate it with
// `supabase gen types typescript` once the migration is applied and this file
// can be slimmed to just the domain types. Until then, `sbAny` is an untyped
// view of the client used ONLY for the new tables, and callers cast results to
// the types below.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled";
export type TenantRole = "owner" | "admin" | "member";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
};

export type TenantMember = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
};

// Subscription states that unlock the app.
export const ACTIVE_STATUSES: SubscriptionStatus[] = ["active", "past_due"];
export const isActiveStatus = (s: string | null | undefined): boolean =>
  !!s && (ACTIVE_STATUSES as string[]).includes(s);

// Untyped client view — use only for tables not yet in the generated Database
// type (tenants, tenant_members) and for tenant_id filters on existing tables.
export const sbAny = supabase as unknown as SupabaseClient;

// The tenant memberships of the current user, newest first, with the tenant row.
export async function fetchMyTenants(): Promise<Array<TenantMember & { tenant: Tenant }>> {
  const { data, error } = await sbAny
    .from("tenant_members")
    .select("*, tenant:tenants(*)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<TenantMember & { tenant: Tenant }>;
}
