import { useEffect } from "react";
import { openAirplaneProfile, useProfileOpen } from "../../lib/airplane/profileStore";
import { useAddressKey } from "../../lib/address";

/**
 * The airplane profile open in the address (the owner, 2026-11-09: every
 * card its own URL, linkable and bookmarkable), as an airport's card is
 * (`place`): a link with `airplane=` opens that N-number's profile, and
 * opening or closing one writes it, in place of the address's last, as
 * every panel change is (lib/backNavigation).
 */
export function useProfileAddress() {
  // The address's key for the profile open: `?airplane=N3429J`.
  const [linked, setLinked] = useAddressKey("airplane");
  const tail = useProfileOpen((s) => s.open?.tail ?? null);
  // A link's profile opened as the page lands on it, or as Back comes to it.
  useEffect(() => {
    if (linked && linked.toUpperCase() !== useProfileOpen.getState().open?.tail) openAirplaneProfile(linked);
  }, [linked]);
  // The profile open said in the address; put away, the key let go.
  useEffect(() => {
    void setLinked((now) => ((now ?? null) === tail ? now : tail));
  }, [tail, setLinked]);
}
