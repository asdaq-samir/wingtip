import { useState } from "react";
import { Bookmark, ListTree, StickyNote } from "lucide-react";
import { cn } from "cn";
import EmptyState from "../../components/EmptyState";
import { ListGroup, ListRow } from "../../components/GroupedList";
import Segmented from "../../components/Segmented";
import { TEXT } from "../../lib/text";
import type { NoteRow } from "./markup";
import type { OutlineRow } from "./pdfPlaces";
import type { Bookmark as Mark } from "./readerPlaces";

/** A row's indent by its depth in the outline, three steps at most. */
const INDENT = ["", "ps-4", "ps-8", "ps-12"] as const;

/**
 * The reader's contents, over its pages (ForeFlight's Search panel, which
 * holds the table of contents, the bookmarks and the annotations): the
 * document's outline, each row going to its place, the pilot's
 * bookmarks and, for a PDF, their highlights and notes, each opening its
 * page, as the parts of one segmented control. The edition at its head.
 */
export function ReaderContents({
  edition,
  outline,
  bookmarks,
  notes,
  paged,
  onPick,
}: {
  edition: string | null;
  outline: OutlineRow[];
  bookmarks: Mark[];
  /** A PDF's highlights and notes (markup's notesOf); none for a CFR part. */
  notes: NoteRow[] | null;
  /** Whether a bookmark is a page (a PDF's), not a section (named by its heading). */
  paged: boolean;
  onPick: (to: { page?: number; dest?: unknown }) => void;
}) {
  const [half, setHalf] = useState<"contents" | "bookmarks" | "notes">("contents");
  return (
    <div className="absolute inset-0 z-10 flex flex-col gap-3 overflow-y-auto bg-background px-4 pt-2 pb-4" data-testid="document-contents">
      <Segmented
        label="Contents or bookmarks"
        value={half}
        onChange={(v) => setHalf(v as typeof half)}
        options={[
          { value: "contents", label: "Contents" },
          { value: "bookmarks", label: "Bookmarks" },
          ...(notes ? [{ value: "notes", label: "Notes" }] : []),
        ]}
        testId="document-contents-half"
      />
      {edition && <p className={cn("px-1 text-muted-foreground", TEXT.detail)}>{edition}</p>}
      {half === "notes" && notes ? (
        <NotesList notes={notes} onPick={onPick} />
      ) : half === "contents" ? (
        outline.length ? (
          <ListGroup>
            {outline.map((row, i) => (
              <ListRow
                key={i}
                title={
                  <span className={cn(INDENT[Math.min(row.depth, INDENT.length - 1)], row.depth > 0 && "text-muted-foreground")}>
                    {row.title}
                  </span>
                }
                onClick={() => onPick({ dest: row.dest })}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon={<ListTree />} title="No Contents">
            This document has no table of contents.
          </EmptyState>
        )
      ) : bookmarks.length ? (
        <ListGroup>
          {bookmarks.map((m) => (
            <ListRow
              key={m.page}
              title={m.label}
              value={paged ? `Page ${m.page}` : undefined}
              onClick={() => onPick({ page: m.page })}
              data-testid="document-bookmark"
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState icon={<Bookmark />} title="No Bookmarks">
          Tap the bookmark to mark the page you are on.
        </EmptyState>
      )}
    </div>
  );
}

/** The document's highlights and notes, page by page, each opening its page. */
function NotesList({ notes, onPick }: { notes: NoteRow[]; onPick: (to: { page: number }) => void }) {
  if (!notes.length)
    return (
      <EmptyState icon={<StickyNote />} title="No Notes">
        Highlight a passage with Markup, then add a note to it.
      </EmptyState>
    );
  return (
    <ListGroup>
      {notes.map((n, i) => (
        <ListRow
          key={i}
          title={n.note ?? n.text ?? "Highlight"}
          description={n.note && n.text ? <span className="italic">{n.text}</span> : undefined}
          value={`Page ${n.page}`}
          onClick={() => onPick({ page: n.page })}
          data-testid="document-note-row"
        />
      ))}
    </ListGroup>
  );
}
