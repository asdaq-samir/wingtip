import { useEffect, useRef, useState } from "react";
import { FileUp, CircleCheck, Download, Pencil, Trash2 } from "lucide-react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { cn } from "cn";
import EmptyState from "../../components/EmptyState";
import { ListGroup, ListRow } from "../../components/GroupedList";
import IconButton from "../../components/IconButton";
import RowMenu from "../../components/RowMenu";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import type { LibraryDocument } from "../../lib/api/types";
import { dayMonthYear, fromIso, megabytes } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { ownDocName } from "./docPlace";
import type { OwnDoc } from "./deviceFiles";
import SupplementRow from "./SupplementRow";
import { useDocuments } from "./useDocuments";

/**
 * The documents library, a page of You (ForeFlight's Documents): the
 * pilot's own PDFs first -- the POH, checklists, the insurance, the club's
 * rules, kept on this device and never sent anywhere -- then the FAA's
 * shelf by its groups, each document with its edition and date and its
 * Keep for the Air at the row's end, and a field's Chart Supplement. A
 * row opens the document in the reader; a cited rule anywhere in the app
 * opens it at its paragraph (Cited).
 */
export default function DocumentsPage() {
  const vm = useDocuments();
  return (
    <div className="flex flex-col gap-5" data-testid="documents-page">
      <ListGroup title="Your Documents">
        {vm.own.map((doc) => (
          <OwnRow
            key={doc.id}
            doc={doc}
            onOpen={() => vm.open({ doc: ownDocName(doc.id), at: null, page: null })}
            onRename={vm.rename}
            onDelete={vm.remove}
          />
        ))}
        {/* React Aria's FileTrigger: the device's own file picker, PDFs only. */}
        <FileTrigger
          acceptedFileTypes={["application/pdf", ".pdf"]}
          allowsMultiple
          onSelect={(files) => files && void vm.add(Array.from(files))}
        >
          <Pressable>
            <Button
              variant="plain"
              className={cn("min-h-11 w-full justify-start gap-3 px-4 text-tint", TEXT.row)}
              data-testid="documents-add"
            >
              <FileUp aria-hidden className="size-5" />
              Add a PDF
            </Button>
          </Pressable>
        </FileTrigger>
      </ListGroup>
      {vm.shelfFailed && !vm.groups.length && (
        <EmptyState icon={<Download />} title="Library Not Reached">
          The FAA's documents cannot be listed now. Those you keep for the air are listed here with no signal.
        </EmptyState>
      )}
      {vm.shelfLoading && (
        <p role="status" className={cn("px-1 text-muted-foreground", TEXT.detail)}>
          Fetching the library…
        </p>
      )}
      {vm.groups.map(({ group, documents }) => (
        <ListGroup key={group} title={group}>
          {documents.map((doc) => (
            <ShelfRow key={doc.id} doc={doc} vm={vm} />
          ))}
        </ListGroup>
      ))}
      <ListGroup title="Chart Supplement">
        <SupplementRow />
      </ListGroup>
    </div>
  );
}

/** A document of the FAA's: its title, its edition and date, and Keep for the Air. */
function ShelfRow({ doc, vm }: { doc: LibraryDocument; vm: ReturnType<typeof useDocuments> }) {
  const kept = vm.isKept(doc.id);
  const keeping = vm.isKeeping(doc.id);
  const edition = doc.edition ? [doc.label, doc.date && dayMonthYear(fromIso(doc.date))].filter(Boolean).join(" · ") : null;
  return (
    <div className="flex items-center pr-2" data-testid={`document-${doc.id}`}>
      <div className="min-w-0 flex-1">
        <ListRow
          title={doc.title}
          description={
            vm.keepFailed(doc.id) ? (
              <span className="text-destructive-ink">Could not be kept. Try again.</span>
            ) : (
              (edition ?? "Not in the library yet")
            )
          }
          disabled={!doc.edition && !kept}
          chevron
          onClick={() => vm.open({ doc: doc.id, at: null, page: null })}
        />
      </div>
      {keeping ? (
        <Spinner className="mx-3 text-muted-foreground" aria-label="Keeping for the air" />
      ) : kept ? (
        <IconButton label="Kept for the Air: Remove" onClick={() => void vm.forget(doc)} data-testid="document-kept" className="text-tint">
          <CircleCheck />
        </IconButton>
      ) : (
        <IconButton
          label={doc.bytes ? `Keep for the Air, ${megabytes(doc.bytes)}` : "Keep for the Air"}
          disabled={!doc.edition}
          onClick={() => void vm.keep(doc)}
          data-testid="document-keep"
        >
          <Download />
        </IconButton>
      )}
    </div>
  );
}

/** One of the pilot's own: opened by a tap, renamed in place, deleted with an Undo. */
function OwnRow({
  doc,
  onOpen,
  onRename,
  onDelete,
}: {
  doc: OwnDoc;
  onOpen: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [naming, setNaming] = useState(false);
  // The name's field takes the focus as Rename opens it, the pilot's own
  // ask (the stock focus a rename gives on iOS and Android), not on load.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) field.current?.focus();
  }, [naming]);
  if (naming)
    return (
      <form
        className="px-4 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get("name");
          setNaming(false);
          if (typeof name === "string") void onRename(doc.id, name);
        }}
      >
        <Input
          name="name"
          defaultValue={doc.name}
          aria-label="Document name"
          ref={field}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </form>
    );
  return (
    <RowMenu
      label={`More for ${doc.name}`}
      swipe
      actions={[
        { label: "Rename", icon: <Pencil />, onSelect: () => setNaming(true) },
        { label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => void onDelete(doc.id), spoken: `Delete ${doc.name}` },
      ]}
    >
      <ListRow title={doc.name} value={megabytes(doc.bytes)} chevron onClick={onOpen} data-testid="document-own" />
    </RowMenu>
  );
}
