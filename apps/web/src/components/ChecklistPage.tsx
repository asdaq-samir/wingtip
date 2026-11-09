import { useMemo, useState } from "react";
import { cn } from "cn";
import { ListGroup, ListRow } from "./GroupedList";
import Segmented from "./Segmented";
import { Textarea } from "./ui/textarea";
import { checklistOf } from "../lib/checklist";
import { checklistText, phasesText, saveChecklist, useChecklists, type ChecklistKind } from "../lib/checklists";
import { TEXT } from "../lib/text";
import { openEmergency } from "../lib/emergencyStore";

const KINDS = [
  { value: "normal", label: "Normal" },
  { value: "emergency", label: "Emergency" },
];

/**
 * An airplane's checklists, kept in this browser (lib/checklists): its
 * normal procedures and its emergency ones, a segmented control between
 * them. Run, each item ticked as it is done, a section's count beside its
 * title -- or written, as plain text (lib/checklist), a section a line
 * starting "#", an item a line with its response after a dash. The app
 * writes no items of its own: the airplane's handbook's are the pilot's
 * to copy, so an empty list offers the phases' headings alone to write
 * under. The ticks are this run's, kept on the page until Start over.
 *
 * `kind` is where it opens, the normal list by default.
 */
export default function ChecklistPage({
  airplane,
  name,
  kind: opening = "normal",
}: {
  /** The airplane's aircraftKey (lib/aircraftChoice). */
  airplane: string;
  /** Its name, as the editor's label says it ("N12345", "C172"). */
  name: string;
  kind?: ChecklistKind;
}) {
  const [kind, setKind] = useState<ChecklistKind>(opening);
  const text = useChecklists((s) => checklistText(s.value, airplane, kind));
  // Read by the shared engine, as the iPhone and Android read it.
  const checklist = useMemo(() => checklistOf(text), [text]);
  const [writing, setWriting] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const switchTo = (next: string) => {
    setKind(next as ChecklistKind);
    setWriting(null);
    setTicked({});
  };
  const kinds = (
    <Segmented label="Checklist" value={kind} onChange={switchTo} options={KINDS} className="w-full [&>*]:flex-1" testId="checklist-kind" />
  );

  if (writing !== null) {
    return (
      <div className="space-y-3">
        {kinds}
        {/* A line starting # is a section; every other line an item, its
            response after a dash, as the placeholder shows. */}
        <ListGroup>
          <div className="p-2">
            <Textarea
              value={writing}
              onChange={(e) => setWriting(e.target.value)}
              rows={14}
              className="font-mono"
              aria-label={`${name} ${kind} checklist`}
              data-testid="checklist-text"
              placeholder={"# Before takeoff\nFuel selector -- Both\nMixture -- Rich"}
            />
          </div>
        </ListGroup>
        <ListGroup>
          <ListRow
            title={<span className="font-medium text-tint">Save checklist</span>}
            onClick={() => {
              saveChecklist(airplane, kind, writing);
              setWriting(null);
              setTicked({});
            }}
            data-testid="checklist-save"
          />
          {/* Only into an empty editor: it never writes over the pilot's. */}
          {!writing.trim() && (
            <ListRow
              title="Start from the phases"
              description="Their headings only, to write your airplane's items under"
              onClick={() => setWriting(phasesText(kind))}
              data-testid="checklist-phases"
            />
          )}
          <ListRow title="Cancel" onClick={() => setWriting(null)} />
        </ListGroup>
      </div>
    );
  }

  const empty = checklist.sections.length === 0;
  return (
    <div className="space-y-4" data-testid="checklist" data-kind={kind}>
      {kinds}
      {empty && (
        <ListGroup>
          <ListRow
            title={kind === "emergency" ? "No emergency checklist yet" : "No checklist yet"}
            description="Write it from your airplane's handbook"
          />
        </ListGroup>
      )}
      {checklist.sections.map((section, s) => {
        const done = section.items.filter((_, i) => ticked[`${s}:${i}`]).length;
        return (
          <ListGroup
            key={`${s}:${section.title}`}
            title={section.title}
            badge={
              <span className={cn("tabular-nums text-muted-foreground", TEXT.note)}>
                {done} of {section.items.length}
              </span>
            }
          >
            {section.items.map((item, i) => {
              const on = !!ticked[`${s}:${i}`];
              return (
                <ListRow
                  key={i}
                  checkbox={{ checked: on, onChange: (next) => setTicked((t) => ({ ...t, [`${s}:${i}`]: next })) }}
                  title={<span className={cn(on && "text-muted-foreground")}>{item.challenge}</span>}
                  value={item.response ?? undefined}
                  data-testid="checklist-item"
                />
              );
            })}
          </ListGroup>
        );
      })}
      {/* From the emergency list, the assistant: the best fields within a
          glide, this list opened at the emergency, the MAYDAY. */}
      {kind === "emergency" && (
        <ListGroup>
          <ListRow
            title={<span className="font-medium text-tint">Emergency assistant</span>}
            description="Best fields within a glide, the checklist and the MAYDAY"
            onClick={() => openEmergency("checklist")}
            data-testid="checklist-emergency"
          />
        </ListGroup>
      )}
      <ListGroup>
        {!empty && (
          <ListRow
            title="Start over"
            onClick={() => setTicked({})}
            disabled={!Object.values(ticked).some(Boolean)}
            data-testid="checklist-reset"
          />
        )}
        <ListRow
          title={empty ? "Write the checklist" : "Edit the checklist"}
          onClick={() => setWriting(text)}
          data-testid="checklist-edit"
        />
      </ListGroup>
    </div>
  );
}
