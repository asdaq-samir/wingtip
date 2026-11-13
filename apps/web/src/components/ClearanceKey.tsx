import { useState } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { loadPopups, usePopups } from "./popupsChunk";
import { usePreferences } from "../lib/preferences";
import { clearanceFigures, clearanceWords, useClearanceDrawn } from "../lib/map/terrainClearanceWords";
import { feet } from "../lib/format";
import { CHART } from "../lib/tokens";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";

/**
 * The key to the ground's colours near a route in 3D (ClearanceGl), a
 * small glass pill beside the map's 3D button (the owner, 2026-11-13):
 * amber within the engine's band below the planned altitude, red at or
 * above it -- the figures the engine's (`terrain_view_bands`, through
 * clearanceFigures), the colours the chart's caution and warning that
 * ClearanceGl draws with (svColours). There only while they are drawn,
 * in 3D with a route; a tap is the stock Popover (Base UI's, on the
 * popups' chunk) with the whole sentence: a view of the plan, not terrain
 * clearance (no TAWS, nothing of 14 CFR 91.119 or 91.177).
 */
export default function ClearanceKey() {
  const threeD = usePreferences((s) => s.threeD);
  const drawn = useClearanceDrawn((s) => s.drawn);
  const popups = usePopups();
  const [asked, setAsked] = useState(false);
  if (!threeD || !drawn) return null;
  const { amberFt } = clearanceFigures();
  const pill = (
    <Button
      variant="ghost"
      size="inline"
      data-testid="clearance-key"
      aria-label={`Ground colours: amber within ${feet(amberFt)} below the plan, red at or above it`}
      className={cn(
        // Its two lines stacked, as tall as the 3D circle beside it and
        // narrow, clear of the map's other buttons at larger text too.
        "h-11 flex-col items-start justify-center gap-0 rounded-2xl px-3 text-foreground",
        GLASS,
        TEXT.note,
      )}
    >
      <Swatch colour={CHART.caution} words={`within ${feet(amberFt)} below`} />
      <Swatch colour={CHART.warning} words="at or above" />
    </Button>
  );
  if (!popups)
    return (
      <span
        onClickCapture={() => {
          setAsked(true);
          void loadPopups();
        }}
      >
        {pill}
      </span>
    );
  return (
    <popups.Popover defaultOpen={asked}>
      <popups.PopoverTrigger render={pill} />
      <popups.PopoverContent side="top" align="start" className={TEXT.note} data-testid="clearance-key-words">
        {clearanceWords()}
      </popups.PopoverContent>
    </popups.Popover>
  );
}

function Swatch({ colour, words }: { colour: string; words: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
      {words}
    </span>
  );
}
