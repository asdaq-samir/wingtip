import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { openYou } from "../../lib/openSettings";
import { pilotQuery } from "../../lib/queryClient";
import { AccountFace } from "./AccountFace";
import { accountButton } from "./accountLook";

/**
 * The account button at the sheet's title row: the pilot's initials on the
 * tint, or a person's glyph in the tint on grey signed out, 36 points
 * round with a 44-point hit area (accountLook). A tap opens You
 * (PilotPanel), who the pilot is and what is theirs, Settings one of its
 * rows -- the owner's pick, option A of the account canvas (2026-11-13),
 * as Apple Maps' avatar opens yours; it opened the settings page itself
 * since 2026-11-10 ("When tapping the avatar just open the settings").
 * As a link's `open=setup` opens it (useOpenScreen), and the console's own
 * switch for the developer's page, which has no screens.
 */
export default function AccountButton({ className }: { className?: string }) {
  const { data: pilot } = useQuery(pilotQuery);
  const name = pilot ? pilot.fullName || pilot.displayName : null;
  return (
    <button
      type="button"
      aria-label={name ? `You, ${name}` : "You"}
      data-testid="account-button"
      data-console-button=""
      onClick={openYou}
      className={cn(accountButton(!!name), className)}
    >
      <AccountFace name={name} />
    </button>
  );
}
