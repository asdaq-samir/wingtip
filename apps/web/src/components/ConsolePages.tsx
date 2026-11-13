import { useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { ListRow } from "./GroupedList";
import { useShown } from "../lib/shown";
import { holdOpenCard } from "../lib/openCards";
import { useWantedPage } from "../lib/navigation/wantedPage";
import { useScrollPlace } from "../lib/scrollPlace";
import { CardHeadRow } from "./CardHead";
import { PAGE_LINK } from "./pageLink";
import CloseButton from "./CloseButton";
import { ConsoleLeave } from "./consoleLeave";
import { Pages } from "./consolePagesContext";

/** The way to open one of a tab's pages, and the page back came from. */

/**
 * iOS's navigation inside a console tab, as Settings has it: the tab's
 * own page is a few grouped lists, and a row with a chevron (PageRow)
 * pushes a page of its own over it, its close at its title's right
 * going back a page -- no Back on the left, at the owner's ask ("remove
 * the back buttons, because close button should behave as the back
 * button", 2026-10-22) -- as a swipe to the right and a device's Back do
 * (lib/openCards). What is looked at now and then -- the reference data, the
 * charts, the versions before the model serving, the longer reading --
 * is a tap away rather than folded under a title in a long scroll.
 * Back is also where a tab change leaves it: each tab starts on its own
 * page. Focus goes as a push and a pop take it: to the page's title,
 * and back to the row that opened it.
 */
export function ConsolePages({
  back,
  pages,
  children,
}: {
  /** The tab's name: where the page's close goes back to, said to a
   *  screen reader. */
  back: string;
  pages: Record<string, { title: string; content: ReactNode }>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  // Opened straight from outside (useWantedPage), not from a row here.
  const [direct, setDirect] = useState(false);
  const leave = useContext(ConsoleLeave);
  // The tab's own page eases in only coming back to it from a page, as a
  // pop: drawn as Setup opens, it faded in from nothing every time, its
  // switches' icons blinking out and back at each tap on the tab, at the
  // owner's notice ("It's flickering the icons").
  const [popped, setPopped] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // A page starts at its top, with its title the place a screen reader
  // reads on from; back is left to the row's focus (PageRow), which
  // brings it into view.
  // The page open is the top of what the close, a swipe back and a
  // device's Back take away, one at a time: a page of a page first.
  // A page opened straight from outside goes back there, the console
  // closed with it; one opened from a row here, back to the list.
  const shut = () => {
    if (direct && leave) {
      leave();
      return;
    }
    setPopped(true);
    setOpen(null);
  };
  const shutNow = useEffectEvent(shut);
  useEffect(() => {
    if (!open) return;
    return holdOpenCard({ close: () => shutNow(), inBar: false });
  }, [open]);
  // Back, the list is where it was (useScrollPlace).
  useScrollPlace(top, !!open);
  useEffect(() => {
    if (open) title.current?.focus({ preventScroll: true });
  }, [open]);
  // A page asked for from outside (useWantedPage: the strip's field, its
  // profile menu, the Debrief card): opened as it is asked, or as this
  // mounts with it waiting, or as its page comes (Flights' list still
  // fetching), where it is one of these pages -- in the render, as the
  // tab's put-away is (below) -- and the ask's key then let go of for
  // the pages inside it, in an effect, as an outside store is set. By
  // the keys alone: the pages are made anew each render.
  const wanted = useWantedPage((s) => s.path[0] ?? null);
  const known = Object.keys(pages).join(" ");
  const [seen, setSeen] = useState<{ wanted: string | null; known: string }>({ wanted: null, known: "" });
  if (seen.wanted !== wanted || seen.known !== known) {
    setSeen({ wanted, known });
    if (wanted && known.split(" ").includes(wanted)) {
      setFrom(wanted);
      setOpen(wanted);
      // Asked from inside the console (You's gear), as its row opens it.
      setDirect(!useWantedPage.getState().inside);
    }
  }
  useEffect(() => {
    const { path, took } = useWantedPage.getState();
    if (seen.wanted && path[0] === seen.wanted && seen.known.split(" ").includes(seen.wanted)) took();
  }, [seen]);
  // Back to the list as the tab holding it is put away (lib/shown).
  const shown = useShown();
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (!shown) {
      setOpen(null);
      setPopped(false);
    }
  }
  const page = open ? pages[open] : undefined;
  return (
    <div ref={top}>
      {page ? (
        // In from the right over motion.page, as a pushed page is (the
        // tokens; Reduce Motion stills it, index.css). A page of a page --
        // Personal's Flights, then a flight -- goes
        // back to the page under it, as iOS's navigation does one level
        // at a time: this page's head steps aside while one is open in it.
        <div
          key={open}
          data-slot="console-page"
          data-testid="console-page"
          className="space-y-4 [animation-duration:var(--motion-page)] animate-in fade-in slide-in-from-right-4 [&:has([data-slot=console-page])>[data-slot=page-head]]:hidden"
        >
          {/* Its name and close pinned at the top, every card's one head row
              (CardHeadRow), its slot the one a page over it hides. */}
          <CardHeadRow
            name={page.title}
            level="h3"
            nameRef={title}
            slot="page-head"
            end={
              <CloseButton
                label={direct && leave ? "Back to the map" : `Back to ${back}`}
                onClick={shut}
                data-testid="console-page-close"
              />
            }
          />
          {page.content}
        </div>
      ) : (
        <div className={cn(popped && "[animation-duration:var(--motion-page)] animate-in fade-in")}>
          <Pages.Provider
            value={{
              open: (p) => {
                setFrom(p);
                setOpen(p);
                setDirect(false);
              },
              from,
            }}
          >
            {children}
          </Pages.Provider>
        </div>
      )}
    </div>
  );
}

/** A row that opens one of the tab's pages: its name, what it holds at
 *  its end as a value, and the chevron. */
export function PageRow({
  page,
  title,
  description,
  value,
  media,
  testId,
  disabled,
}: {
  page: string;
  title: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  media?: ReactNode;
  testId?: string;
  /** Waiting on something: the account's things signed out. */
  disabled?: boolean;
}) {
  const pages = useContext(Pages);
  const row = useRef<HTMLButtonElement>(null);
  const back = pages?.from === page;
  useEffect(() => {
    if (back) row.current?.focus();
  }, [back]);
  return (
    <ListRow
      ref={row}
      title={title}
      description={description}
      value={value}
      media={media}
      chevron
      disabled={disabled}
      onClick={() => pages?.open(page)}
      data-testid={testId}
    />
  );
}

/** A page opened from a link in the tint, at a page's foot: Setup's Guide
 *  and About, at the owner's pick (T3). Its 44 points a pseudo-element
 *  round the words, the words not grown. */
export function PageLink({ page, children, testId }: { page: string; children: ReactNode; testId?: string }) {
  const pages = useContext(Pages);
  return (
    <button type="button" onClick={() => pages?.open(page)} data-testid={testId} className={PAGE_LINK}>
      {children}
    </button>
  );
}

/** A numbered step, as a row: its number in the tint's disc, what to
 *  do, and how. */
export function StepRow({ n, title, description }: { n: number; title: ReactNode; description?: ReactNode }) {
  return (
    <ListRow
      title={<span className="font-semibold">{title}</span>}
      description={description}
      media={
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-(length:--type-note) font-semibold text-primary-foreground",
          )}
        >
          {n}
        </span>
      }
    />
  );
}
