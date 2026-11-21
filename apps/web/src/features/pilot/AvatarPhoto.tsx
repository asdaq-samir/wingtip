import { useRef } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { FieldError } from "../../components/ui/field";
import type { Pilot } from "../../lib/api/types";
import { TEXT } from "../../lib/text";
import { LargeFace } from "./AccountFace";
import { useAvatarPhoto } from "./useAvatarPhoto";

/** A 44-point hit area around a link's words, which do not grow for it. */
const HIT = "relative hit-x-2 hit-y-3";

/**
 * The pilot's avatar atop Pilot Details, with Choose Photo under it and
 * Remove Photo beside that once there is one, as Contacts heads a card
 * (the owner, 2026-11-20: "Yes to choose photo"). A web page cannot read
 * the phone's own profile picture, so Choose Photo opens the system's
 * picker -- on an iPhone, Photos, the camera or Files.
 */
export function AvatarPhoto({ pilot }: { pilot: Pilot }) {
  const picker = useRef<HTMLInputElement>(null);
  const photo = useAvatarPhoto();
  return (
    <div className="flex flex-col items-center gap-1" data-testid="pilot-photo">
      <LargeFace name={pilot.fullName || pilot.displayName} photo={pilot.avatarUrl} />
      <div className="flex gap-6">
        <Button
          variant="link"
          size="inline"
          className={cn(HIT, TEXT.row)}
          disabled={photo.busy}
          onClick={() => picker.current?.click()}
          data-testid="choose-photo"
        >
          Choose Photo
        </Button>
        {pilot.avatarUrl && (
          <Button
            variant="link"
            size="inline"
            className={cn(HIT, TEXT.row, "text-destructive-ink")}
            disabled={photo.busy}
            onClick={photo.remove}
            data-testid="remove-photo"
          >
            Remove Photo
          </Button>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared, so the same photo picked again is a change.
          e.target.value = "";
          if (file) photo.choose(file);
        }}
      />
      {/* Said as it happens (WCAG 4.1.3): the stock field error, an alert. */}
      {photo.problem && <FieldError className={cn("px-4 text-center", TEXT.detail)}>{photo.problem}</FieldError>}
    </div>
  );
}
