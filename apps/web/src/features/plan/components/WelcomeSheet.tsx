import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { MapIcon, Route, Search } from "lucide-react";
import { cn } from "cn";
import { AppearanceTile, ThemeTile } from "../../../components/lookPicks";
import { PhoneSheet, PhoneSheetBody, PhoneSheetContent } from "../../../components/PhoneSheet";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../../components/ui/dialog";
import { useIsMobile } from "../../../hooks/use-mobile";
import { useNavEdge } from "../../../hooks/use-nav-edge";
import { askPositionQuietly, ownShipAvailable } from "../../../lib/map/position/ownShip";
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
 * title and a line; the look picked on Setup's own two tiles, Theme and
 * Appearance side by side as its Layout has them (lookPicks), changing the
 * sheet and the map behind it as it is picked (the owner, 2026-11-13:
 * "give theme and appearance selection on the welcome screen"); and one
 * way on at its foot, Let's Go Flying (the owner, 2026-11-13: one button,
 * not two). In the app's modal sheet: on a
 * phone the stock Drawer (PhoneSheet) from the navigation bar's edge,
 * solid; from `md` up the stock Dialog, solid. No close of its own: its
 * foot's buttons (Foot), a swipe down or a tap beside it all go on to the
 * map, the same way (`onGo`).
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
      <Foot onGo={onGo} />
    </>
  );
}

/** The browser's answer for the position: "granted", "denied", or
 *  "prompt" while its question is still to come, followed as it changes;
 *  null until it has said (and where it will not), so the foot shows Let's
 *  Go Flying rather than a question that may not be one. */
function useLocationPermission() {
  const [state, setState] = useState<PermissionState | null>(null);
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
 * The welcome's foot, Apple's permission priming at the owner's asks
 * (2026-11-13: "welcome screen should ask to turn on location"; "And then
 * a later button instead of let's go flying"): with the browser's question
 * still to come, Turn On Location, filled, asks it at the tap
 * (askPositionQuietly, the map's own start of own ship; never on load,
 * holdAskOnOpen) and goes on to the map whatever the answer, and Later,
 * plain, goes on without asking. Allowed already, or no position to be
 * had over this connection, Let's Go Flying alone; refused before, which a
 * browser does not ask again, Let's Go Flying and where to turn it on.
 */
function Foot({ onGo }: { onGo: () => void }) {
  const permission = useLocationPermission();
  const asking = permission === "prompt" && ownShipAvailable();
  const button = "h-12 w-full rounded-(--radius-control) font-semibold";
  return (
    <div className="mt-auto flex flex-col gap-2 pt-3">
      {asking ? (
        <>
          <Button
            type="button"
            size="lg"
            className={button}
            onClick={() => {
              askPositionQuietly();
              onGo();
            }}
            data-testid="first-flight-location"
          >
            Turn On Location
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className={cn(button, "font-normal text-tint")}
            onClick={onGo}
            data-testid="first-flight-later"
          >
            Later
          </Button>
        </>
      ) : (
        <>
          {permission === "denied" && (
            <p className={cn("text-center text-muted-foreground", TEXT.note)} data-testid="first-flight-location-off">
              Turn location on in the browser&apos;s site settings.
            </p>
          )}
          <Button type="button" size="lg" className={button} onClick={onGo} data-testid="first-flight-go">
            Let&apos;s Go Flying
          </Button>
        </>
      )}
    </div>
  );
}

/** Theme and Appearance as Setup's Layout draws them (lookPicks' tiles,
 *  QuickControls' grid): the same two tiles, side by side. */
function LookRows() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <ThemeTile />
      <AppearanceTile />
    </div>
  );
}
