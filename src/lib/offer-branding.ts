export const DEFAULT_OFFER_PRIMARY_COLOR = "#07182f";
export const DEFAULT_OFFER_ACCENT_COLOR = "#c9a84c";

/** Accept only hex colours before passing admin-controlled values to the PDF. */
export function safeOfferColor(value: string | null | undefined, fallback: string): string {
  const candidate = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}
