import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/useConfirm";
import type { Connection } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { useConnectedApps } from "./useConnectedApps";

/** When a connection was last renewed, as a date the pilot reads. */
function renewed(c: Connection): string | undefined {
  return c.renewedAt ? `Last used ${new Date(c.renewedAt).toLocaleDateString()}` : undefined;
}

/**
 * You's Connected Apps: each AI app the pilot connected to Wingtip
 * through its connector (Claude, ChatGPT), one row a connection, with
 * Disconnect at its end. Disconnecting asks first, then revokes that
 * connection's tokens at once, so the app's next call is refused and it
 * must be connected again (ConnectionsController).
 */
export default function ConnectedAppsPage() {
  const apps = useConnectedApps();
  const [askDisconnect, dialog] = useConfirm({
    title: `Disconnect ${apps.asked?.app ?? "this app"}?`,
    description: "It can no longer read your airplanes or flights or save one, until you connect it again.",
    confirmLabel: "Disconnect",
    destructive: true,
    onConfirm: apps.confirm,
  });
  if (apps.loading) return null;
  return (
    <div data-testid="connected-apps">
      <ListGroup title="AI apps">
        {apps.failed ? (
          <ListRow muted title="Your connected apps could not be read." />
        ) : !apps.connections?.length ? (
          <ListRow muted title="No apps are connected." />
        ) : (
          apps.connections.map((c) => (
            <ListRow key={c.id} title={c.app} description={renewed(c)}>
              <Button
                variant="ghost"
                size="sm"
                data-testid="disconnect-app"
                disabled={apps.ending === c.id}
                className={cn("relative -mr-2 text-destructive-ink after:absolute after:-inset-y-2 after:inset-x-0", TEXT.row)}
                onClick={() => {
                  apps.ask(c);
                  askDisconnect();
                }}
              >
                Disconnect
              </Button>
            </ListRow>
          ))
        )}
      </ListGroup>
      {dialog}
    </div>
  );
}
