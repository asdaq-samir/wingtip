/** A link's address as the app may open it: a web page (http, https), a
 *  number to dial (tel:), an address to write to (mailto:) or a path on
 *  this site; anything else, a javascript: or data: address above all,
 *  none. A row's or a picture's link can come from others' data (a place's
 *  website from Overture, a photo's page from Planespotters), and a
 *  javascript: address there would run on a tap, were the CSP not to stop
 *  it, and a data: one open a page made to look like anyone's. */
export function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) return trimmed;
  try {
    return ["http:", "https:", "tel:", "mailto:"].includes(new URL(trimmed).protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
