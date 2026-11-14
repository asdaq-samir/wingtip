import { ToggleGroup } from "../../components/ui/toggle-group";
import { LayerPictureTile } from "../../components/LayerTile";
import SectionTitle from "../../components/SectionTitle";

export interface PictureChoice {
  value: string;
  label: string;
  src?: string;
  /** The picture's own look where it has no picture: a swatch. */
  className?: string;
}

/**
 * A pick of one of a few, each a picture, as Apple Maps' "Choose Map"
 * card sets its maps (the owner's screenshot, 2026-11-10): two by two in
 * the layers' tiles' size and form (LayerPictureTile; the owner,
 * 2026-11-14: "every section should have 4 tiles like Layers one"), the
 * picture the tile's face and its name on one line in the name's place,
 * the one picked marked as a layer that is on. The stock ToggleGroup
 * underneath, so each is a radio to a screen reader and the arrow keys
 * move between them; a pick applies at once, with nothing to confirm.
 */
export default function MapPictureChoices({
  title,
  value,
  onChange,
  options,
  testId,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: PictureChoice[];
  testId: string;
}) {
  return (
    <section className="flex flex-col">
      {/* Set as a list group's title is (GroupedList), at the card's one
          sixteen-point edge (the sheet audit's F-B3). */}
      <div className="pb-1.5">
        <SectionTitle>{title}</SectionTitle>
      </div>
      <ToggleGroup
        value={[value]}
        onValueChange={(v) => {
          if (v[0]) onChange(v[0]);
        }}
        aria-label={title}
        data-testid={testId}
        // The layers' grid (MapLayers), so every section's tiles line up.
        className="grid w-full auto-rows-fr grid-cols-2 gap-2"
      >
        {options.map((o) => (
          <LayerPictureTile key={o.value} {...o} />
        ))}
      </ToggleGroup>
    </section>
  );
}
