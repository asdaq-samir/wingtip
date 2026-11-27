import type { ReactNode } from "react";
import { cn } from "cn";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { LINK } from "../../components/airplane/link";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { NumberField } from "../../components/ui/number-field";
import { FieldError } from "../../components/ui/field";
import { FIGURE_WORDS } from "../../lib/airplane/figureWords";
import { TEXT } from "../../lib/text";
import { WORDING } from "../../lib/wording/generated/wording";
import { figureFormat, sourceWords } from "./profileModel";
import { EnduranceSection } from "./EnduranceSection";
import type { AirplaneProfileModel } from "./useAirplaneProfile";

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
            <span className={row.source == null ? "text-destructive-ink" : undefined}>{sourceWords(row.source)}</span>
            {row.resettable && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className={LINK}
                disabled={vm.busy === row.key}
                onClick={() => vm.reset(row.key)}
              >
                {/* Which figure, for a reader's list of buttons (WCAG 2.4.6), after the words seen (2.5.3). */}
                Reset to book figure<span className="sr-only">: {words.label}</span>
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
      {problem && <FieldError className={cn("px-4 pb-2 text-destructive-ink", TEXT.detail)}>{problem}</FieldError>}
    </div>
  );
}

/** Its handbook's specifications page photographed and read (usePhotoRead):
 *  the figures found filled in, the page's words to check them by, and
 *  Save to keep them all. */
function PhotoRead({ vm }: { vm: AirplaneProfileModel }) {
  const { busy, words, problem, read } = vm.photo;
  const pending = words.length > 0 && Object.keys(vm.drafts).length > 0;
  return (
    <div className="flex flex-col gap-2">
      {/* React Aria's FileTrigger: the hidden file input, opened by the row. */}
      <FileTrigger
        acceptedFileTypes={["image/*"]}
        defaultCamera="environment"
        onSelect={(files) => {
          const file = files?.[0];
          if (file) void read(file);
        }}
      >
        <ListGroup>
          <Pressable isDisabled={busy}>
            <ListRow title={busy ? WORDING.readingThePage : "Read from a Photo"} disabled={busy} />
          </Pressable>
        </ListGroup>
      </FileTrigger>
      <div className={cn("space-y-0.5 px-1", TEXT.detail)} role="status">
        {problem && <p className="text-destructive-ink">{problem}</p>}
        {words.length > 0 && <p className="font-semibold">Read from the page: check each against it before saving.</p>}
        {words.map((w) => (
          <p key={w} className="text-muted-foreground">
            {w}
          </p>
        ))}
      </div>
      {pending && (
        <Button type="button" size="sm" className="self-end" onClick={vm.commitAll}>
          Save
        </Button>
      )}
    </div>
  );
}

/**
 * The airplane card's Figures tab (AirplaneCard), only for an airplane the
 * planner can fly: every planning figure editable in place, a missing one
 * asking there, with where each comes from (the book's page cited); its
 * POH, the pilot's own PDF (`poh`, PohRow); its endurance; and its
 * handbook's page read from a photo. Signed out, what is set stays on this
 * device. Its view model is useAirplaneProfile.
 */
export default function FiguresTab({ vm, poh }: { vm: AirplaneProfileModel; poh: ReactNode }) {
  return (
    <>
      <ListGroup title="Figures">
        {vm.rows.map((row) => (
          <FigureRow key={row.key} vm={vm} row={row} />
        ))}
      </ListGroup>
      {poh}
      <EnduranceSection
        tail={vm.tail}
        usableGal={vm.rows.find((r) => r.key === "usable_fuel_gal")?.value ?? null}
        burnGph={vm.rows.find((r) => r.key === "fuel_burn_gph")?.value ?? null}
      />
      <PhotoRead vm={vm} />
    </>
  );
}
