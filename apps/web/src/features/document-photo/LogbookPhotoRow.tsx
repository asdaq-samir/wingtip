import { useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "cn";
import { ListRow } from "../../components/GroupedList";
import { FINDING_TONE } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import LogbookReview from "./LogbookReview";
import PhotoSheet from "./PhotoSheet";
import { useDocumentPhoto } from "./useDocumentPhoto";
import { useClaudeOn } from "../../lib/subscription";
import { FieldError } from "../../components/ui/field";

/**
 * The logbook's "Add from a Photo": a paper logbook page photographed,
 * read, each flight checked by the engine (14 CFR 61.51) and ticked to
 * log; "Log" logs the ticked ones through the logbook, as a typed flight
 * is. Nothing is logged unticked.
 * Claude reads the photo, so this is not offered while the deployment keeps
 * Claude off (lib/subscription, the owner's decision of 2026-11-10).
 */
export function LogbookPhotoRow() {
  return useClaudeOn() ? <ReadLogbookPhoto /> : null;
}

function ReadLogbookPhoto() {
  const photo = useDocumentPhoto("logbook-page");
  const [open, setOpen] = useState(false);
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) photo.reset();
  };
  const n = photo.toLog;
  return (
    <>
      <ListRow
        title={
          <span className="flex items-center gap-2 font-medium text-tint">
            <Camera className="size-4" aria-hidden="true" />
            Add from a Photo
          </span>
        }
        description="A page of your paper logbook"
        onClick={() => setOpen(true)}
        data-testid="logbook-photo"
      />
      <PhotoSheet
        photo={photo}
        open={open}
        onOpenChange={close}
        title="Add from a Photo"
        testId="logbook-photo-sheet"
        action={{
          label: n > 1 ? `Log ${n} Flights` : "Log",
          onClick: () => photo.log(),
          disabled: !n || photo.logging,
          testId: "logbook-photo-log",
        }}
      >
        <LogbookReview photo={photo} />
        {photo.logError && (
          <FieldError className={cn(FINDING_TONE.stop, TEXT.prose)}>It could not be logged: {photo.logError.message}</FieldError>
        )}
      </PhotoSheet>
    </>
  );
}
