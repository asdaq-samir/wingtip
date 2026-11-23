import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "cn";
import { FaaChart } from "../../components/AirportDiagram";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { airportQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";

/**
 * A field's Chart Supplement, from the library: its ident typed, its
 * entry's pages in the app's chart viewer (FaaChart), as the field's card
 * opens them -- the planner's, by the 56-day edition in force
 * (wingtip.publications), kept with the route's charts for the air. A
 * closed field's entry opens like any other: it is the FAA's page, not an
 * offer to land there (its card says Closed).
 */
export default function SupplementRow() {
  const client = useQueryClient();
  const [ident, setIdent] = useState("");
  const [shown, setShown] = useState<{ ident: string; url: string } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const open = async () => {
    const wanted = ident.trim().toUpperCase();
    if (!wanted) return;
    setAsking(true);
    setMissing(null);
    try {
      const place = await client.fetchQuery(airportQuery(wanted));
      if (place.chart_supplement_url) setShown({ ident: place.ident, url: place.chart_supplement_url });
      else setMissing(`${place.ident} has no Chart Supplement page in this edition.`);
    } catch {
      setMissing(`No Chart Supplement found for ${wanted}.`);
    } finally {
      setAsking(false);
    }
  };
  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open();
        }}
      >
        <Input
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          placeholder="Airport, KOSH"
          aria-label="Airport for its Chart Supplement"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
          data-testid="supplement-ident"
        />
        <Button type="submit" variant="secondary" disabled={!ident.trim() || asking} data-testid="supplement-open">
          Open
        </Button>
      </form>
      {missing && (
        <p role="status" className={cn("text-muted-foreground", TEXT.detail)}>
          {missing}
        </p>
      )}
      {shown && <FaaChart title={`${shown.ident} Chart Supplement`} url={shown.url} airport={shown.ident} onClose={() => setShown(null)} />}
    </div>
  );
}
