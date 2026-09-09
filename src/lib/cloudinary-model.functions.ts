import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL_FOLDER_ROOT = "dubai-skyview/project-models";

type UploadSignatureInput = {
  tenantId: string;
};

/** Authorize a short-lived direct browser-to-Cloudinary GLB upload. */
export const createProjectModelUploadSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UploadSignatureInput) => {
    if (!input?.tenantId || !/^[0-9a-f-]{36}$/i.test(input.tenantId)) {
      throw new Error("A valid organization is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const [
      { data: membership, error: membershipError },
      { data: platformOwner, error: ownerError },
    ] = await Promise.all([
      supabase
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", data.tenantId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabase.rpc("current_user_is_platform_owner"),
    ]);

    const isTenantManager = membership?.role === "owner" || membership?.role === "admin";
    const ownerHelperMissing =
      ownerError?.code === "PGRST202" ||
      /schema cache|could not find the function/i.test(ownerError?.message ?? "");
    if (membershipError || (!isTenantManager && platformOwner !== true)) {
      if (membershipError || (ownerError && !ownerHelperMissing)) {
        console.error(
          "Could not verify project model upload access",
          membershipError ?? ownerError,
        );
      }
      throw new Error("Forbidden: project managers only");
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "3D model upload is not configured yet. Add the Cloudinary variables in Vercel.",
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = crypto.randomUUID();
    const folder = `${MODEL_FOLDER_ROOT}/${data.tenantId}`;
    const signedFields = {
      allowed_formats: "glb",
      folder,
      public_id: publicId,
      timestamp: String(timestamp),
    };
    const serialized = Object.entries(signedFields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${serialized}${apiSecret}`),
    );
    const signature = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return {
      cloudName,
      apiKey,
      signature,
      timestamp,
      folder,
      publicId,
      allowedFormats: "glb",
    };
  });
