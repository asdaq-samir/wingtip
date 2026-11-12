import type { Map as MlMap } from "maplibre-gl";
import { create } from "zustand";

/**
 * A video export's state, for the panel (its progress bar and Cancel),
 * the map (which turns off what may not be exported while it runs) and
 * the replay's camera (which lets the export move the map): whether one
 * runs, how far it is, and what went wrong. The map an export renders is
 * here too, put by ExportMapGl from inside the map.
 */
interface ExportState {
  running: boolean;
  /** The share of frames done, 0 to 1. */
  done: number;
  problem: string | null;
  /** The file made last: its name and where it is to save. */
  made: { name: string; url: string; bytes: number } | null;
  map: MlMap | null;
}

export const useExporting = create<ExportState>(() => ({ running: false, done: 0, problem: null, made: null, map: null }));
