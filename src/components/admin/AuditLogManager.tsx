import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { sbAny } from "@/integrations/supabase/saas";
import { Button } from "@/components/ui/button";

type AuditRow = {
  id: string;
  event_type: "login" | "project_created";
  actor_email: string | null;
  tenant_id: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function eventLabel(row: AuditRow): string {
  if (row.event_type === "login") return "Signed in";
  const projectName = row.metadata?.project_name;
  return typeof projectName === "string" && projectName
    ? `Created project “${projectName}”`
    : "Created a project";
}

export function AuditLogManager({ canView }: { canView: boolean }) {
  const query = useQuery({
    queryKey: ["platform-audit-log"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await sbAny
        .from("audit_logs")
        .select("id,event_type,actor_email,tenant_id,project_id,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  if (!canView) return null;

  return (
    <section className="glass gold-hairline mt-8 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-cream">Activity log</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest sign-ins and project creation events.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {query.isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-5 text-sm text-destructive">Could not load the activity log.</div>
      ) : query.data?.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Event</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-cream">{row.actor_email ?? "Unknown user"}</td>
                  <td className="px-3 py-3 text-cream">{eventLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">No activity has been recorded yet.</p>
      )}
    </section>
  );
}
