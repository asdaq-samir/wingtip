import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import SectionTitle from "../../components/SectionTitle";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { TEXT } from "../../lib/text";
import type { OutlineRow } from "./pdfPlaces";
import type { BodyProps } from "./readerBody";
import { searchText, sectionAnchor, sectionFor, MOST_HITS } from "./textSearch";

/** A section brought to the top of the reader. */
function show(box: HTMLElement | null, id: string) {
  box?.querySelector(`#${CSS.escape(sectionAnchor(id))}`)?.scrollIntoView({ block: "start" });
}

/**
 * A CFR part in the reader, as the eCFR gives it (the planner's
 * wingtip.ecfr): its subparts and sections as text, each section's
 * heading an anchor a cite lands on ("91.155"), the type the app's own so
 * it reads at the pilot's text size and turns with the dark appearance.
 * A find lists every place it is found, a tap going there; the contents
 * are the subparts and their sections. Its "pages" are its sections.
 */
export default function TextBody({ source, startPage, startAt, find, goto, onOutline, onPage }: BodyProps) {
  const text = source.kind === "text" ? source.text : undefined;
  const box = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => text?.groups.flatMap((g) => g.sections) ?? [], [text]);
  // The find's results, until one is picked.
  const [listed, setListed] = useState<string | null>(null);
  const hits = useMemo(() => (listed ? searchText(text, listed) : []), [text, listed]);

  // The contents, and where it opens: a cite's section, else the page left at.
  useEffect(() => {
    if (!text) return;
    const rows: OutlineRow[] = text.groups.flatMap((g) => [
      ...(g.head ? [{ title: g.head, dest: g.sections[0]?.id, depth: 0 }] : []),
      ...g.sections.map((s) => ({ title: s.head || s.id, dest: s.id, depth: g.head ? 1 : 0 })),
    ]);
    onOutline(rows);
    const at = sectionFor(text, startAt) ?? (startPage ? sections[startPage - 1]?.id : null);
    if (at) requestAnimationFrame(() => show(box.current, at));
    // Once for the part: a page turned after is the pilot's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // A find typed lists its hits, set as the find comes rather than in an
  // effect after it (React's derived state).
  const [findSeen, setFindSeen] = useState(find);
  if (find !== findSeen) {
    setFindSeen(find);
    if (find) setListed(find.query);
  }

  useEffect(() => {
    if (!goto) return;
    const id = typeof goto.dest === "string" ? goto.dest : goto.page ? sections[goto.page - 1]?.id : undefined;
    if (id) show(box.current, id);
  }, [goto, sections]);

  // The section at the top of the view, said as the page read.
  useEffect(() => {
    const el = box.current;
    if (!el || !sections.length) return;
    const seen = new IntersectionObserver(
      (entries) => {
        const top = entries.find((e) => e.isIntersecting);
        const index = top ? sections.findIndex((s) => sectionAnchor(s.id) === top.target.id) : -1;
        if (index >= 0) onPage(index + 1, sections.length);
      },
      { root: el, rootMargin: "0px 0px -80% 0px" },
    );
    el.querySelectorAll("section[id]").forEach((s) => seen.observe(s));
    return () => seen.disconnect();
  }, [sections, onPage]);

  if (!text) return null;
  return (
    <div
      ref={box}
      className="absolute inset-0 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid="document-text"
    >
      {listed && (
        <div
          className="sticky top-0 z-10 -mx-4 max-h-[60%] overflow-y-auto bg-background px-4 py-2 shadow-(--depth-float)"
          data-testid="document-text-hits"
        >
          <ListGroup title={hits.length ? `${hits.length >= MOST_HITS ? `${MOST_HITS}+` : hits.length} Found` : "Not Found"}>
            {hits.map((h, i) => (
              <ListRow
                key={i}
                title={<span className={TEXT.detail}>§ {h.section}</span>}
                description={
                  <>
                    {h.before}
                    <mark className="bg-tint/20 text-foreground">{h.match}</mark>
                    {h.after}
                  </>
                }
                onClick={() => {
                  setListed(null);
                  show(box.current, h.section);
                }}
              />
            ))}
            <ListRow title="Done" onClick={() => setListed(null)} />
          </ListGroup>
        </div>
      )}
      {/* The part's title as the app's section titles are (SectionTitle), its groups under it. */}
      <SectionTitle className="pt-4 pb-2">{text.head}</SectionTitle>
      {text.groups.map((g, gi) => (
        <div key={gi}>
          {g.head && <h4 className={cn("pt-5 pb-1 font-semibold text-muted-foreground", TEXT.row)}>{g.head}</h4>}
          {g.sections.map((s) => (
            // Each section laid out only near the screen (content-visibility),
            // its height guessed till then and kept once seen: Part 91 drew
            // every paragraph before the cite scrolled in (react-perf L6).
            <section
              key={s.id}
              id={sectionAnchor(s.id)}
              className="scroll-mt-2 pt-4 [contain-intrinsic-size:auto_400px] [content-visibility:auto]"
            >
              <h4 className={cn("pb-1 font-semibold", TEXT.row)}>{s.head}</h4>
              {s.paragraphs.map((p, pi) => (
                <p key={pi} className={cn("pb-2", TEXT.prose)}>
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
