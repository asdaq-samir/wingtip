import { useRef, useState, type ReactNode } from "react";
import { FileUp } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { DateField } from "../../components/ui/date-field";
import { Field, FieldDescription, FieldError, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { TEXT } from "../../lib/text";
import { SimExportMenu } from "../replay";
import { utcToday, type Studio } from "./useStudio";

/**
 * The Studio's sheet: a track to replay. An airplane's UTC day, by its
 * N-number or ICAO address (adsb.lol's history, read once by the planner
 * and kept); one of the airplanes watched here, on a day it has reports;
 * or a KML, GPX or CSV file. What went wrong is said here, under the
 * field, where the track would have come from (lib/problems' rule).
 * Under a loaded track, the Studio's `tools` (StudioTools).
 */
export function StudioPanel({ studio, tools }: { studio: Studio; tools?: ReactNode }) {
  const [tail, setTail] = useState(studio.q);
  const [day, setDay] = useState(studio.day || utcToday());
  const picker = useRef<HTMLInputElement>(null);
  const track = studio.track;
  return (
    <div className="flex flex-col gap-5 px-4 pb-6" data-testid="studio-panel">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (tail.trim().length >= 2 && day) studio.load(tail, day);
        }}
      >
        <Field>
          <FieldLabel htmlFor="studio-tail">Airplane</FieldLabel>
          <Input
            id="studio-tail"
            value={tail}
            onChange={(e) => setTail(e.target.value)}
            placeholder="N-number or ICAO address"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            data-testid="studio-tail"
          />
        </Field>
        <Field>
          <FieldLabel>Day (UTC)</FieldLabel>
          <DateField aria-label="Day, UTC" value={day} max={utcToday()} onChange={setDay} data-testid="studio-day" />
          <FieldDescription>adsb.lol keeps about six weeks of days.</FieldDescription>
        </Field>
        <Button type="submit" disabled={studio.loading || tail.trim().length < 2 || !day} data-testid="studio-load">
          {studio.loading ? "Fetching…" : "Load track"}
        </Button>
        {studio.problem && <FieldError data-testid="studio-problem">{studio.problem}</FieldError>}
      </form>

      {track && (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid="studio-track">
          <span className="font-semibold text-foreground">{track.label}</span> · {Math.round(track.lengthNm)} nm ·{" "}
          {track.gaps.length === 0 ? "no gaps" : track.gaps.length === 1 ? "1 gap" : `${track.gaps.length} gaps`}
          {track.credit && <span data-testid="studio-credit"> · {track.credit}</span>}
        </p>
      )}
      {track && <SimExportMenu track={track} ground={studio.ground} />}

      {track && tools}

      {studio.watched.length > 0 && (
        <ListGroup title="Watched here">
          {studio.watched.map((w) => (
            <ListRow
              key={w.hex}
              title={w.registration ?? w.hex.toUpperCase()}
              description={`${w.days.length} ${w.days.length === 1 ? "day" : "days"}, last ${w.days[0]}`}
              onClick={() => {
                setTail(w.registration ?? w.hex);
                setDay(w.days[0]!);
                studio.load(w.registration ?? w.hex, w.days[0]!);
              }}
              data-testid={`studio-watched-${w.hex}`}
            />
          ))}
        </ListGroup>
      )}

      <div className="flex flex-col gap-1.5">
        <input
          ref={picker}
          type="file"
          accept=".kml,.gpx,.csv,application/vnd.google-earth.kml+xml,application/gpx+xml,text/csv"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void studio.importFile(picked);
            e.target.value = "";
          }}
          data-testid="studio-file"
        />
        <Button variant="outline" onClick={() => picker.current?.click()} data-testid="studio-import">
          <FileUp aria-hidden />
          Import a track file
        </Button>
        <p className={cn("text-muted-foreground", TEXT.note)}>KML or GPX (GPS altitude), or CSV with time and position columns.</p>
      </div>
    </div>
  );
}
