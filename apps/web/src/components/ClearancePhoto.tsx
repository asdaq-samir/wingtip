import { useMutation } from "@tanstack/react-query";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { Camera } from "lucide-react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { readPage } from "../lib/documentPhoto";
import { FINDING_TONE } from "../lib/findings";
import { TEXT } from "../lib/text";
import { useClaudeOn } from "../lib/subscription";
import { FieldError } from "./ui/field";

/**
 * The clearance card's "From a Photo": a clearance or ATIS copied down on
 * a kneeboard, photographed and read into the controller's words, shown
 * beside the note as written; "Use It" puts the words where a clearance
 * is typed, for the card's own reader (the engine's read_clearance) to
 * read as it reads a typed one. Nothing is entered in the plan from here.
 * Claude reads the photo, so this is not offered while the deployment keeps
 * Claude off (lib/subscription, the owner's decision of 2026-11-10).
 */
export default function ClearancePhoto(props: { onRead: (said: string) => void }) {
  return useClaudeOn() ? <ReadClearancePhoto {...props} /> : null;
}

function ReadClearancePhoto({ onRead }: { onRead: (said: string) => void }) {
  const reading = useMutation({ mutationFn: (photo: Blob) => readPage("clearance", photo) });
  const note = reading.data?.clearance;
  return (
    <div className="flex flex-col gap-2" data-testid="clearance-photo">
      {/* React Aria's FileTrigger: the hidden file input, opened by the button. */}
      <FileTrigger
        acceptedFileTypes={["image/*"]}
        defaultCamera="environment"
        data-testid="clearance-photo-file"
        onSelect={(files) => {
          const f = files?.[0];
          if (f) reading.mutate(f);
        }}
      >
        <Pressable isDisabled={reading.isPending}>
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-tint"
            disabled={reading.isPending}
            data-testid="clearance-photo-take"
          >
            {reading.isPending ? <Spinner aria-hidden /> : <Camera aria-hidden="true" />} From a Photo
          </Button>
        </Pressable>
      </FileTrigger>
      {reading.isPending && (
        <p role="status" className={cn("text-muted-foreground", TEXT.detail)}>
          Reading the note…
        </p>
      )}
      {reading.error && (
        <FieldError className={cn(FINDING_TONE.stop, TEXT.detail)}>The note could not be read: {reading.error.message}</FieldError>
      )}
      {reading.data?.unreadable && (
        <p role="alert" className={cn(FINDING_TONE.caution, TEXT.detail)}>
          {reading.data.unreadable}
        </p>
      )}
      {note && (
        <div className="flex flex-col gap-1.5">
          <pre className={cn("whitespace-pre-wrap rounded-md bg-muted p-2 font-mono", TEXT.detail)} aria-label="The note as written">
            {note.written}
          </pre>
          <p className={TEXT.detail} data-testid="clearance-photo-said">
            {note.said}
          </p>
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              onRead(note.said);
              reading.reset();
            }}
            data-testid="clearance-photo-use"
          >
            Use It
          </Button>
        </div>
      )}
    </div>
  );
}
