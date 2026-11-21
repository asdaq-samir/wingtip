import { lazy, Suspense, useCallback, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronDown, ChevronUp, ListTree, Moon, Share } from "lucide-react";
import { cn } from "cn";
import FullScreenViewer from "../../components/FullScreenViewer";
import IconButton from "../../components/IconButton";
import { SearchField } from "../../components/PanelCapsule";
import { TEXT } from "../../lib/text";
import type { DocPlace } from "./docPlace";
import type { OutlineRow } from "./pdfPlaces";
import type { Find, Goto } from "./readerBody";
import { ReaderContents } from "./ReaderContents";
import TextBody from "./TextBody";
import { useReader } from "./useReader";

// pdf.js and its viewer, half a megabyte, fetched with the first PDF opened.
const PdfBody = lazy(() => import("./PdfBody"));

/**
 * A document full screen, as the FAA's charts open (FullScreenViewer):
 * its title and close on top, then a search of its text and the reader's
 * four buttons -- Contents (the outline and the bookmarks), Bookmark the
 * page, Invert for the night, Share the page as a link -- and under them
 * its pages, a PDF's (PdfBody) or a CFR part's text (TextBody). Opened
 * from the address's `doc` (ReaderHost), so a cite tapped, a link shared
 * and Back all work as a card's do.
 */
export default function Reader({ place, onClose }: { place: DocPlace; onClose: () => void }) {
  const vm = useReader(place);
  const [contents, setContents] = useState(false);
  const [typed, setTyped] = useState("");
  const [find, setFind] = useState<Find | null>(null);
  const [goto, setGoto] = useState<Goto | null>(null);
  const [outline, setOutline] = useState<OutlineRow[]>([]);
  const [page, setPage] = useState<{ page: number; pages: number } | null>(null);
  const [matches, setMatches] = useState<{ current: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const { leftAt } = vm;
  const onPage = useCallback(
    (at: number, pages: number) => {
      setPage({ page: at, pages });
      leftAt(at);
    },
    [leftAt],
  );
  const marked = !!page && vm.bookmarks.some((m) => m.page === page.page);
  const ask = (step: Find["step"]) => typed.trim() && setFind((f) => ({ query: typed.trim(), step, n: (f?.n ?? 0) + 1 }));
  // A bookmark's name: a CFR part's section by its heading, a PDF's page by its number.
  const label = (at: number) =>
    (vm.source?.kind === "text" && vm.source.text.groups.flatMap((g) => g.sections)[at - 1]?.head) || `Page ${at}`;
  const body = vm.source &&
    !failed && {
      source: vm.source,
      startPage: vm.startPage,
      startAt: vm.startAt,
      find,
      goto,
      inverted: vm.inverted,
      onOutline: setOutline,
      onPage,
      onMatches: setMatches,
      onFailed: () => setFailed(true),
    };
  return (
    <FullScreenViewer title={vm.title} testId="document-reader" closeTestId="document-reader-close" onClose={onClose}>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <div className="min-w-0 flex-1">
          <SearchField
            value={typed}
            onChange={(v) => {
              setTyped(v);
              if (!v) setMatches(null);
            }}
            onCancel={() => setTyped("")}
            onSubmit={() => ask(find?.query === typed.trim() ? "next" : null)}
            placeholder="Search"
            label="Search this document"
            testId="document-search"
          />
        </div>
        <IconButton label="Contents" aria-pressed={contents} onClick={() => setContents((c) => !c)} data-testid="document-contents-button">
          <ListTree />
        </IconButton>
        <IconButton
          label={marked ? "Remove Bookmark" : "Bookmark This Page"}
          aria-pressed={marked}
          disabled={!page}
          onClick={() => page && vm.toggleBookmark(page.page, label(page.page))}
          data-testid="document-bookmark-button"
        >
          {marked ? <BookmarkCheck /> : <Bookmark />}
        </IconButton>
        <IconButton
          label="Invert Colors"
          aria-pressed={vm.inverted}
          onClick={() => vm.setInverted(!vm.inverted)}
          data-testid="document-invert"
        >
          <Moon />
        </IconButton>
        {vm.share && (
          <IconButton label="Share This Page" onClick={() => void vm.share?.(page?.page ?? null)} data-testid="document-share">
            <Share />
          </IconButton>
        )}
      </div>
      {matches && vm.source?.kind === "pdf" && (
        <div className="flex shrink-0 items-center justify-end gap-2 px-4 pb-2" data-testid="document-matches">
          <span role="status" className={cn("text-muted-foreground tabular-nums", TEXT.detail)}>
            {matches.total ? `${matches.current} of ${matches.total}` : "Not Found"}
          </span>
          <IconButton label="Previous Match" disabled={!matches.total} onClick={() => ask("previous")}>
            <ChevronUp />
          </IconButton>
          <IconButton label="Next Match" disabled={!matches.total} onClick={() => ask("next")}>
            <ChevronDown />
          </IconButton>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {body ? (
          vm.source?.kind === "pdf" ? (
            <Suspense fallback={null}>
              <PdfBody {...body} />
            </Suspense>
          ) : (
            <TextBody {...body} />
          )
        ) : (
          <p role="status" className={cn("px-4 pt-4 text-muted-foreground", TEXT.prose)} data-testid="document-status">
            {failed
              ? "This document could not be opened."
              : vm.trouble === "gone"
                ? "This document is no longer on this device."
                : vm.trouble === "unreachable"
                  ? "This document is not kept on this device, and the library cannot be reached. Keep it for the air to read it with no signal."
                  : "Opening…"}
          </p>
        )}
        {contents && (
          <ReaderContents
            edition={vm.edition}
            outline={outline}
            bookmarks={vm.bookmarks}
            paged={vm.source?.kind !== "text"}
            onPick={(to) => {
              setGoto((g) => ({ ...to, n: (g?.n ?? 0) + 1 }));
              setContents(false);
            }}
          />
        )}
      </div>
    </FullScreenViewer>
  );
}
