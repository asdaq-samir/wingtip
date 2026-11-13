import type { ReactNode } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { MapIcon, Route, Search } from "lucide-react";
import { cn } from "cn";
import { PhoneSheet, PhoneSheetBody, PhoneSheetContent } from "../../../components/PhoneSheet";
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
 * title and a line, and one way on at its foot, Let's Go Flying (the
 * owner, 2026-11-13: one button, not two). In the app's modal sheet: on a
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
        {/* Tall, as iOS's welcome sheets stand nearly the screen's height,
            its button at its foot; the focus taken by none of it, so no
            keyboard comes up as it closes. */}
        <PhoneSheetContent edge={edge} data-testid="first-flight" initialFocus={false} finalFocus={false} className="h-[85dvh]">
          <PhoneSheetBody edge={edge} className="flex flex-1 flex-col px-8 pt-12">
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
      <ul className="mt-10 flex flex-col gap-7">
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
      {/* The one way on at the sheet's foot, the space above it its own. */}
      <div className="mt-auto pt-10">
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
