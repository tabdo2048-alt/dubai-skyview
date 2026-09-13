import { createFileRoute } from "@tanstack/react-router";

type DueTenant = { tenant_id: string };
type StorageEntry = { id?: string | null; name: string };

const STORAGE_BUCKET = "project-media";
const VIDEO_FOLDER_ROOT = "dubai-skyview/project-videos";
const MODEL_FOLDER_ROOT = "dubai-skyview/project-models";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function listStoragePaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: any,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const entries = (data ?? []) as StorageEntry[];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listStoragePaths(storage, path)));
    }
    if (entries.length < 100) break;
  }
  return paths;
}

async function deleteSupabaseMedia(tenantId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = supabaseAdmin.storage.from(STORAGE_BUCKET);
  const paths = await listStoragePaths(bucket, tenantId);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await bucket.remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
  return paths.length;
}

async function deleteCloudinaryPrefix(resourceType: "video" | "raw", prefix: string): Promise<number> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary deletion is not configured");
  }

  let deleted = 0;
  let nextCursor: string | undefined;
  do {
    const endpoint = new URL(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/${resourceType}/upload`,
    );
    endpoint.searchParams.set("prefix", prefix);
    endpoint.searchParams.set("invalidate", "true");
    if (nextCursor) endpoint.searchParams.set("next_cursor", nextCursor);

    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`,
      },
    });
    const body = (await response.json()) as {
      deleted?: Record<string, string>;
      next_cursor?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(body.error?.message ?? `Cloudinary deletion failed (${response.status})`);
    deleted += Object.keys(body.deleted ?? {}).length;
    nextCursor = body.next_cursor;
  } while (nextCursor);

  return deleted;
}

async function purgeTenant(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [storageCount, videoCount, modelCount] = await Promise.all([
    deleteSupabaseMedia(tenantId),
    deleteCloudinaryPrefix("video", `${VIDEO_FOLDER_ROOT}/${tenantId}/`),
    deleteCloudinaryPrefix("raw", `${MODEL_FOLDER_ROOT}/${tenantId}/`),
  ]);

  const { error: deleteError, count } = await supabaseAdmin
    .from("projects")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId);
  if (deleteError) throw deleteError;

  const { error: markError } = await supabaseAdmin.rpc("mark_tenant_data_purged", {
    _tenant: tenantId,
  });
  if (markError) throw markError;

  return {
    tenantId,
    projects: count ?? 0,
    storageObjects: storageCount,
    cloudinaryVideos: videoCount,
    cloudinaryModels: modelCount,
  };
}

export const Route = createFileRoute("/api/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("retention_tenants_due_for_purge", {
          _limit: 10,
        });
        if (error) {
          console.error("Could not list tenants due for data purge", error);
          return Response.json({ error: "Retention scan failed" }, { status: 500 });
        }

        const purged = [];
        const failed = [];
        for (const row of (data ?? []) as DueTenant[]) {
          try {
            purged.push(await purgeTenant(row.tenant_id));
          } catch (error) {
            console.error("Tenant data purge failed", row.tenant_id, error);
            failed.push(row.tenant_id);
          }
        }

        return Response.json({ scanned: (data ?? []).length, purged, failed }, {
          status: failed.length ? 207 : 200,
        });
      },
    },
  },
});
