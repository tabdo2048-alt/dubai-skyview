// Supabase Edge Function: resolve a Google Maps link to { lat, lng }.
//
// The admin "Google Maps link" field parses full URLs client-side, but SHORT
// links (maps.app.goo.gl / goo.gl/maps) only reveal their coordinates after
// following a redirect — which the browser can't read cross-origin. This runs
// server-side (no CORS limit), follows the redirect, and extracts lat/lng.
//
// SECURITY: the caller-supplied URL is fetched server-side, so it is a classic
// SSRF sink. Every URL (the input AND every redirect hop) is validated against a
// Google-only host allowlist and rejected if it points at a private/loopback/
// link-local address, before any request is made. Redirects are followed
// manually (max 5) so a shortlink can't 302 into an internal host. The response
// body read is size-capped and the whole flow is time-bounded.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Google map/shortlink hosts we are willing to fetch. Exact host match only.
const ALLOWED_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
]);

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB cap on the parsed HTML

// Restrict CORS to the app origins. Extend via ALLOWED_ORIGINS (comma-separated)
// in the function's environment; falls back to a safe default set.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://dubai-skyview.vercel.app,http://localhost:8080,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// True for hostnames that resolve to a literal private / loopback / link-local
// address. DNS-based hosts are additionally constrained by the allowlist, so
// this only needs to catch IP-literal inputs.
function isPrivateHostLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost") return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true; // private / loopback / this-host
  if (a === 169 && b === 254) return true; // link-local (cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

// A URL is fetchable only if it is https/http, its host is on the allowlist, and
// it is not a private/loopback/link-local literal.
function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (isPrivateHostLiteral(host)) return false;
  return ALLOWED_HOSTS.has(host);
}

async function authenticated(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!match || !supabaseUrl || !supabaseKey) return false;

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  return !error && Boolean(data.user);
}

function parseLatLng(url: string): { lat: number; lng: number } | null {
  const inRange = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const tries: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|sll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i,
  ];
  for (const re of tries) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inRange(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// Manually follow redirects (max MAX_REDIRECTS), re-validating the host at every
// hop so a shortlink cannot bounce the request into a disallowed/internal host.
// Returns the final response + its URL, or null if any hop is disallowed.
async function safeFollow(
  startUrl: string,
  signal: AbortSignal,
): Promise<{ finalUrl: string; body: string } | null> {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isAllowedUrl(current)) return null;
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal,
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      // Resolve relative redirects against the current URL, then re-validate.
      current = new URL(loc, current).toString();
      continue;
    }
    // Terminal response — read a size-capped slice of the body.
    const buf = new Uint8Array(MAX_BODY_BYTES);
    let read = 0;
    const reader = res.body?.getReader();
    if (reader) {
      while (read < MAX_BODY_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const take = Math.min(value.length, MAX_BODY_BYTES - read);
        buf.set(value.subarray(0, take), read);
        read += take;
      }
      await reader.cancel().catch(() => {});
    }
    const body = new TextDecoder().decode(buf.subarray(0, read));
    return { finalUrl: res.url || current, body };
  }
  return null; // too many redirects
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!(await authenticated(req))) return json({ error: "unauthorized" }, 401);

  try {
    const { url } = await req.json().catch(() => ({ url: undefined }));
    if (typeof url !== "string" || !url.trim()) return json({ error: "url required" }, 400);

    // Fast path: coordinates already present in the provided string (no fetch).
    let coords = parseLatLng(url);

    if (!coords) {
      if (!isAllowedUrl(url)) {
        return json({ error: "only Google Maps links are supported" }, 400);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const followed = await safeFollow(url, controller.signal);
        if (followed) {
          coords = parseLatLng(followed.finalUrl) ?? parseLatLng(followed.body);
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (!coords) return json({ error: "no coordinates found in link" }, 422);
    return json(coords, 200);
  } catch {
    // Generic message — never leak internal error detail to the caller.
    return json({ error: "failed to resolve link" }, 500);
  }
});
