import { useEffect, useState } from "react";
import { Ban, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_OWNER_EMAIL } from "@/lib/platform-owner";
import { Button } from "@/components/ui/button";
import {
  deletePlatformUser,
  fetchPlatformTenants,
  fetchPlatformUsers,
  isActiveStatus,
  setTenantSuspended,
  type PlatformTenant,
  type PlatformUser,
} from "@/integrations/supabase/saas";
import { setUserBlocked } from "@/lib/user-security.functions";
import { formatSubscriptionPeriod } from "@/lib/subscription-period";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function SubscribersManager({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await fetchPlatformTenants()); }
    catch (error) { toast.error(errorMessage(error, "Could not load subscribers")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggleSuspend(tenant: PlatformTenant) {
    if (!canManage) return;
    setBusyId(tenant.id);
    try {
      await setTenantSuspended(tenant.id, !tenant.suspended);
      toast.success(tenant.suspended ? "Subscriber re-enabled" : "Subscriber suspended");
      await load();
    } catch (error) { toast.error(errorMessage(error, "Action failed")); }
    finally { setBusyId(null); }
  }

  return <div id="admin-subscribers" className="mt-10 scroll-mt-24">
    <h2 className="font-display text-3xl text-cream">Subscribers</h2>
    <p className="mt-1 text-sm text-muted-foreground">{rows.length} organization{rows.length === 1 ? "" : "s"}</p>
    <div className="mt-4 grid gap-2">
      {loading ? <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div> : null}
      {!loading && rows.length === 0 ? <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">No subscribers yet.</div> : null}
      {rows.map(tenant => {
        const status = tenant.suspended
          ? { label: "Suspended", className: "text-destructive" }
          : isActiveStatus(tenant.subscription_status)
            ? { label: "Active", className: "text-emerald-400" }
            : { label: tenant.subscription_status, className: "text-muted-foreground" };
        const period = formatSubscriptionPeriod(tenant.current_period_end, tenant.subscription_status);
        return <div key={tenant.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="truncate font-display text-lg text-cream">{tenant.name}</span>
              {period ? <span title={period.title} className={`glass gold-hairline shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-tight ${period.cls}`}>{period.label}{period.detail ? ` · ${period.detail}` : ""}</span> : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">{tenant.owner_email ?? "—"} · {tenant.project_count} project{tenant.project_count === 1 ? "" : "s"}{tenant.plan ? ` · ${tenant.plan}` : ""}</div>
          </div>
          <span className={`text-xs font-medium ${status.className}`}>{status.label}</span>
          {tenant.has_platform_admin ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Shield className="h-3.5 w-3.5" /> Platform admin</span> : null}
          {canManage ? <Button size="sm" variant="outline" disabled={busyId === tenant.id} onClick={() => void toggleSuspend(tenant)} className="glass gold-hairline text-cream"><Ban className="mr-1 h-3.5 w-3.5" />{tenant.suspended ? "Unsuspend" : "Suspend"}</Button> : null}
        </div>;
      })}
    </div>
  </div>;
}

export function UsersManager({
  canManage,
  currentUserId,
}: {
  canManage: boolean;
  currentUserId: string | null;
}) {
  const [rows, setRows] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await fetchPlatformUsers()); }
    catch (error) { toast.error(errorMessage(error, "Could not load users")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function toggleBlock(user: PlatformUser) {
    if (!canManage) return;
    setBusyId(user.user_id);
    try {
      await setUserBlocked({ data: { userId: user.user_id, blocked: !user.blocked } });
      toast.success(user.blocked ? "User unblocked" : "User blocked");
      await load();
    } catch (error) { toast.error(errorMessage(error, "Could not change user access")); }
    finally { setBusyId(null); }
  }

  async function remove(user: PlatformUser) {
    if (!canManage || !confirm(`Permanently delete ${user.email ?? "this user"} and the organizations they own? This cannot be undone.`)) return;
    setBusyId(user.user_id);
    try { await deletePlatformUser(user.user_id); toast.success("User removed"); await load(); }
    catch (error) { toast.error(errorMessage(error, "Delete failed")); }
    finally { setBusyId(null); }
  }

  // Defense in depth: the RPC applies this rule server-side too. Keeping the
  // UI filter prevents stale/cached data from exposing another admin account.
  const visibleRows = rows.filter(
    (row) => canManage || !row.is_platform_admin || row.user_id === currentUserId,
  );

  return <div id="admin-users" className="mt-10 scroll-mt-24">
    <h2 className="font-display text-3xl text-cream">Users</h2>
    <p className="mt-1 text-sm text-muted-foreground">{visibleRows.length} account{visibleRows.length === 1 ? "" : "s"}</p>
    <div className="mt-4 grid gap-2">
      {loading ? <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div> : null}
      {!loading && visibleRows.length === 0 ? <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">No users.</div> : null}
      {visibleRows.map(user => {
        const period = formatSubscriptionPeriod(user.current_period_end, user.subscription_status, { lifetime: user.is_platform_admin });
        return <div key={user.user_id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1"><span className="truncate font-display text-lg text-cream">{user.email ?? "—"}</span>{period ? <span title={period.title} className={`glass gold-hairline shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-tight ${period.cls}`}>{period.label}{period.detail ? ` · ${period.detail}` : ""}</span> : null}</div>
            <div className="truncate text-xs text-muted-foreground">{user.orgs ? `${user.orgs} (${user.org_roles ?? "member"})` : "no organization"}</div>
          </div>
          {user.blocked ? <span className="rounded-full border border-destructive/50 px-2.5 py-1 text-xs text-destructive">Blocked</span> : null}
          {user.is_platform_admin ? <span className="glass gold-hairline rounded-full px-2.5 py-1 text-xs text-gold">Platform admin</span> : null}
          {canManage && !user.is_platform_admin ? <Button size="sm" variant="outline" disabled={busyId === user.user_id} onClick={() => void remove(user)} className="glass gold-hairline text-destructive"><Trash2 className="mr-1 h-3.5 w-3.5" /> Remove</Button> : null}
          {canManage ? <Button size="sm" variant="outline" disabled={busyId === user.user_id || user.email?.trim().toLowerCase() === PLATFORM_OWNER_EMAIL || user.blocked === undefined} onClick={() => void toggleBlock(user)} className="glass gold-hairline text-destructive"><Ban className="mr-1 h-3.5 w-3.5" /> {user.blocked ? "Unblock" : "Block"}</Button> : null}
        </div>;
      })}
    </div>
  </div>;
}
