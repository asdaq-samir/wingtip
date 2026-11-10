import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useConsoleOpen } from "../../lib/mapChrome";
import { wantScreen } from "../../lib/navigation/wanted";
import { pilotQuery } from "../../lib/queryClient";
import { AccountFace } from "./AccountFace";
import { ACCOUNT_BUTTON } from "./accountLook";

/**
 * The account button at the sheet's title row: the pilot's initials, or a
 * person's glyph signed out, in the tint, 44 points round. A tap opens the
 * account and settings page itself (PilotPanel), at the owner's word
 * (2026-11-10: "When tapping the avatar just open the settings"), where a
 * menu of the page's rows came first; every row it held is on the page.
 * As a link's `open=setup` opens it (useOpenScreen), and the console's own
 * switch for the developer's page, which has no screens.
 */
export default function AccountButton({ className }: { className?: string }) {
  const { data: pilot } = useQuery(pilotQuery);
  const name = pilot ? pilot.fullName || pilot.displayName : null;
  return (
    <button
      type="button"
      aria-label={name ? `Account and settings, ${name}` : "Account and settings"}
      data-testid="account-button"
      data-console-button=""
      onClick={() => {
        wantScreen("setup");
        useConsoleOpen.getState().setOpen(true);
      }}
      className={cn(ACCOUNT_BUTTON, className)}
    >
      <AccountFace name={name} />
    </button>
  );
}
