import { useRef } from "react";
import { cn } from "cn";
import SheetDialog from "../../components/SheetDialog";
import { LINK } from "../../components/airplane/link";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FIGURE_WORDS } from "../../lib/airplane/figureWords";
import { TEXT } from "../../lib/text";
import { figureText, sourceWords } from "./profileModel";
import { useAirplaneProfile, type AirplaneProfileModel } from "./useAirplaneProfile";

/** One figure: its name and where it comes from, its field (typed in place,
 *  kept as the pilot's when it changes), and Reset to book figure where
 *  the pilot's or the photographed page's stands over the book's. */
function FigureRow({ vm, row }: { vm: AirplaneProfileModel; row: AirplaneProfileModel["rows"][number] }) {
  const words = FIGURE_WORDS[row.key];
  const typed = vm.drafts[row.key] ?? figureText(row.key, row.value);
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
          <Input
            type="text"
            inputMode="decimal"
            value={typed}
            placeholder="—"
            onChange={(e) => vm.setDraft(row.key, e.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={() => vm.commit(row.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            disabled={vm.busy === row.key}
            aria-label={`${words.label}, ${words.unit.replace(/^: /, "to ")}`}
            aria-invalid={!!problem}
            className={cn("h-8 w-24 text-right tabular-nums", TEXT.row)}
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
 * the app shows (lib/airplane/profileStore), over the page as every sheet
 * that asks something of the pilot is (SheetDialog); closing it is back
 * where the pilot was. Its N-number and type, then every figure with its
 * source, each editable in place. Signed out, what is set stays on this
 * device. Its view model is useAirplaneProfile.
 */
export default function AirplaneProfileSheet() {
  const vm = useAirplaneProfile();
  return (
    <SheetDialog
      open={vm.open}
      onOpenChange={(open) => {
        if (!open) vm.close();
      }}
      title={vm.tail}
      testId="airplane-profile"
      onOpenAutoFocus={(event) => {
        // On the figure it was opened for, where it was one.
        const field = vm.focus && (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>(`[data-figure="${vm.focus}"] input`);
        if (!field) return;
        event.preventDefault();
        field.focus();
        field.scrollIntoView({ block: "center" });
      }}
    >
      <div className="flex flex-col gap-5">
        <ListGroup>
          <ListRow title="Registration" value={vm.tail} />
          <ListRow title="Type" value={vm.type ?? "Not known"} data-testid="airplane-profile-type" />
        </ListGroup>
        <ListGroup title="Figures">
          {vm.rows.map((row) => (
            <FigureRow key={row.key} vm={vm} row={row} />
          ))}
        </ListGroup>
        <PhotoRead vm={vm} />
      </div>
    </SheetDialog>
  );
}
