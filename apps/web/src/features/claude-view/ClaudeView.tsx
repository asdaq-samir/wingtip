import { useState } from "react";
import { ExternalLink, Maximize2 } from "lucide-react";
import { cn } from "cn";
import { CardHeadRow } from "../../components/CardHead";
import FigureStrip from "../../components/FigureStrip";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";
import { tripFigures } from "../plan";
import { ChartMosaic } from "./ChartMosaic";
import { saveChange, type Answer } from "./flightView";
import { useClaudeView, type ClaudeViewModel } from "./useClaudeView";
import { ViewRoute } from "./ViewRoute";

function Head({ answer, vm }: { answer: Answer; vm: ClaudeViewModel }) {
  const { view } = answer;
  const save = saveChange(view);
  const blocked = vm.busy !== null || vm.superseded;
  return (
    <CardHeadRow
      wrap
      name={view.points.map((p) => p.ident).join(" → ")}
      sub={[view.airplane ?? "No airplane", `${Math.round(view.altitude_ft).toLocaleString("en-US")} ft`].join(" · ")}
      end={
        <div className="flex gap-2">
          <Button size="sm" disabled={blocked} data-testid="view-save" onClick={() => vm.change(save)}>
            {save.label}
          </Button>
          {view.open_in_wingtip && (
            <Button variant="outline" size="sm" data-testid="view-open" onClick={() => vm.open(view.open_in_wingtip!)}>
              <ExternalLink aria-hidden />
              Open in Wingtip
            </Button>
          )}
          {vm.canExpand && (
            <Button variant="ghost" size="icon-sm" aria-label="Open beside the chat" onClick={vm.expand}>
              <Maximize2 aria-hidden />
            </Button>
          )}
        </div>
      }
    />
  );
}

function FuelStops({ answer, vm }: { answer: Answer; vm: ClaudeViewModel }) {
  const { flight, view } = answer;
  const blocked = vm.busy !== null || vm.superseded;
  const has = (flight.fuel_stops ?? []).length > 0;
  if (!has && !view.airplane) return null;
  return (
    <ListGroup>
      <ListRow
        title={has ? "Remove Fuel Stops" : "Add Fuel Stops"}
        disabled={blocked}
        data-testid="view-fuel-stops"
        onClick={() =>
          vm.change(
            has
              ? { tool: "remove_fuel_stops", args: {}, said: "took the fuel stops out" }
              : { tool: "add_fuel_stops", args: {}, said: "put in the fuel stops the flight needs" },
          )
        }
      />
    </ListGroup>
  );
}

/**
 * The connector's live view, beside the chat in Claude (an MCP App): the
 * flight Claude and the pilot are planning, drawn from each answer as it
 * comes -- the chart with the route, the figures FPL's strip shows, the
 * route's points and approaches with what a tap changes, Save and Open in
 * Wingtip. A tap asks the connector's own tool and tells Claude what
 * changed (useClaudeView). An older view, once a newer one is open, is
 * read only.
 */
export function ClaudeView() {
  const vm = useClaudeView();
  const [picked, setPicked] = useState<string | null>(null);
  const { answer } = vm;
  if (!answer) {
    return (
      <p className={cn("p-4 text-muted-foreground", TEXT.prose)} data-testid="view-waiting">
        {vm.connectFailed ? "This view opens inside Claude, beside the chat." : "Planning the flight…"}
      </p>
    );
  }
  const { flight, view } = answer;
  const figures = tripFigures({
    totals: view.totals,
    local: false,
    destination: flight.destination,
    depart: flight.depart_at ?? "",
    strip: view.strip_fuel,
  });
  return (
    <main className="flex min-h-dvh flex-col gap-3 bg-background p-3 text-foreground" data-testid="claude-view">
      <Head answer={answer} vm={vm} />
      {vm.superseded && (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="view-superseded">
          A newer view of this flight is open: changes are made there.
        </p>
      )}
      {vm.problem && (
        <p className={cn("text-destructive-ink", TEXT.detail)} data-testid="view-problem">
          {vm.problem}
        </p>
      )}
      <ChartMosaic view={view} picked={picked} onPick={setPicked} className="h-56 shrink-0" />
      <FigureStrip figures={figures} size="fixed" testId="view-figures" />
      <ViewRoute answer={answer} picked={picked} disabled={vm.busy !== null || vm.superseded} onChange={vm.change} />
      <FuelStops answer={answer} vm={vm} />
    </main>
  );
}
