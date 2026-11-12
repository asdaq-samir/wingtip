import { useState } from "react";
import { FileTrigger } from "react-aria-components";
import { Pressable } from "react-aria/Pressable";
import { useMutation } from "@tanstack/react-query";
import { FileDown, FileUp } from "lucide-react";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PullDown from "../../components/PullDown";
import { api, describeError } from "../../lib/api/client";
import type { LogbookEntry } from "../../lib/api/types";
import { localDay } from "../../lib/format";
import { said } from "../../lib/endorsements";
import { shareFile } from "../../lib/flightPlanFiles";
import { COLUMN_TARGETS, csvRows, guessColumns, headerRowOf, missingColumns, remapped, type Columns } from "./logbookColumns";
import { importLogbook, logbookCsv, type Imported } from "./logbookCsv";
import { showError } from "../../lib/problems";

/** A file read and its columns as the pilot gave them, kept so the
 *  preview can go back to them. */
interface Mapping {
  rows: string[][];
  headerAt: number;
  columns: Columns;
}

/** Where an import stands: a file's columns being said, its flights
 *  shown before they go in, or nothing in hand. */
type Step =
  | { kind: "idle" }
  | { kind: "columns"; name: string; mapping: Mapping }
  | { kind: "preview"; name: string; read: Imported; mapping: Mapping | null };

const PREVIEW_ROWS = 5;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The logbook to and from a CSV file, the Logbook's File group: ForeFlight's
 * export or this logbook's own read as they are, any other (MyFlightbook's,
 * a spreadsheet's) by its columns, said by the pilot from a guess; then
 * the flights read shown -- how many, the first few, the rows left out and
 * why -- before any is sent, and those already in the logbook (the same
 * day, airplane, route and time) not added twice. Out, the logbook in
 * ForeFlight's column names (features/pilot/logbookCsv).
 */
