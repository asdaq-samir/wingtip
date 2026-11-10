import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useWantedPage } from "../../components/wantedPage";
import { pilotQuery } from "../../lib/queryClient";
import { wantScreen } from "../../lib/navigation/wanted";
import { useConsoleOpen } from "../../lib/mapChrome";
import { AccountFace } from "./AccountFace";
import { ACCOUNT_BUTTON } from "./accountLook";

/** The account page's rows, in its order (PilotPanel), by their pages'
 *  keys (ConsolePages); those kept to an account greyed signed out. */
const ROWS: { title: string; page: string; signedIn?: boolean }[] = [
  { title: "Airplanes", page: "aircraft", signedIn: true },
  { title: "Checklists", page: "checklists" },
  { title: "Flights", page: "flights", signedIn: true },
  { title: "Logbook", page: "logbook", signedIn: true },
  { title: "Coach", page: "coach", signedIn: true },
  { title: "Practice", page: "practice" },
  { title: "Minimums", page: "minimums" },
];
/** And the links at its foot. */
const MORE: { title: string; page: string }[] = [
  { title: "Status", page: "status" },
  { title: "Guide", page: "guide" },
  { title: "About", page: "about" },
];

/** The account page out, at a page of it where one is named: as a link's
 *  `open=setup` opens it (useOpenScreen: all the way up on the planner),
 *  and out here too for the developer's page, which has no screens. */
function open(page: string | null) {
  wantScreen("setup");
  useConsoleOpen.getState().setOpen(true);
  if (page) useWantedPage.getState().want([page]);
}

/**
 * The account button beside the one search (the owner's one-search
 * design, 2026-11-09), where the Setup tab was: the pilot's initials, or
 * a person's glyph signed out, in the tint, 44 points round. Its menu (the
 * stock Base UI Menu) is Setup's rows: the account and settings page
 * itself first, then the pilot's things, then Status, Guide and About,
 * each opening its page in the sheet (the account page, PilotPanel). Rows
 * kept to an account are greyed signed out, as on the page.
 */
export default function AccountMenuButton({ className }: { className?: string }) {
  const { data: pilot } = useQuery(pilotQuery);
  const name = pilot ? pilot.fullName || pilot.displayName : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name ? `Account and settings, ${name}` : "Account and settings"}
        data-testid="account-button"
        data-console-button=""
        className={cn(ACCOUNT_BUTTON, className)}
      >
        <AccountFace name={name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56" data-testid="account-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{name ?? "Not signed in"}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => open(null)} data-testid="account-menu-setup">
            {pilot ? "Account and Settings" : "Sign In and Settings"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {ROWS.map((row) => (
            <DropdownMenuItem
              key={row.title}
              disabled={row.signedIn && !pilot}
              onClick={() => open(row.page)}
              data-testid={`account-menu-${row.page}`}
            >
              {row.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {MORE.map((row) => (
            <DropdownMenuItem key={row.title} onClick={() => open(row.page)} data-testid={`account-menu-${row.page}`}>
              {row.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
