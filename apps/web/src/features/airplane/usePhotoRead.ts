import { useState } from "react";
import { FIGURE_FIELDS, type FigureKey } from "../../lib/airplane/figures";
import { figuresOfPage } from "./lib/handbookText";
import { readPhoto } from "./lib/readPage";

/** The engine's names of the figures a specifications page carries, by
 *  the page reader's (handbook_figures', camel case). */
const BY_FIELD = Object.fromEntries(Object.entries(FIGURE_FIELDS).map(([key, field]) => [field, key])) as Record<string, FigureKey>;

/**
 * A photo of the handbook's specifications page read for the profile's
 * figures, at the owner's ask ("add a way to upload a pic or add a photo
 * of their manual"): read on the phone (lib/readPage), the figures found
 * filled into the profile's fields for the pilot to check against the
 * page's own words, shown with them, before anything is kept. Part of the
 * profile's view model (useAirplaneProfile).
 */
export function usePhotoRead(fill: (typed: Partial<Record<FigureKey, number>>) => void) {
  const [state, setState] = useState<{ busy: boolean; words: string[]; problem: string | null }>({ busy: false, words: [], problem: null });
  const read = async (file: File) => {
    setState({ busy: true, words: [], problem: null });
    try {
      const found = Object.entries(figuresOfPage(await readPhoto(file))).filter(([field]) => field in BY_FIELD);
      fill(Object.fromEntries(found.map(([field, f]) => [BY_FIELD[field], f.value])));
      setState({
        busy: false,
        words: [...new Set(found.map(([, f]) => f.words))],
        problem: found.length ? null : "No figures were read off that page: take the specifications page, flat and in good light.",
      });
    } catch (err) {
      setState({
        busy: false,
        words: [],
        problem: err instanceof Error ? `The page could not be read: ${err.message}` : "The page could not be read",
      });
    }
  };
  return { ...state, read };
}
