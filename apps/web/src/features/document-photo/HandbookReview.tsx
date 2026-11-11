import { useId } from "react";
import FieldHit from "../../components/FieldHit";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { NumberField } from "../../components/ui/number-field";
import { FlagLines } from "./PhotoSheet";
import { tenth, type HandbookItem } from "./reads";
import type { DocumentPhoto } from "./useDocumentPhoto";

type Figure = HandbookItem["figures"][number];

/** A figure as read, to correct against the page: its value in the
 *  page's unit, and the app's where that is another. */
function FigureRow({ figure, onChange }: { figure: Figure; onChange: (value: number) => void }) {
  const id = useId();
  const converted = figure.unit !== figure.app_unit && figure.unit !== "as read";
  return (
    <ListRow
      title={figure.label}
      description={converted ? `${tenth(figure.app_value)} ${figure.app_unit}` : undefined}
      value={
        <span className="flex items-center gap-1.5">
          <FieldHit htmlFor={id}>
            <NumberField
              id={id}
              defaultValue={figure.value}
              className="h-8 w-24"
              inputClassName="text-right"
              aria-label={`${figure.label} in ${figure.unit}`}
              data-testid={`figure-${figure.path}`}
              // Taken as it is left, as React Aria's field gives it.
              onChange={(v) => {
                if (v != null && v !== figure.value) onChange(v);
              }}
            />
          </FieldHit>
          <span className="text-muted-foreground">{figure.unit}</span>
        </span>
      }
    />
  );
}

/**
 * The handbook's items as read, each with its figures (corrected here,
 * and the page checked again by the engine), what to check about it, and
 * a tick to keep it: none kept until the pilot ticks it.
 */
export default function HandbookReview({ photo }: { photo: DocumentPhoto }) {
  const items = photo.handbook?.check.items ?? [];
  if (!photo.handbook) return null;
  if (!items.length) return <p className="text-muted-foreground">No figures were read from this page.</p>;
  return (
    <>
      {items.map((item) => (
        <ListGroup key={item.key} title={item.title}>
          {item.figures.map((f) => (
            <FigureRow key={`${f.path}:${f.value}`} figure={f} onChange={(v) => photo.correct(f.path, v)} />
          ))}
          {item.flags.length > 0 && <ListRow title={<FlagLines flags={item.flags} testId={`flags-${item.key}`} />} />}
          <ListRow
            title="Keep These Figures"
            checkbox={{ checked: photo.confirmed.has(item.key), onChange: () => photo.toggle(item.key) }}
            data-testid={`keep-${item.key}`}
          />
        </ListGroup>
      ))}
    </>
  );
}
