import {
  ChartArea,
  ClipboardCopy,
  Ellipsis,
  ListOrdered,
  LocateFixed,
  Map as MapLayers,
  MapPin,
  MapPinPlus,
  MoveUpRight,
  Navigation,
  PlaneTakeoff,
  Phone,
  Repeat2,
  Route,
  Send,
  Share,
  Sparkles,
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
  /** The route box's and the cards' share. */
  share: Share,
  /** The route box's menu: share, print, the nav log. */
  more: Ellipsis,
  /** The map's own position. */
  myLocation: Navigation,
  /** The AI brief, the route box's second button. */
  brief: Sparkles,
  /** The nav log, in the route's menu. */
  navLog: ListOrdered,
  /** The side view (Profile), the route box's first button. */
  profile: ChartArea,
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
  /** A place's address in Maps. */
  address: MapPin,
  /** A frequency or an ident to the clipboard. */
  copy: ClipboardCopy,
  /** File or send a flight plan. */
  send: Send,
  /** A course line's direction, where no D-arrow fits. */
  course: MoveUpRight,
} satisfies Record<string, Glyph>;
