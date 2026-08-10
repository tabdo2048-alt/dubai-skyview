import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Content-Security-Policy: allow only the origins the app genuinely needs.
// Mapbox GL uses Web Workers from blob: URLs and fetches tiles/styles from
// api.mapbox.com + telemetry to events.mapbox.com; Supabase REST/Realtime/Storage
// live on *.supabase.co (+ wss). Google Maps embed/static is allowed for the
// admin link tooling. Styles are inline (Tailwind + injected <style>), so
// 'unsafe-inline' is required for style-src; script stays self + inline for the
// SSR hydration bootstrap.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.mapbox.com https://*.googleapis.com https://*.gstatic.com https://*.google.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://*.googleapis.com https://*.google.com",
  "manifest-src 'self'",
].join("; ");

// Apply hardening headers to every response. Runs around the error middleware so
// even the fallback error page carries them.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();
  const res = response instanceof Response ? response : undefined;
  if (!res) return response;
  const h = res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=()");
  // Only advertise CSP on HTML documents (avoids constraining API/asset responses
  // that set their own content types).
  const ct = h.get("content-type") ?? "";
  if (ct.includes("text/html")) h.set("Content-Security-Policy", CSP);
  if (process.env.NODE_ENV === "production") {
    h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
});

// CSRF protection for same-origin server-function RPC endpoints.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware, errorMiddleware],
}));
