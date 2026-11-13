import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { MapIcon, Route, Search } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { useAppearancePick, useThemePick } from "../../../components/lookPicks";
import { PhoneSheet, PhoneSheetBody, PhoneSheetContent } from "../../../components/PhoneSheet";
import PullDown from "../../../components/PullDown";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../../components/ui/dialog";
import { useIsMobile } from "../../../hooks/use-mobile";
import { useNavEdge } from "../../../hooks/use-nav-edge";
import { OPEN_ZOOM, ownShipAvailable, useOwnShip } from "../../../lib/map/position/ownShip";
import { TEXT } from "../../../lib/text";

/** What the app is, three rows of it (the owner's aim, 2026-11-13: "a
 *  simple app with search like Apple/Google and a plan page like an EFB
 *  that can be easily accessed"). */
const ROWS = [
  { icon: Search, title: "Search, like Maps", line: "Find any airport, town or fix the way you would in Apple or Google Maps." },
  // FPL's own glyph on the page toggle (PageToggle).
  { icon: Route, title: "FPL, like your EFB", line: "The route, nav log, profile and brief, one tap away on the FPL button." },
  {
    icon: MapIcon,
    title: "FAA charts that move like Maps",
    line: "Sectional and IFR charts you pinch, pan and tap, with the weather on top.",
  },
] as const;

/**
 * The first flight's welcome (FirstFlight, useFirstFlight; the owner's
 * option A, 2026-11-13), laid out as an Apple app's own welcome sheet: the
 * app's name large and centred, three rows each a tinted icon, a bold
 * title and a line; the look picked in a small grouped list, Theme and
 * Appearance, each the same menu as Setup's tile (lookPicks), changing the
 * sheet and the map behind it as it is picked (the owner, 2026-11-13:
 * "give theme and appearance selection on the welcome screen"); and one
 * way on at its foot, Let's Go Flying (the owner, 2026-11-13: one button,
 * not two). In the app's modal sheet: on a
 * phone the stock Drawer (PhoneSheet) from the navigation bar's edge,
 * solid; from `md` up the stock Dialog, solid. No close of its own: the
 * button, a swipe down or a tap beside it all go on to the map, the same
 * way (`onGo`).
 */
export default function WelcomeSheet({ open, onGo }: { open: boolean; onGo: () => void }) {
  const onPhone = useIsMobile();
  const edge = useNavEdge();
  const change = (next: boolean) => {
    if (!next) onGo();
  };
  if (onPhone)
    return (
      <PhoneSheet edge={edge} open={open} onOpenChange={change}>
        {/* Tall, as iOS's welcome sheets stand at the large detent, the
            screen's height less the status bar's room (its safe area, a
            rem at the least) and the sheet's float, its button at its
            foot; the focus taken by none of it, so no keyboard comes up as
            it closes. */}
        <PhoneSheetContent
          edge={edge}
          data-testid="first-flight"
          initialFocus={false}
          finalFocus={false}
          className="h-[calc(100dvh-max(env(safe-area-inset-top),1rem)-0.5rem)] max-h-[calc(100dvh-max(env(safe-area-inset-top),1rem)-0.5rem)]"
        >
          <PhoneSheetBody edge={edge} className="flex flex-1 flex-col px-6 pt-4">
            <Welcome title={<Drawer.Title className={TITLE}>{TITLE_WORDS}</Drawer.Title>} onGo={onGo} />
          </PhoneSheetBody>
        </PhoneSheetContent>
      </PhoneSheet>
    );
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent glass={false} data-testid="first-flight" initialFocus={false} finalFocus={false} className="max-w-md gap-0 p-8">
        <Welcome title={<DialogTitle className={TITLE}>{TITLE_WORDS}</DialogTitle>} onGo={onGo} />
      </DialogContent>
    </Dialog>
  );
}

/** The app's name, its second line in the tint, as Apple's welcome sets
 *  its own: iOS's Title 1 (TEXT.hero), bold. */
