import type { ReactNode } from "react";
import type { PanelState } from "../../lib/mapChrome";
import type { SheetPages } from "../../components/sheet/SheetPages";

/**
 * What a workspace (the pilot's planner, the developer's training)
 * hands the page to place: the map, the panel's body, its actions and
 * its controls, the console for its sheet, its own part of the map's
 * settings, and the action behind the route form. The page (MapPage)
 * owns the shell -- the panel over the map, the console, the map's
 * buttons -- and the route typed into it; a workspace owns everything
 * about its own data.
 */
export interface WorkspacePieces {
  map: ReactNode;
  /** The panel's body: the nav log and the briefing, the training list. */
  sidebar: ReactNode;
  /** The panel's second row, in sight at rest: the airplane and the
   *  departure time, the rating's progress. */
  controls?: ReactNode;
  /** Beside the route form, in sight at rest: the workspace's own few
   *  actions (save, the narrative and print; filter, undo and more). */
  actions?: ReactNode;
  console: ReactNode;
  /** Loads the route in the panel's form: the training's; the planner
   *  has its route's box (`route`) and no form. */
  submit?: () => void;
  /** A load in progress: the form's own button is disabled. */
  loading?: boolean;
  /** The panel at rest: a capsule with the route in it, or a search bar
   *  while there is none (PanelCapsule). */
  compact?: ReactNode;
  /** The route's own box in place of the page's route form, beside the
   *  actions: the planner's pills (RouteBox). */
  route?: ReactNode;
  /** The panel's top row with it out, in place of the route form and the
   *  actions: a list's own field (the traffic's, Nearest's); null for none,
   *  the first row (`bar`) being the search. */
  head?: ReactNode;
  /** The panel's body alone with it out -- no route form, actions or
   *  controls over it: an airport's card opened over a route,
   *  as a place in Maps takes the sheet from the directions. */
  alone?: boolean;
  /** A card open over the place up (an airport's over the plan)
   *  (MapPanel's `cardOver`). */
  cardOver?: boolean;
  /** The sheet's first row, and at rest its pill: the planner's one search
   *  (OneSearchField), the developer's places (MapPanel's `bar`). */
  bar?: ReactNode;
  /** What the panel is drawn inside, where its first row and its body are
   *  one control: the one search's Autocomplete root, its field the first
   *  row and its list in the body. */
  around?: (panel: ReactNode) => ReactNode;
  /** Pinned at the sheet's foot at half and all the way up: the route's
   *  figures, while there is a route (MapPanel's `foot`). */
  foot?: ReactNode;
  /** The panel's body down to the sheet's own edge, over the home
   *  indicator (MapPanel's toEdge): an airport's card, its tiles and tabs
   *  at its foot. */
  toEdge?: boolean;
  /** The airplane flying the route (useFlyingMode): the panel's first
   *  row and top row put away and its foot grown (MapPanel's `flying`). */
  flying?: boolean;
  /** The sheet's two pages, Search (`bar` over `sidebar`) and FPL (`route`
   *  under its bar, over its own body), turned by the toggle at their first
   *  row's end (MapPanel's `pages`, PageToggle). */
  pages?: SheetPages;
}

export interface WorkspaceProps {
  /** The route in the panel's form: the address's, or what the pilot
   *  has typed over it. */
  dep: string;
  dest: string;
  /** How far the panel is out (MapPanel), and the way to move it. */
  panel: PanelState;
  setPanel: (state: PanelState) => void;
  children: (pieces: WorkspacePieces) => ReactNode;
}
