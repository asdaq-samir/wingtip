import type { ReactNode } from "react";
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
import { TEXT } from "../../../lib/text";

/** What the app is, three rows of it (the owner's aim, 2026-11-13: "a
 *  simple app with search like Apple/Google and a plan page like an EFB
 *  that can be easily accessed"). */
const ROWS = [
  { icon: Search, title: "Search, like Maps", line: "Find any airport, town or fix the way you would in Apple or Google Maps." },
  // The FPL tab's own icon (SheetTabBar).
  { icon: Route, title: "FPL, like your EFB", line: "The route, nav log, profile and brief, one tap away on the FPL tab." },
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
            screen's height less the status bar's room, its button at its
            foot; the focus taken by none of it, so no keyboard comes up as
            it closes. */}
        <PhoneSheetContent
          edge={edge}
          data-testid="first-flight"
          initialFocus={false}
          finalFocus={false}
          className="h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)]"
        >
          <PhoneSheetBody edge={edge} className="flex flex-1 flex-col px-6 pt-10">
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
      <ul className="mt-8 flex flex-col gap-5 px-2">
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
      <div className="mt-auto pt-6">
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

/** Theme and Appearance, Setup's two picks of the look (lookPicks), as an
 *  iOS settings list's rows: the name, and the one picked at the end as a
 *  pull-down's tinted words, its menu Setup's own. */
function LookRows() {
  const theme = useThemePick();
  const { value, onChange, options } = useAppearancePick();
  return (
    <ListGroup className="mt-7">
      <ListRow title="Theme">
        <PullDown label="Theme" {...theme} align="end" testId="welcome-theme" />
      </ListRow>
      <ListRow title="Appearance">
        <PullDown label="Appearance" value={value} onChange={onChange} options={options} align="end" testId="welcome-appearance" />
      </ListRow>
    </ListGroup>
  );
}
