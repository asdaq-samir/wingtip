import type { ReactNode } from "react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { Camera } from "lucide-react";
import { cn } from "cn";
import SheetDialog from "../../components/SheetDialog";
import { Button } from "../../components/ui/button";
import SkeletonLines from "../../components/SkeletonLines";
import { FINDING_TONE } from "../../lib/findings";
import { FLAG_FINDING, type FlagLevel } from "../../lib/documentPhoto";
import { TEXT } from "../../lib/text";
import type { DocumentPhoto } from "./useDocumentPhoto";
import { FieldError } from "../../components/ui/field";

/** A check's flags under what it is about: "wrong" in the stop's tone,
 *  "check" in the caution's; the pilot reads them against the page. */
export function FlagLines({ flags, testId }: { flags: { level: FlagLevel; says: string }[]; testId?: string }) {
  if (!flags.length) return null;
  return (
    <span className="flex flex-col gap-0.5" data-testid={testId}>
      {flags.map((f) => (
        <span key={f.says} className={FINDING_TONE[FLAG_FINDING[f.level]]}>
          {f.says}
        </span>
      ))}
    </span>
  );
}

/**
 * The sheet a photo is read in: the button that takes or picks it (the
 * phone's camera, or a file), what is happening, what could not be read,
 * and then the review the screen gives (`children`). Errors are said
 * here, where they happen.
 */
export default function PhotoSheet({
  photo,
  open,
  onOpenChange,
  title,
  choose,
  action,
  children,
  testId,
}: {
  photo: DocumentPhoto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What the page is, where the screen asks (Performance or Weight & Balance). */
  choose?: ReactNode;
  action?: { label: string; onClick: () => void; disabled: boolean; testId: string };
  children?: ReactNode;
  testId: string;
}) {
  const answer = photo.answer;
  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      cancel={!!action}
      title={title}
      action={action}
      testId={testId}
      description="Every figure is checked, and only what you confirm is kept."
    >
      {choose}
      {/* React Aria's FileTrigger: the hidden file input, opened by the button. */}
      <FileTrigger
        acceptedFileTypes={["image/*"]}
        defaultCamera="environment"
        data-testid={`${testId}-file`}
        onSelect={(files) => {
          const f = files?.[0];
          if (f) photo.read(f);
        }}
      >
        <Pressable isDisabled={photo.reading}>
          <Button variant="outline" disabled={photo.reading} data-testid={`${testId}-take`}>
            <Camera aria-hidden="true" /> {answer ? "Another Photo" : "Take or Choose a Photo"}
          </Button>
        </Pressable>
      </FileTrigger>
      {photo.reading && (
        <>
          <p role="status" className={cn("text-muted-foreground", TEXT.prose)}>
            Reading the page…
          </p>
          <SkeletonLines lines={4} />
        </>
      )}
      {photo.readError && (
        <FieldError className={cn(FINDING_TONE.stop, TEXT.prose)}>The page could not be read: {photo.readError.message}</FieldError>
      )}
      {answer?.unreadable && (
        <p role="alert" className={cn(FINDING_TONE.caution, TEXT.prose)}>
          {answer.unreadable}
        </p>
      )}
      {!!answer?.notes.length && (
        <ul className={cn("list-disc pl-5 text-muted-foreground", TEXT.detail)} aria-label="Not read">
          {answer.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {children}
    </SheetDialog>
  );
}