const TITLE = cn("text-center font-bold text-foreground", TEXT.hero);
const TITLE_WORDS = (
  <>
    Welcome to
    <br />
    <span className="text-tint">Wingtip Maps</span>
  </>
);

function Welcome({ title, onGo }: { title: ReactNode; onGo: () => void }) {
  return (
    <>
      {title}
      <ul className="mt-5 flex flex-col gap-3 px-2">
        {ROWS.map(({ icon: Icon, title: name, line }) => (
          <li key={name} className="flex items-start gap-4">
            <Icon className="mt-0.5 size-8 shrink-0 text-tint" aria-hidden="true" />
            <div className="min-w-0">
              <p className={cn("font-semibold text-foreground", TEXT.row)}>{name}</p>
              <p className={cn("text-muted-foreground", TEXT.prose)}>{line}</p>
            </div>
          </li>
        ))}
      </ul>
      <LookRows />
      {/* The one way on at the sheet's foot, the space above it its own. */}
      <div className="mt-auto pt-3">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-(--radius-control) font-semibold"
          onClick={onGo}
          data-testid="first-flight-go"
        >
          Let&apos;s Go Flying
        </Button>
      </div>
    </>
  );
}

/** The browser's answer for the position: "granted", "denied", or
 *  "prompt" while its question is still to come (and where it will not
 *  say), followed as it changes. */
function useLocationPermission() {
  const [state, setState] = useState<PermissionState>("prompt");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const read = () => status && setState(status.state);
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        status = s;
        read();
        s.addEventListener("change", read);
      })
      .catch(() => undefined);
    return () => status?.removeEventListener("change", read);
  }, []);
  return state;
}

/**
 * Location, asked in context at the owner's ask (2026-11-13: "welcome
 * screen should ask to turn on location"): never on load (locateOnOpen
 * waits while the welcome is up, holdAskOnOpen), only at Turn On, which
 * is the map's own position button's start (own ship on, the map on it)
 * and so the browser's own question. On once allowed or a fix is in; Off
 * with where to change it once refused (the browser's site settings, as
 * a browser asks a site once), the row's own line kept short for the
 * owner's largest text.
 */
function LocationRow() {
  const permission = useLocationPermission();
  const fixed = useOwnShip((s) => s.enabled && s.fix !== null);
  const refused = useOwnShip((s) => s.error !== null);
  const on = permission === "granted" || fixed;
  const off = !on && (permission === "denied" || refused || !ownShipAvailable());
  const turnOn = () => {
    const ship = useOwnShip.getState();
    ship.setEnabled(true);
    ship.recentre(OPEN_ZOOM);
  };
  return (
    <ListRow title="Location" description={off ? "Turn it on in the browser's site settings." : undefined}>
      {on ? (
        <span className={cn("text-muted-foreground", TEXT.row)} data-testid="welcome-location">
          On
        </span>
      ) : off ? (
        <span className={cn("text-muted-foreground", TEXT.row)} data-testid="welcome-location">
          Off
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full bg-tint/12 font-semibold text-tint hover:bg-tint/20"
          onClick={turnOn}
          data-testid="welcome-location"
        >
          Turn On
        </Button>
      )}
    </ListRow>
  );
}

/** Theme and Appearance, Setup's two picks of the look (lookPicks), as an
 *  iOS settings list's rows: the name, and the one picked at the end as a
 *  pull-down's tinted words, its menu Setup's own. */
function LookRows() {
  const theme = useThemePick();
  const { value, onChange, options } = useAppearancePick();
  return (
    <ListGroup className="mt-4">
      <ListRow title="Theme">
        <PullDown label="Theme" {...theme} align="end" testId="welcome-theme" />
      </ListRow>
      <ListRow title="Appearance">
        <PullDown label="Appearance" value={value} onChange={onChange} options={options} align="end" testId="welcome-appearance" />
      </ListRow>
      <LocationRow />
    </ListGroup>
  );
}
