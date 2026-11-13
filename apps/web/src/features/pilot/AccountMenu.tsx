import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { ListGroup, ListRow } from "../../components/GroupedList";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useConfirm } from "../../components/useConfirm";
import { useDevMode, type AppMode } from "../../hooks/use-dev-mode";

/** Each page as the menu names it. */
const MODE_NAMES: Record<AppMode, string> = { pilot: "Pilot", developer: "Developer", studio: "Studio" };
import { pilotQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";
import { useDeleteAccount } from "./useDeleteAccount";
import { useExportAccount } from "./useExportAccount";
import { useLogout } from "./useLogout";

/**
 * Pilot Details' first group (You, the owner's Apple Maps screenshot,
 * 2026-11-13): who is signed in and the role's menu at the row's end,
 * where the menu sat beside Pilot Details under the name. Nothing where
 * there is no menu (signed out, no dev mode).
 */
export function AccountGroup() {
  const { data: pilot } = useQuery(pilotQuery);
  const devMode = useDevMode();
  if (!pilot && !devMode.allowed) return null;
  return (
    <ListGroup>
      <ListRow title="Role" description={pilot?.email ?? pilot?.displayName}>
        <AccountMenu />
      </ListRow>
    </ListGroup>
  );
}

/**
 * The mode menu alone -- Pilot, Developer or Studio, a copy of the account's
 * data, signing out, deleting the account -- where the address is set apart from it: at the right of
 * Setup's Account title, the address under that title, at the owner's
 * ask ("Email doesn't need to be in the table, it can be under account").
 */
function AccountMenu() {
  const { data: pilot } = useQuery(pilotQuery);
  const devMode = useDevMode();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const exportAccount = useExportAccount();
  const [askDelete, deleteDialog] = useConfirm({
    title: "Delete your account?",
    description:
      "Your airplanes, flights, logbook, saved tracks and the checkpoint notes you wrote go, on every " +
      "device, and you are signed out. This can't be undone.",
    confirmLabel: "Delete account",
    destructive: true,
    onConfirm: () => deleteAccount.mutate(),
  });
  if (!pilot && !devMode.allowed) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              data-testid="role-menu"
              className={cn("relative -mr-2 px-2 font-normal text-tint after:absolute after:-inset-y-2 after:inset-x-0", TEXT.row)}
            />
          }
        >
          {MODE_NAMES[devMode.mode]}
          <ChevronDown className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {/* Who is signed in, the menu's title on top, at the owner's ask
            ("Can the email of account go in the role selection as the
            title on top?"), where it was a line under Account. */}
          {pilot && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel
                  className={cn("max-w-64 truncate font-normal text-muted-foreground", TEXT.note)}
                  data-testid="pilot-address"
                >
                  {pilot.displayName}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuRadioGroup value={devMode.mode} onValueChange={(v) => devMode.go(v as AppMode)}>
            <DropdownMenuRadioItem value="pilot">Pilot</DropdownMenuRadioItem>
            {devMode.allowed && <DropdownMenuRadioItem value="developer">Developer</DropdownMenuRadioItem>}
            {devMode.allowed && (
              <DropdownMenuRadioItem value="studio" data-testid="mode-studio">
                Studio
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>
          {pilot && (
            <>
              <DropdownMenuSeparator />
              {/* A copy of everything the account keeps, as one file: the
                right to take one's data away, beside deleting it. */}
              <DropdownMenuItem onClick={() => exportAccount.mutate()} disabled={exportAccount.isPending} data-testid="export-account">
                Export my data
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => logout.mutate()} disabled={logout.isPending}>
                Sign out
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                data-testid="delete-account"
                disabled={deleteAccount.isPending}
                // After the menu has closed: a dialog opened while it still
                // holds the focus has its own taken back.
                onClick={() => setTimeout(askDelete)}
              >
                Delete account…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {deleteDialog}
    </>
  );
}
