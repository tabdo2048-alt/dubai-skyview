// Where a visitor's inquiry goes.
//
// These were hardcoded literals duplicated across two components, and the email
// was `sales@example.ae` — a placeholder domain, so every "Book viewing" request
// a visitor sent went nowhere. Both values now come from configuration, and a
// button whose channel is unconfigured is hidden rather than rendered dead.
//
// Site-wide for now. The intended end state is per-organization details stored on
// the tenants row, so a visitor contacting a listing reaches the agency that owns
// it rather than the platform. That needs a migration plus a SECURITY DEFINER
// function (anon SELECT on public.tenants is revoked, deliberately — it holds
// Stripe ids). Keeping every call site behind the two helpers below means that
// change lands here and nowhere else.

const RAW_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim();
const RAW_WHATSAPP = (import.meta.env.VITE_CONTACT_WHATSAPP as string | undefined)?.trim();

// An address is only usable if it looks like one — a half-filled env var should
// hide the button, not render a mailto: that bounces.
export const CONTACT_EMAIL = RAW_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(RAW_EMAIL) ? RAW_EMAIL : null;

// wa.me wants digits only: international format, no '+', spaces or dashes. The
// value is normalized here so a number entered as "+971 58 662 0600" still works.
const WHATSAPP_DIGITS = RAW_WHATSAPP ? RAW_WHATSAPP.replace(/\D/g, "") : "";
export const CONTACT_WHATSAPP = WHATSAPP_DIGITS.length >= 8 ? WHATSAPP_DIGITS : null;

/** wa.me link pre-filled with the project name, or null when unconfigured. */
export function whatsappUrl(projectName: string): string | null {
  if (!CONTACT_WHATSAPP) return null;
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(`Interested in ${projectName}`)}`;
}

/** mailto: link for a viewing request, or null when unconfigured. */
export function viewingMailto(projectName: string): string | null {
  if (!CONTACT_EMAIL) return null;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Book viewing: ${projectName}`)}`;
}
