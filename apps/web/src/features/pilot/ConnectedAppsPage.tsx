import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { useConfirm } from "../../components/useConfirm";
import type { Connection } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { useConnectedApps } from "./useConnectedApps";

/** What the app may do, in the consent page's words (the gateway's
 *  ConnectorSettings.SCOPE_WORDS), and when it was last renewed. */
function about(c: Connection): string | undefined {
  const lines = [...c.can, c.renewedAt ? `Last used ${new Date(c.renewedAt).toLocaleDateString()}` : null].filter(Boolean);
  return lines.length ? lines.join(" · ") : undefined;
}

/**
 * You's Connected Apps: each AI app the pilot connected to Wingtip
 * through its connector (Claude, ChatGPT), one row a connection, what it
 * may do under its name, with Disconnect at its end. Disconnecting asks first, then revokes that
 * connection's tokens at once, so the app's next call is refused and it
 * must be connected again (ConnectionsController).
 */
export default function ConnectedAppsPage() {
  const apps = useConnectedApps();
  const [askDisconnect, dialog] = useConfirm({
    title: `Disconnect ${apps.asked?.app ?? "this app"}?`,
    description: "It can no longer read your airplanes or flights, or save, change or delete one, until you connect it again.",
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
            <ListRow key={c.id} title={c.app} description={about(c)} data-testid="connected-app">
              <Button
                variant="ghost"
                size="sm"
                data-testid="disconnect-app"
                disabled={apps.ending === c.id}
                className={cn("relative -mr-2 text-destructive-ink hit-y-2 after:inset-x-0", TEXT.row)}
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
