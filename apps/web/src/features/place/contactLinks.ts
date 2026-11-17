/** "817-858-7503", a US number as NASR and the FAA write it, as a number
 *  the phone dials: tel:+18178587503 (TfrDetails' whom to call, the airport
 *  card's Details). */
export function dial(phone: string): string {
  return `tel:+1${phone.replace(/\D/g, "")}`;
}

/** A site's address as a row shows it: its host without "https://" or "www.". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}
