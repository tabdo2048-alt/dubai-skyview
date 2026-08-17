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
  suspended?: boolean | null;
  created_at: string;
};

// One row of the platform-admin subscribers table.
export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  subscription_status: SubscriptionStatus;
  plan: string | null;
  suspended: boolean;
  current_period_end: string | null;
  created_at: string;
  owner_email: string | null;
  project_count: number;
  // True when a platform administrator belongs to this org.
  has_platform_admin?: boolean;
  // Only the designated platform owner can suspend an org containing admins.
  can_suspend_platform_admins?: boolean;
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

// A tenant grants access only if its subscription is active AND it is not
// suspended by a platform admin.
export const canAccessTenant = (t: { subscription_status: string; suspended?: boolean | null }): boolean =>
  isActiveStatus(t.subscription_status) && !t.suspended;

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

// Platform-admin: every subscriber org (SECURITY DEFINER RPC gates on has_role).
export async function fetchPlatformTenants(): Promise<PlatformTenant[]> {
  const { data, error } = await sbAny.rpc("platform_list_tenants");
  if (error) throw error;
  return (data ?? []) as PlatformTenant[];
}

// Platform-admin: suspend / unsuspend a subscriber.
export async function setTenantSuspended(tenantId: string, suspended: boolean): Promise<void> {
  const { error } = await sbAny.rpc("platform_set_suspended", { _tenant: tenantId, _suspended: suspended });
  if (error) throw error;
}

// One row of the platform-admin users table (every auth account).
export type PlatformUser = {
  user_id: string;
  email: string | null;
  created_at: string;
  is_platform_admin: boolean;
  orgs: string | null;
  org_roles: string | null;
  blocked: boolean;
  can_block_platform_admins?: boolean;
  // Subscription of the org granting this user access the longest (see
  // supabase/migrations/20260817001000_platform_users_subscription_period.sql).
  // Optional: absent until that migration is applied, so the UI must tolerate
  // undefined rather than render a blank period.
  subscription_status?: SubscriptionStatus | null;
  current_period_end?: string | null;
};

// Platform-admin: every user account with their org membership.
export async function fetchPlatformUsers(): Promise<PlatformUser[]> {
  const { data, error } = await sbAny.rpc("platform_list_users");
  if (error) throw error;
  return (data ?? []) as PlatformUser[];
}

// PostgREST's code for "function not found in the schema cache" — i.e. the
// account-block SQL (supabase/APPLY_THIS_4.sql) has not been applied yet.
// In that state the user_blocks table does not exist, so NOBODY is blocked and
// "not blocked" is the correct answer. This matters because the check runs on
// the login path: failing closed on a missing function locked EVERY account out,
// not just blocked ones. Any other error still fails closed.
//
// The message is matched as well as the code, because the code has moved between
// PostgREST versions and a miss here means nobody can sign in. A permission error
// (42501) is deliberately NOT tolerated: that means the function exists but the
// grant is wrong, which is a real misconfiguration, not an uninstalled feature.
function isMissingFunction(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string };
  return e.code === "PGRST202" || /schema cache|could not find the function/i.test(e.message ?? "");
}

export async function isCurrentUserBlocked(): Promise<boolean> {
  const { data, error } = await sbAny.rpc("is_current_user_blocked");
  if (error) {
    if (isMissingFunction(error)) return false;
    throw error;
  }
  return Boolean(data);
}

// Platform-admin: permanently delete a user + the orgs they own (auth + data).
// The RPC refuses to delete a platform admin or the caller.
export async function deletePlatformUser(userId: string): Promise<void> {
  const { error } = await sbAny.rpc("platform_delete_user", { _uid: userId });
  if (error) throw error;
}
