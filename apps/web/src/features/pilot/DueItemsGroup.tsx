import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { cn } from "cn";
import FieldHit from "../../components/FieldHit";
import IconButton from "../../components/IconButton";
import PullDown from "../../components/PullDown";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Input } from "../../components/ui/input";
import { DateField } from "../../components/ui/date-field";
import { NumberField } from "../../components/ui/number-field";
import { useConfirm } from "../../components/useConfirm";
import { api } from "../../lib/api/client";
import type { Aircraft, DueItem, DueItemRequest } from "../../lib/api/types";
import { localDay } from "../../lib/format";
import { FINDING_TONE } from "../../lib/findings";
import { daysBetween, dueTone, whenWords } from "./paperwork";
import { done } from "../../lib/doneNote";

const KINDS: { value: DueItemRequest["kind"]; label: string }[] = [
  { value: "AD", label: "Airworthiness directive" },
  { value: "OTHER", label: "Other" },
];

/** The form's fields, strings as the inputs hold them. */
interface Draft {
  kind: DueItemRequest["kind"];
  title: string;
  reference: string;
  method: string;
  dueOn: string;
  dueAtHours: string;
}
const BLANK: Draft = { kind: "AD", title: "", reference: "", method: "", dueOn: "", dueAtHours: "" };
const draftOf = (i: DueItem): Draft => ({
  kind: i.kind,
  title: i.title,
  reference: i.reference ?? "",
  method: i.method ?? "",
  dueOn: i.dueOn ?? "",
  dueAtHours: i.dueAtHours == null ? "" : String(i.dueAtHours),
});

/** What is left to an item, by its day or its hours against the hours now. */
function standingOf(i: DueItem, hoursNow: number | null | undefined) {
  const daysLeft = i.dueOn ? daysBetween(localDay(), i.dueOn) : null;
  const hoursLeft = i.dueAtHours != null && hoursNow != null ? Math.round((i.dueAtHours - hoursNow) * 10) / 10 : null;
  return { daysLeft, hoursLeft, dueAtHours: i.dueAtHours ?? null };
}

/**
 * What else falls due on the airplane as its owner keeps it, under its
 * inspections: each AD's status as 14 CFR 91.417(a)(2)(v) asks it kept --
 * its number and revision date, the method of compliance, and when the
 * next action is required, by day or by time in service -- and any other
 * item the owner wants reminded of. A row opens it to change; the plus
 * adds one. Each item saved on its own, apart from the airplane's Save.
 * Dated ones are in the Logbook's Coming up and the reminder emails.
 */
