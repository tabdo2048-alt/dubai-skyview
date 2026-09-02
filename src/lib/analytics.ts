// Lightweight analytics wrapper. Real-estate conversion tracking without coupling
// the app to a specific vendor: events flow to GA4 (gtag) when VITE_GA_ID is set,
// and are no-ops (dev console only) otherwise. Set VITE_GA_ID in .env to enable.

export const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
export const ANALYTICS_ENABLED = !!GA_ID;

type Params = Record<string, unknown>;

/**
 * Fire a tracked event. Safe to call anywhere (SSR-guarded, no-op without a
 * configured provider). Event names use snake_case per GA4 convention.
 */
export function track(event: string, params?: Params): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (w.gtag) {
    w.gtag("event", event, params ?? {});
  } else if (import.meta.env.DEV) {
    console.debug("[analytics]", event, params ?? {});
  }
}
