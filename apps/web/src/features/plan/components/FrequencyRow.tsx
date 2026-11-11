import type { ReactNode } from "react";
import { CloudSun, Headset, Radar, Radio, RadioTower, TowerControl } from "lucide-react";
import { ListRow } from "../../../components/GroupedList";
import { RowBadge } from "../../../components/RowBadge";
import FrequencyButton from "../../../components/FrequencyButton";
import { frequencyLine, type FrequencyKind } from "../../../lib/frequencies";
import { BADGE } from "../../../lib/rowBadges";

const GLYPH: Record<FrequencyKind, ReactNode> = {
  tower: <TowerControl />,
  ground: <Headset />,
  weather: <CloudSun />,
  approach: <Radar />,
  traffic: <RadioTower />,
  other: <Radio />,
};

/**
 * A field's frequency as a row: named in words (TWR is "Tower"), a glyph
 * by its kind, and the frequency as pilots write it at the right, tinted
 * as a tap copies it (FrequencyButton), where Nearest has a field's
 * distance -- the pilot's ask
 * for every card to read as Nearest's does. An airport's card and the
 * Brief's airport sections list them alike: those were the card's old
 * rows, the FAA's type in words over its description and the figure in
 * grey.
 */
export function FrequencyRow({
  type,
  description,
  mhz,
  testId,
  notam,
}: {
  type: string | null | undefined;
  description: string | null | undefined;
  mhz: number | null | undefined;
  testId?: string;
  /** A NOTAM's badge by its name (the airport card's NotamBadge), a
   *  button of its own: the row's own tap is the frequency's copy. */
  notam?: ReactNode;
}) {
  const line = frequencyLine(type, description);
  return (
    <ListRow
      media={<RowBadge colour={BADGE[line.kind]}>{GLYPH[line.kind]}</RowBadge>}
      title={
        notam ? (
          <span className="flex items-center gap-2">
            {line.name}
            {notam}
          </span>
        ) : (
          line.name
        )
      }
      description={line.detail ?? undefined}
      value={mhz != null ? <Mhz mhz={mhz} name={line.name} /> : "—"}
      data-testid={testId}
    />
  );
}

/** A frequency at a row's right, as pilots write it, a tap copying it
 *  (FrequencyButton): the radio calls' were a bare figure in grey. */
export function Mhz({ mhz, name }: { mhz: number; name?: string }) {
  return <FrequencyButton mhz={mhz} name={name} />;
}