export default function LogbookFile({ entries, onImported }: { entries: LogbookEntry[] | undefined; onImported: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [done, setDone] = useState<string | null>(null);

  // A file read: as ForeFlight's or this logbook's own where the engine
  // finds its flights, else to its columns, guessed.
  const open = async (file: File) => {
    setDone(null);
    const text = await file.text();
    const read = importLogbook(text);
    if (read.entries.length) {
      setStep({ kind: "preview", name: file.name, read, mapping: null });
      return;
    }
    const rows = csvRows(text);
    const headerAt = headerRowOf(rows);
    if (headerAt < 0) {
      showError("Could not import the logbook", `${file.name} has no rows.`);
      return;
    }
    setStep({ kind: "columns", name: file.name, mapping: { rows, headerAt, columns: guessColumns(rows[headerAt] ?? []) } });
  };

  const bringIn = useMutation({
    mutationFn: (read: Imported) => api.logbook.importAll(read.entries),
    onSuccess: (result, read) => {
      setDone(
        [
          `${plural(result.added, "flight")} added`,
          result.duplicates ? `${result.duplicates} already in your logbook` : "",
          read.skipped.length ? `${plural(read.skipped.length, "row")} left out` : "",
        ]
          .filter(Boolean)
          .join(", ") + ".",
      );
      setStep({ kind: "idle" });
      onImported();
    },
    onError: (err) => showError("Could not import the logbook", describeError(err)),
  });

  const exportFile = async () => {
    try {
      await shareFile(`logbook-${localDay()}.csv`, "text/csv", logbookCsv(entries ?? []));
    } catch (err) {
      if ((err as Error).name !== "AbortError") showError("Could not export the logbook", (err as Error).message);
    }
  };

  return (
    // A CSV file: ForeFlight's logbook export, MyFlightbook's or any
    // spreadsheet's by its columns, or this logbook's own. What an import
    // brought in, said in a row.
    <ListGroup title="File">
      {done && <ListRow muted title={<>{done}</>} data-testid="logbook-imported" />}
      {step.kind === "columns" && <ColumnRows step={step} onStep={setStep} />}
      {step.kind === "preview" && (
        <PreviewRows
          step={step}
          importing={bringIn.isPending}
          onImport={() => bringIn.mutate(step.read)}
          onColumns={step.mapping ? () => setStep({ kind: "columns", name: step.name, mapping: step.mapping! }) : undefined}
          onCancel={() => setStep({ kind: "idle" })}
        />
      )}
      {step.kind === "idle" && (
        <>
          {/* React Aria's FileTrigger: the hidden file input, opened by the row. */}
          <FileTrigger
            acceptedFileTypes={[".csv", "text/csv"]}
            data-testid="logbook-import-file"
            onSelect={(files) => {
              const file = files?.[0];
              if (file) void open(file);
            }}
          >
            <Pressable>
              <ListRow
                title="Import a logbook"
                description="ForeFlight, MyFlightbook or any CSV"
                media={<FileUp className="size-5" />}
                data-testid="logbook-import"
              />
            </Pressable>
          </FileTrigger>
          <ListRow
            title="Export as CSV"
            media={<FileDown className="size-5" />}
            onClick={() => void exportFile()}
            disabled={!entries?.length}
            data-testid="logbook-export"
          />
        </>
      )}
    </ListGroup>
  );
}

/** Which of the file's columns each field is read from, each a pull-down
 *  of the file's own names; the flights read once the three the engine
 *  needs are given. */
function ColumnRows({ step, onStep }: { step: Extract<Step, { kind: "columns" }>; onStep: (s: Step) => void }) {
  const { rows, headerAt, columns } = step.mapping;
  const header = rows[headerAt] ?? [];
  const missing = missingColumns(columns);
  const options = [
    { value: "none", label: "None" },
    ...header.map((name, i) => ({ value: String(i), label: name.trim() || `Column ${i + 1}` })),
  ];
  const set = (field: string, value: string) =>
    onStep({ ...step, mapping: { ...step.mapping, columns: { ...columns, [field]: value === "none" ? null : Number(value) } } });
  const read = () =>
    onStep({ kind: "preview", name: step.name, mapping: step.mapping, read: importLogbook(remapped(rows, headerAt, columns)) });
  return (
    <>
      <ListRow
        muted
        data-testid="logbook-columns-note"
        title={
          <>
            {step.name}: say which column is which
            {missing.length ? `. Needed: ${missing.map((t) => t.label.toLowerCase()).join(", ")}` : ""}.
          </>
        }
      />
      {COLUMN_TARGETS.map((t) => (
        <ListRow key={t.field} title={t.label}>
          <PullDown
            label={`The column for ${t.label.toLowerCase()}`}
            value={columns[t.field] == null ? "none" : String(columns[t.field])}
            options={options}
            onChange={(v) => set(t.field, v)}
            testId={`logbook-column-${t.field}`}
          />
        </ListRow>
      ))}
      <ListRow
        title={<span className="font-medium text-tint">Read the flights</span>}
        onClick={read}
        disabled={missing.length > 0}
        data-testid="logbook-columns-read"
      />
      <ListRow title={<span className="text-tint">Cancel</span>} onClick={() => onStep({ kind: "idle" })} />
    </>
  );
}

/** The flights read, before they go in: how many, the first few, and the
 *  rows left out with their lines and why. */
function PreviewRows({
  step,
  importing,
  onImport,
  onColumns,
  onCancel,
}: {
  step: Extract<Step, { kind: "preview" }>;
  importing: boolean;
  onImport: () => void;
  onColumns?: () => void;
  onCancel: () => void;
}) {
  const { entries, skipped } = step.read;
  return (
    <>
      <ListRow
        muted
        data-testid="logbook-preview-note"
        title={
          <>
            {step.name}: {plural(entries.length, "flight")} read{skipped.length ? `, ${plural(skipped.length, "row")} left out` : ""}.
          </>
        }
      />
      {entries.slice(0, PREVIEW_ROWS).map((e, i) => (
        <ListRow
          key={i}
          data-testid="logbook-preview-entry"
          title={`${said(e.flownOn)}${e.route ? ` · ${e.route}` : ""}`}
          description={[e.aircraft, e.aircraftType, plural(e.dayLandings + e.nightLandings, "landing")].filter(Boolean).join(" · ")}
          value={`${e.totalHours.toFixed(1)} h`}
        />
      ))}
      {entries.length > PREVIEW_ROWS && <ListRow muted title={<>And {entries.length - PREVIEW_ROWS} more</>} />}
      {skipped.slice(0, 3).map((s) => (
        <ListRow
          key={s.line}
          muted
          title={
            <>
              Line {s.line}: {s.reason}
            </>
          }
          data-testid="logbook-preview-skipped"
        />
      ))}
      {skipped.length > 3 && <ListRow muted title={<>And {skipped.length - 3} more left out</>} />}
      <ListRow
        title={<span className="font-medium text-tint">Import {plural(entries.length, "flight")}</span>}
        onClick={onImport}
        disabled={importing || !entries.length}
        data-testid="logbook-preview-import"
      />
      {onColumns && <ListRow title={<span className="text-tint">Change columns</span>} onClick={onColumns} />}
      <ListRow title={<span className="text-tint">Cancel</span>} onClick={onCancel} data-testid="logbook-preview-cancel" />
    </>
  );
}
