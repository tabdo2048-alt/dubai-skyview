import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Block/unblock a user through both the app block list and Supabase Auth. */
export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; blocked: boolean }) => {
    if (!input?.userId || !UUID_RE.test(input.userId) || typeof input.blocked !== "boolean") {
      throw new Error("userId and blocked are required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // The SECURITY DEFINER RPC checks platform-admin access and the special
    // admin-vs-admin rule. The client cannot bypass those checks by changing the
    // request body.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error: blockError } = await sb.rpc("platform_set_user_blocked", {
      _uid: data.userId,
      _blocked: data.blocked,
    });
    if (blockError) throw blockError;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: data.blocked ? "876000h" : "none",
      });
      if (authError) throw authError;
    } catch (error) {
      // Keep the app block list and Auth ban in sync if the service-role update
      // is unavailable or fails.
      await sb.rpc("platform_set_user_blocked", {
        _uid: data.userId,
        _blocked: !data.blocked,
      });
      throw error;
    }

    return { blocked: data.blocked };
  });
