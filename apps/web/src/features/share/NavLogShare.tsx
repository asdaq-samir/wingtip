import { FileArchive, MapPinned, Printer } from "lucide-react";
import { DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { openInForeFlight, packOrigin } from "./foreflightPack";
import { ShareMenuShell, type ShellLook } from "./ShareMenuShell";
import { ShareLinkItem, type SharedRoute } from "./shareItems";
import { usePack } from "./usePack";

/**
 * The nav log's share: its link, the checkpoints for ForeFlight and the
 * nav log printed (the owner, 2026-11-21: "Print navlog should be in navlog
 * share, not in more. Same with the checkpoints").
 */
export function NavLogShare({ route, ...look }: ShellLook & { route: SharedRoute }) {
  const { packHref, sentPack } = usePack(route);
  return (
    <ShareMenuShell card="navlog" {...look}>
      {({ afterMenu }) => (
        <>
          <ShareLinkItem route={route} />
          {/* Sent once and since deleted in ForeFlight: again. */}
          {route.routed && packHref && sentPack && (
            <DropdownMenuItem
              data-testid="foreflight-pack"
              render={
                <a href={openInForeFlight(new URL(packHref, packOrigin(window.location)).href)}>
                  <MapPinned />
                  Send the checkpoints again
                </a>
              }
            />
          )}
          {route.routed && packHref && (
            <DropdownMenuItem
              data-testid="export-foreflight"
              render={
                <a href={packHref} download>
                  <FileArchive />
                  Checkpoints for ForeFlight (.zip)
                </a>
              }
            />
          )}
          {/* Printed once the menu has gone, so it is not on the paper: the
              kneeboard card -- the nav log, radio and patterns on one
              half-letter page to fly with. Not for a local flight. */}
          {!route.local && (
            <DropdownMenuItem
              disabled={!route.routed}
              data-testid="print-kneeboard"
              onClick={afterMenu(() => void import("./printKneeboard").then((m) => m.printKneeboard()))}
            >
              <Printer />
              Print the nav log
            </DropdownMenuItem>
          )}
        </>
      )}
    </ShareMenuShell>
  );
}
