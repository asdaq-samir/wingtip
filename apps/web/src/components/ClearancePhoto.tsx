import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { readPage } from "../lib/documentPhoto";
import { FINDING_TONE } from "../lib/findings";
import { TEXT } from "../lib/text";
import { useClaudeOn } from "../lib/subscription";

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
  const input = useRef<HTMLInputElement>(null);
  const reading = useMutation({ mutationFn: (photo: Blob) => readPage("clearance", photo) });
  const note = reading.data?.clearance;
  return (
    <div className="flex flex-col gap-2" data-testid="clearance-photo">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="clearance-photo-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) reading.mutate(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-tint"
        onClick={() => input.current?.click()}
        disabled={reading.isPending}
        data-testid="clearance-photo-take"
      >
        {reading.isPending ? <Spinner aria-hidden /> : <Camera aria-hidden="true" />} From a Photo
      </Button>
      {reading.isPending && (
        <p role="status" className={cn("text-muted-foreground", TEXT.detail)}>
          Reading the note…
        </p>
      )}
      {reading.error && (
        <p role="alert" className={cn(FINDING_TONE.stop, TEXT.detail)}>
          The note could not be read: {reading.error.message}
        </p>
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
