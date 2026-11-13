import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { FieldError } from "../../components/ui/field";
import type { SimGround } from "../../lib/engine/contract";
import { shareFile } from "../../lib/flightPlanFiles";
import { usePastFlight } from "../../lib/replay/clock";
import { TEXT } from "../../lib/text";
import { writeFdr } from "../../lib/replay/simExport/fdr";
import {
  fileStem,
  FRAME_HZ,
  simSegmentAround,
  simSegments,
  TRACK_HZ,
  type SimMeta,
  type SimSource,
} from "../../lib/replay/simExport/flight";
import { writeGpx } from "../../lib/replay/simExport/gpx";
import { writeKml } from "../../lib/replay/simExport/kml";
import { writeSkyDollyCsv } from "../../lib/replay/simExport/skyDolly";
import type { ReplayTrack } from "./track";

type Target = "fcr" | "skydolly" | "xplane" | "earth" | "gpx";

/** A file for each simulator (docs/SIM-EXPORT.md): the formats that
 *  replay row by row get the one flight around the replay's moment, as
 *  they cannot leave a gap empty; the track formats get them all. */
function exportFile(
  target: Target,
  source: SimSource,
  meta: SimMeta,
  at: number | null,
): { name: string; type: string; text: string } | null {
  if (target === "earth" || target === "gpx") {
    const segments = simSegments(source, TRACK_HZ);
    const first = segments[0]?.rows[0];
    if (!first) return null;
    const stem = fileStem(meta, first.t);
    return target === "earth"
      ? { name: `${stem}.kml`, type: "application/vnd.google-earth.kml+xml", text: writeKml(segments, meta, "earth") }
      : { name: `${stem}.gpx`, type: "application/gpx+xml", text: writeGpx(segments, meta) };
  }
  const segment = simSegmentAround(source, at, target === "fcr" ? TRACK_HZ : FRAME_HZ);
  const first = segment?.rows[0];
  if (!segment || !first) return null;
  const stem = fileStem(meta, first.t);
  if (target === "fcr")
    return { name: `${stem}.kml`, type: "application/vnd.google-earth.kml+xml", text: writeKml([segment], meta, "flightaware") };
  if (target === "skydolly") return { name: `${stem}.csv`, type: "text/csv", text: writeSkyDollyCsv(segment) };
  return { name: `${stem}.fdr`, type: "text/plain", text: writeFdr(segment, meta) };
}

/**
 * "Export for simulator": the replayed flight as a file a flight
 * simulator replays, for a creator's cinematic shots -- FlightControlReplay
 * and Sky Dolly in Microsoft Flight Simulator, X-Plane's own replay, and
 * Google Earth and GPX for the rest. The frames are the engine's
 * (sim_flight), the files lib/replay/simExport's; the attitude, gear and
 * lights are estimated, which every file says. Any replay of a recorded
 * track can carry it: the Studio's, and in time Plan's past flights.
 */
export function SimExportMenu({ track, ground }: { track: ReplayTrack; ground: SimGround[] }) {
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (target: Target) => {
    const source: SimSource = { points: track.points, settings: track.settings, ground, pressure: track.altitude === "pressure" };
    const meta: SimMeta = {
      title: track.label,
      tail: track.aircraft?.tail ?? null,
      icaoType: track.aircraft?.icaoType ?? null,
      model: track.aircraft?.model ?? null,
      credit: track.credit,
    };
    try {
      const file = exportFile(target, source, meta, usePastFlight.getState().at);
      if (!file) {
        setProblem("There are not enough reports in this track to export.");
        return;
      }
      setProblem(null);
      void shareFile(file.name, file.type, file.text);
    } catch {
      setProblem("The file couldn't be written.");
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" data-testid="sim-export" />}>
          <Download aria-hidden />
          Export for simulator
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Microsoft Flight Simulator</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => pick("fcr")} data-testid="sim-export-fcr">
              FlightControlReplay (KML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => pick("skydolly")} data-testid="sim-export-skydolly">
              Sky Dolly (CSV)
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>X-Plane 12</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => pick("xplane")} data-testid="sim-export-xplane">
              Flight data recorder (FDR)
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Whole track</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => pick("earth")} data-testid="sim-export-earth">
              Google Earth (KML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => pick("gpx")} data-testid="sim-export-gpx">
              GPX
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p className={cn("text-muted-foreground", TEXT.note)}>
        Simulator files hold the flight at the replay's moment; KML and GPX hold the whole day. Attitude, gear and lights are estimated.
      </p>
      {problem && <FieldError data-testid="sim-export-problem">{problem}</FieldError>}
    </div>
  );
}
