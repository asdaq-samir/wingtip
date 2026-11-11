/** The TV's code: eight letters and digits, shown as XXXX-XXXX
 *  (DeviceSignInController). Apart from TvCodeField, which is on a chunk
 *  of its own, so TvLink reads these without it. */
export const TV_CODE_LENGTH = 8;

/** Whether the page was opened from a TV's address (/tv, WebMvcConfig):
 *  read by TvLinkHost on the first load, which loads TvLink only then. */
export function fromTvAddress(): boolean {
  return new URLSearchParams(window.location.search).has("tv-link");
}

/** The code as the TV shows it, for the gateway, which reads it either way. */
export const tvCode = (value: string): string => `${value.slice(0, 4)}-${value.slice(4)}`;
