import { useRef } from "react";
import { cn } from "cn";
import { SheetCard } from "../../components/SheetCard";
import { LINK } from "../../components/airplane/link";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { NumberField } from "../../components/ui/number-field";
import { FIGURE_WORDS } from "../../lib/airplane/figureWords";
import { TEXT } from "../../lib/text";
import { figureFormat, sourceWords } from "./profileModel";
import { EnduranceSection } from "./EnduranceSection";
import { useAirplaneProfile, type AirplaneProfileModel } from "./useAirplaneProfile";

/** One figure: its name and where it comes from, its field (typed in place,
 *  kept as the pilot's when it changes), and Reset to book figure where
 *  the pilot's or the photographed page's stands over the book's. */
function FigureRow({ vm, row }: { vm: AirplaneProfileModel; row: AirplaneProfileModel["rows"][number] }) {
  const words = FIGURE_WORDS[row.key];
  const shown = row.key in vm.drafts ? (vm.drafts[row.key] ?? null) : row.value;
  const problem = vm.problems[row.key];
  return (
    <div data-figure={row.key}>
      <ListRow
        title={words.label}
        description={
          <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className={row.source == null ? "text-destructive-ink" : undefined} data-testid={`figure-source-${row.key}`}>
              {sourceWords(row.source)}
            </span>
            {row.resettable && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={LINK}
                disabled={vm.busy === row.key}
                onClick={() => vm.reset(row.key)}
                data-testid={`figure-reset-${row.key}`}
              >
                Reset to book figure
              </Button>
            )}
          </span>
        }
      >
        <span className="flex items-center gap-1.5">
          {/* React Aria's number field, read in the pilot's locale (a comma
              decimal is a decimal), taken as it is left. */}
          <NumberField
            value={shown}
            placeholder="—"
            formatOptions={figureFormat(row.key)}
            minValue={0}
            onChange={(value) => vm.change(row.key, value)}
            isDisabled={vm.busy === row.key}
            aria-label={`${words.label}, ${words.unit.replace(/^: /, "to ")}`}
            isInvalid={!!problem}
            className="h-8 w-24"
            inputClassName={cn("text-right", TEXT.row)}
            data-testid={`figure-${row.key}`}
          />
          <span className="w-10 text-muted-foreground">{words.unit}</span>
        </span>
      </ListRow>
      {problem && (
        <p className={cn("px-4 pb-2 text-destructive-ink", TEXT.detail)} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Its handbook's specifications page photographed and read (usePhotoRead):
 *  the figures found filled in, the page's words to check them by, and
 *  Save to keep them all. */
function PhotoRead({ vm }: { vm: AirplaneProfileModel }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, words, problem, read } = vm.photo;
  const pending = words.length > 0 && Object.keys(vm.drafts).length > 0;
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="profile-photo-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
      <ListGroup>
        <ListRow title={busy ? "Reading the page…" : "Read from a Photo"} disabled={busy} onClick={() => input.current?.click()} />
      </ListGroup>
      <div className={cn("space-y-0.5 px-1", TEXT.detail)} role="status" data-testid="profile-photo-read">
        {problem && <p className="text-destructive-ink">{problem}</p>}
        {words.length > 0 && <p className="font-semibold">Read from the page: check each against it before saving.</p>}
        {words.map((w) => (
          <p key={w} className="text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      {pending && (
        <Button type="button" size="sm" className="self-end" onClick={vm.commitAll} data-testid="profile-photo-save">
          Save
        </Button>
      )}
    </div>
  );
}

/**
 * An airplane's profile, opened from any N-number and any airplane figure
 * the app shows (lib/airplane/profileStore): a card in the map's sheet over
 * the search, with its ✕, on a phone as in a desktop's side panel, as
 * every thing is by the one card rule (the owner, 2026-11-10), where on a
 * phone it was a dimmed sheet over the page. Closing it is back where the
 * pilot was. Its N-number and type, then every figure with its source,
 * each editable in place. Signed out, what is set stays on this device.
 * Its view model is useAirplaneProfile.
 */
export default function AirplaneProfileSheet() {
  const vm = useAirplaneProfile();
  return (
    <SheetCard
      title={vm.tail}
      onClose={vm.close}
      testId="airplane-profile"
      // On the figure it was opened for, where it was one.
      initialFocus={() => {
        const field = vm.focus ? document.querySelector<HTMLInputElement>(`[data-figure="${vm.focus}"] input`) : null;
        field?.scrollIntoView({ block: "center" });
        return field ?? true;
      }}
    >
      <div className="flex flex-col gap-5">
        {/* First, as the one-search design has it (2026-11-09): this
            airplane the plan's, and the plan shown. */}
        <Button type="button" className="h-11 w-full" disabled={vm.flying} onClick={vm.fly} data-testid="fly-this-airplane">
          {vm.flying ? "Flying This Airplane" : "Fly This Airplane"}
        </Button>
        <ListGroup>
          <ListRow title="Registration" value={vm.tail} />
          <ListRow title="Type" value={vm.type ?? "Not known"} data-testid="airplane-profile-type" />
        </ListGroup>
        <ListGroup title="Figures">
          {vm.rows.map((row) => (
            <FigureRow key={row.key} vm={vm} row={row} />
          ))}
        </ListGroup>
        <EnduranceSection
          tail={vm.tail}
          usableGal={vm.rows.find((r) => r.key === "usable_fuel_gal")?.value ?? null}
          burnGph={vm.rows.find((r) => r.key === "fuel_burn_gph")?.value ?? null}
        />
        <PhotoRead vm={vm} />
      </div>
    </SheetCard>
  );
}
