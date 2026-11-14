import {
  ClipboardCheck,
  ClipboardCopy,
  CloudSun,
  Ellipsis,
  ListOrdered,
  LocateFixed,
  Map as MapLayers,
  MapPinPlus,
  Mountain,
  MoveUpRight,
  Navigation,
  PlaneTakeoff,
  Phone,
  Repeat2,
  Route,
  Send,
  Share,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import DirectToIcon from "./glyphs/DirectToIcon";

/**
 * One concept, one glyph: the web's half of the icon concept table
 * (docs/design/icons.md), where iOS names its SF Symbol and Android its
 * Material Symbol for the same concept, so a pilot who moves between the
 * apps finds each thing by the same shape. A screen asks for the concept
 * (ICON.profile), never for a lucide name, so a glyph is changed here
 * once.
 */
type Glyph = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

export const ICON = {
  /** Closes a level and goes back one (decision 0015). */
  close: X,
  /** The route's share (FPL's tab bar) and the cards'. */
  share: Share,
  /** The route's menu: save, file, print, the view. */
  more: Ellipsis,
  /** The map's own position. */
  myLocation: Navigation,
  /** The Brief, FPL's tab (the owner's ClipboardCheck, 2026-11-14). */
  brief: ClipboardCheck,
  /** The nav log, FPL's first tab. */
  navLog: ListOrdered,
  /** The side view (Profile), FPL's tab (the owner's Mountain, 2026-11-14). */
  profile: Mountain,
  /** The map's layers and weather. */
  mapLayers: MapLayers,
  /** A route, as a list's mark. */
  flightPlan: Route,
  /** Nearest fields. */
  nearest: LocateFixed,
  /** Fly direct to a point from where the airplane is: the chart's D-arrow. */
  directTo: DirectToIcon,
  /** Fly here: the route from the airplane to this field. */
  flyHere: DirectToIcon,
  /** Depart from this field: the route's start. */
  departFrom: PlaneTakeoff,
  /** Put the point or field in the route. */
  addToRoute: MapPinPlus,
  /** Hold at the point. */
  holdHere: Repeat2,
  /** A field's phone. */
  call: Phone,
  /** In the Favorites or out: an airport's, an airplane's. */
  favorite: Star,
  /** A field's weather: the airport card's Weather tile, its tab opened. */
  weather: CloudSun,
  /** A frequency or an ident to the clipboard. */
  copy: ClipboardCopy,
  /** File or send a flight plan: FPL's ForeFlight. */
  send: Send,
  /** A course line's direction, where no D-arrow fits. */
  course: MoveUpRight,
} satisfies Record<string, Glyph>;
