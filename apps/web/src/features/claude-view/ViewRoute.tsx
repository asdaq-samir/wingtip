import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { duration } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { TimelineMark } from "../procedures/lazy";
import { approachChanges, minutesTo, type Answer, type Change, type ViewApproach } from "./flightView";
import { markOf } from "./rows";

const ROW_BUTTON = cn("relative after:absolute after:-inset-y-2 after:inset-x-0", TEXT.row);

function ApproachRow({ approach, disabled, onChange }: { approach: ViewApproach; disabled: boolean; onChange: (c: Change) => void }) {
  return (
    <ListRow title={approach.name} description={approach.state} data-testid={`view-approach-${approach.airport}`}>
      <div className="flex gap-2">
        {approachChanges(approach).map((c) => (
          <Button
            key={c.label}
            variant={c.label === "Remove" ? "destructive" : "secondary"}
            size="sm"
            className={ROW_BUTTON}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            {c.label}
          </Button>
        ))}
      </div>
    </ListRow>
  );
}

/**
 * The route's points in the live view, a row each as FPL's timeline has
 * them -- the mark, the ident and the field's name, the time en route to
 * it -- a stop with its Remove, and each approach picked under its field
 * with what it offers where it is (loaded, active, its missed approach).
 * `picked` is the point a tap on the chart chose, its row marked.
 */
export function ViewRoute({
  answer,
  picked,
  disabled,
  onChange,
}: {
  answer: Answer;
  picked: string | null;
  disabled: boolean;
  onChange: (c: Change) => void;
}) {
  const { view } = answer;
  const minutes = minutesTo(view);
  return (
    <ListGroup title="Route">
      {view.points.flatMap((point, i) => {
        const time = minutes[i];
        const row = (
          <ListRow
            key={`${point.ident}-${i}`}
            media={<TimelineMark point={markOf(point, i)} position={false} />}
            title={point.ident}
            description={[point.name, time != null ? `+${duration(time)}` : null].filter(Boolean).join(" · ") || undefined}
            className={cn(picked === point.ident && "bg-muted")}
            aria-current={picked === point.ident ? "true" : undefined}
            data-testid={`view-point-${point.ident}`}
          >
            {point.role === "stop" && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(ROW_BUTTON, "text-destructive-ink")}
                data-testid={`view-remove-${point.ident}`}
                disabled={disabled}
                onClick={() => onChange({ tool: "remove_stop", args: { ident: point.ident }, said: `removed the stop ${point.ident}` })}
              >
                Remove
              </Button>
            )}
          </ListRow>
        );
        const approaches = view.approaches.filter((a) => a.airport === point.ident);
        return [
          row,
          ...approaches.map((a) => <ApproachRow key={`${a.airport}-${a.id}`} approach={a} disabled={disabled} onChange={onChange} />),
        ];
      })}
    </ListGroup>
  );
}
