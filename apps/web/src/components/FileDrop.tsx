import type { ReactNode } from "react";
import { DropZone, isFileDropItem, type DropItem } from "react-aria-components";

interface Props {
  /** What a screen reader hears the place is for: "Drop PDFs here". */
  label: string;
  /** The MIME types it takes; a file of none of them is refused as it is dragged over. */
  types: readonly string[];
  /** The files let go over it, of those types alone. */
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

/** The dragged items' files of `types`, read. */
async function filesOf(items: DropItem[], types: readonly string[]): Promise<File[]> {
  const files = items.filter(isFileDropItem).filter((item) => types.includes(item.type));
  return Promise.all(files.map((item) => item.getFile()));
}

/**
 * A list a file can be dropped on, React Aria's own DropZone round it: on
 * an iPad, a PDF or a track dragged in from Files beside the app in Split
 * View or Stage Manager, or with the Apple Pencil, as iPadOS's apps take
 * one; on a desktop, from the Finder. The list's own row with the file
 * picker (FileTrigger) stays the way in without a drag (the iPad audit,
 * 2026-11-21: the documents library and the debrief took no drop). Ringed
 * in the tint while a file it takes is over it.
 */
export default function FileDrop({ label, types, onFiles, children }: Props) {
  return (
    <DropZone
      aria-label={label}
      getDropOperation={(dragged) => (types.some((type) => dragged.has(type)) ? "copy" : "cancel")}
      onDrop={(event) => {
        void filesOf(event.items, types).then((files) => {
          if (files.length) onFiles(files);
        });
      }}
      className="rounded-2xl outline-none data-[drop-target]:ring-2 data-[drop-target]:ring-tint"
    >
      {children}
    </DropZone>
  );
}
