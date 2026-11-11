import type { ComponentType } from "react";
import {
  ArrowDownRight,
  CircleDashed,
  Construction,
  Database,
  Eye,
  Map as MapIcon,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  RadioTower,
  Route,
  ShieldAlert,
  Signpost,
  SquareParking,
  TowerControl,
  TriangleAlert,
  Wrench,
  type LucideProps,
} from "lucide-react";
import { RowBadge } from "../../../../components/RowBadge";
import { BADGE } from "../../../../lib/rowBadges";
import { RunwayGlyph } from "../RunwayRow";

/** Each NOTAM keyword's symbol and colour (FAA Order JO 7930.2 1-2-1, as
 *  the engine reads it, notam_read), the colour of the same thing
 *  elsewhere on the card: a runway's, the tower's, an approach's. The
 *  owner, 2026-11-11: "let's create a different symbol for each notam
 *  type". */
const GLYPHS: Record<string, [ComponentType<LucideProps>, string]> = {
  TWY: [Signpost, BADGE.ground],
  APRON: [SquareParking, BADGE.ground],
  AD: [TowerControl, BADGE.tower],
  OBST: [Construction, BADGE.traffic],
  NAV: [RadioTower, BADGE.approach],
  COM: [Radio, BADGE.tower],
  SVC: [Wrench, BADGE.fuel],
  AIRSPACE: [CircleDashed, BADGE.weather],
  IAP: [PlaneLanding, BADGE.approach],
  ODP: [PlaneTakeoff, BADGE.approach],
  SID: [PlaneTakeoff, BADGE.approach],
  STAR: [ArrowDownRight, BADGE.approach],
  VFP: [Eye, BADGE.approach],
  ROUTE: [Route, BADGE.chart],
  CHART: [MapIcon, BADGE.chart],
  DATA: [Database, BADGE.rule],
};

/** A NOTAM's symbol on its row: a TFR's shield, a runway's own glyph as
 *  the Runways tab draws it, each other keyword's (GLYPHS), and the
 *  warning triangle for one with none known. */
export function NotamGlyph({ keyword, tfr }: { keyword: string | null; tfr: boolean }) {
  if (tfr)
    return (
      <RowBadge colour={BADGE.hazard}>
        <ShieldAlert />
      </RowBadge>
    );
  if (keyword === "RWY") return <RunwayGlyph headingDeg={null} />;
  const [Icon, colour] = (keyword && GLYPHS[keyword]) || [TriangleAlert, BADGE.hazard];
  return (
    <RowBadge colour={colour}>
      <Icon />
    </RowBadge>
  );
}