export default function DueItemsGroup({ aircraft }: { aircraft: Aircraft }) {
  const queryClient = useQueryClient();
  const id = useId();
  // The item open: a new one (null id), one of the list's, or none.
  const [open, setOpen] = useState<{ id: number | null; draft: Draft } | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["aircraft"] });
    void queryClient.invalidateQueries({ queryKey: ["paperwork"] });
  };
  const save = useMutation({
    mutationFn: ({ itemId, request }: { itemId: number | null; request: DueItemRequest }) =>
      itemId == null ? api.aircraft.addDueItem(aircraft.id, request) : api.aircraft.updateDueItem(aircraft.id, itemId, request),
    onSuccess: () => {
      done("Item Saved");
      setOpen(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (itemId: number) => api.aircraft.removeDueItem(aircraft.id, itemId),
    onSuccess: () => {
      setOpen(null);
      refresh();
    },
  });
  const [askDelete, deleteDialog] = useConfirm({
    title: "Take this item off the airplane?",
    description: "Its record and its reminders go. This can't be undone.",
    confirmLabel: "Delete",
    destructive: true,
    onConfirm: () => {
      if (open?.id != null) remove.mutate(open.id);
    },
  });

  const draft = open?.draft;
  const hours = draft?.dueAtHours.trim() ? Number(draft.dueAtHours) : null;
  const problem = !draft
    ? null
    : !draft.title.trim()
      ? "A title is needed"
      : hours != null && !(Number.isFinite(hours) && hours >= 0)
        ? "Hours cannot be negative"
        : null;
  const set = (change: Partial<Draft>) => setOpen((o) => (o ? { ...o, draft: { ...o.draft, ...change } } : o));
  const field = (key: "title" | "reference" | "method", label: string, placeholder: string, max: number) => (
    <ListRow id={`${id}-${key}`} title={label}>
      <FieldHit htmlFor={`${id}-${key}`}>
        <Input
          id={`${id}-${key}`}
          className="h-8 w-44 text-right"
          placeholder={placeholder}
          maxLength={max}
          value={draft?.[key] ?? ""}
          onChange={(e) => set({ [key]: e.target.value })}
          aria-label={label}
          data-testid={`due-item-${key}`}
        />
      </FieldHit>
    </ListRow>
  );

  return (
    <ListGroup
      title="ADs and other items"
      action={
        !open ? (
          <IconButton
            label="Add an item"
            className="text-tint"
            onClick={() => setOpen({ id: null, draft: BLANK })}
            data-testid="due-item-add"
          >
            <Plus />
          </IconButton>
        ) : undefined
      }
    >
      {!open && !aircraft.dueItems?.length && <ListRow muted title="None kept: the plus adds an AD or another item." />}
      {!open &&
        aircraft.dueItems?.map((i) => {
          const standing = standingOf(i, aircraft.inspections?.hoursNow);
          const dated = i.dueOn != null || i.dueAtHours != null;
          return (
            <ListRow
              key={i.id}
              data-testid="due-item"
              title={i.kind === "AD" && i.reference ? `${i.reference} · ${i.title}` : i.title}
              description={
                [i.method, i.dueOn ? `Due ${i.dueOn}` : null, i.dueAtHours != null ? `At ${i.dueAtHours.toFixed(1)} h` : null]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              value={dated ? <span className={cn(FINDING_TONE[dueTone(standing)])}>{whenWords(standing)}</span> : undefined}
              onClick={() => setOpen({ id: i.id, draft: draftOf(i) })}
            />
          );
        })}
      {open && draft && (
        <>
          <ListRow title="Kind">
            <PullDown
              label="What the item is"
              value={draft.kind}
              options={KINDS}
              onChange={(kind) => set({ kind })}
              testId="due-item-kind"
            />
          </ListRow>
          {field("title", "Title", draft.kind === "AD" ? "Oil filter adapter" : "Fire extinguisher", 120)}
          {field("reference", draft.kind === "AD" ? "AD number" : "Reference", draft.kind === "AD" ? "AD 2011-10-09" : "", 60)}
          {field("method", "Method of compliance", "Inspect each 100 h", 200)}
          <ListRow id={`${id}-on`} title="Next due on">
            <DateField
              id={`${id}-on`}
              className="h-8 w-40"
              value={draft.dueOn}
              onChange={(dueOn) => set({ dueOn })}
              aria-label="Next due on"
              data-testid="due-item-dueOn"
            />
          </ListRow>
          <ListRow id={`${id}-at`} title="Next due at hours">
            <FieldHit htmlFor={`${id}-at`}>
              <NumberField
                id={`${id}-at`}
                className="h-8 w-28"
                inputClassName="text-right"
                value={draft.dueAtHours === "" ? null : Number(draft.dueAtHours)}
                onChange={(v) => set({ dueAtHours: v == null ? "" : String(v) })}
                aria-label="Next due at hours of time in service"
                isInvalid={problem === "Hours cannot be negative"}
                data-testid="due-item-dueAtHours"
              />
            </FieldHit>
          </ListRow>
          {problem && <ListRow muted title={<span className={FINDING_TONE.stop}>{problem}</span>} />}
          <ListRow
            title={<span className="font-medium text-tint">Save item</span>}
            disabled={!!problem || save.isPending}
            data-testid="due-item-save"
            onClick={() =>
              save.mutate({
                itemId: open.id,
                request: {
                  kind: draft.kind,
                  title: draft.title.trim(),
                  reference: draft.reference.trim() || null,
                  method: draft.method.trim() || null,
                  dueOn: draft.dueOn || null,
                  dueAtHours: hours,
                },
              })
            }
          />
          {open.id != null && (
            <ListRow
              title={<span className="font-medium text-destructive">Delete item</span>}
              onClick={askDelete}
              disabled={remove.isPending}
            />
          )}
          <ListRow title={<span className="text-tint">Cancel</span>} onClick={() => setOpen(null)} />
        </>
      )}
      {deleteDialog}
    </ListGroup>
  );
}
