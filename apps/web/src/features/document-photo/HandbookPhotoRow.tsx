import { useState } from "react";
import { Camera } from "lucide-react";
import { ListRow } from "../../components/GroupedList";
import Segmented from "../../components/Segmented";
import HandbookReview from "./HandbookReview";
import PhotoSheet from "./PhotoSheet";
import { useDocumentPhoto, type Confirmed } from "./useDocumentPhoto";

const PAGES = [
  { value: "poh-performance", label: "Performance" },
  { value: "weight-balance", label: "Weight & Balance" },
];

/**
 * The airplane form's "Add from a Photo": a handbook's performance or
 * weight and balance page photographed, read, checked by the engine and
 * reviewed item by item; "Use Confirmed Figures" hands the kept items'
 * figures to the form (`onConfirmed`), which the pilot then saves with
 * the airplane. Nothing is saved from here.
 */
export function HandbookPhotoRow({
  onConfirmed,
  pending,
}: {
  onConfirmed: (figures: Confirmed) => void;
  /** Confirmed figures are waiting for the form's Save. */
  pending: boolean;
}) {
  const photo = useDocumentPhoto("poh-performance");
  const [open, setOpen] = useState(false);
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) photo.reset();
  };
  const use = () => {
    const figures = photo.confirmedHandbook();
    if (figures) onConfirmed(figures);
    close(false);
  };
  return (
    <>
      <ListRow
        title={
          <span className="flex items-center gap-2 font-medium text-tint">
            <Camera className="size-4" aria-hidden="true" />
            Add from a Photo
          </span>
        }
        description={pending ? "Confirmed figures are kept when you save" : "The handbook's performance or weight and balance page"}
        onClick={() => setOpen(true)}
        data-testid="aircraft-photo"
      />
      <PhotoSheet
        photo={photo}
        open={open}
        onOpenChange={close}
        title="Add from a Photo"
        testId="handbook-photo"
        choose={
          !photo.answer && (
            <Segmented
              label="Which page"
              value={photo.kind}
              onChange={(v) => photo.setKind(v as typeof photo.kind)}
              options={PAGES}
              className="w-full [&>*]:flex-1"
              testId="handbook-photo-page"
            />
          )
        }
        action={{ label: "Use Confirmed Figures", onClick: use, disabled: !photo.confirmed.size, testId: "handbook-photo-use" }}
      >
        <HandbookReview photo={photo} />
      </PhotoSheet>
    </>
  );
}
