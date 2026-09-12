import type { Session } from "@supabase/supabase-js";

export const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function decodeSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as {
      session_id?: unknown;
    };
    return typeof decoded.session_id === "string" && decoded.session_id ? decoded.session_id : null;
  } catch {
    return null;
  }
}

function sessionStorageKey(session: Session): string {
  return `dubai:session-started-at:${decodeSessionId(session.access_token) ?? session.user.id}`;
}

function fallbackStartTime(session: Session): number {
  const signedInAt = Date.parse(session.user.last_sign_in_at ?? "");
  return Number.isFinite(signedInAt) ? signedInAt : Date.now();
}

export function startSessionWindow(session: Session, startedAt = Date.now()): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(sessionStorageKey(session), String(startedAt));
}

export function getSessionExpiresAt(session: Session): number | null {
  if (typeof window === "undefined") return null;

  const key = sessionStorageKey(session);
  const stored = Number(window.localStorage.getItem(key));
  const startedAt = Number.isFinite(stored) && stored > 0 ? stored : fallbackStartTime(session);

  if (!(Number.isFinite(stored) && stored > 0)) {
    window.localStorage.setItem(key, String(startedAt));
  }

  return startedAt + MAX_SESSION_DURATION_MS;
}

export function clearSessionWindow(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionStorageKey(session));
}
