import { keptStore } from "../../storage";

/**
 * Whether the glide ring is drawn about own ship when no emergency is on:
 * off unless the pilot turns it on, from the Map menu (the owner,
 * 2026-11-09: "I am not a fan of the glide ring, I think we should have it
 * off by default, and maybe only turn it on in emergency"). The emergency
 * assistant draws its own while it is open, whatever this says. Kept on
 * this device, as the phones keep their "glide_ring".
 */
export const useGlideRingSetting = keptStore<boolean>("wingtip.glideRing", false);

export function setGlideRing(on: boolean) {
  useGlideRingSetting.setState({ value: on });
}

/** Why the switch cannot be turned on: no airplane picked, or one with no
 *  glide ratio (its POH's Section 3, or the pilot's) -- no ring is drawn
 *  at another airplane's (the owner, 2026-11-09); null where it can. */
export function glideRingBlocked(chosen: boolean, tail: string | null, glideRatio: number | null): string | null {
  if (!chosen) return "Pick an airplane";
  if (glideRatio == null) return `No glide ratio for ${tail ?? "this airplane"}`;
  return null;
}
