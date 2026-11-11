import { Badge } from "../../../../components/ui/badge";
import { SheetCard } from "../../../../components/SheetCard";
import { headingOf, type FieldNotam } from "./fieldNotams";
import type { NotamMark } from "./notamBadges";
import { NotamFull, NotamRows } from "./PlaceNotams";

/**
 * A NOTAM's badge next to what it addresses (notamBadges): the engine's
 * word in red, as every one is of a NOTAM in force (the owner, 2026-11-11:
 * "All the active notam badges should be red"; one not yet in force has
 * none, notamBadges), as RunwayRow's "Longest" is the
 * stock Badge. Its label, for VoiceOver, is the NOTAM's words. With
 * `onOpen` it is a button of its own, its 44-point hit area a
 * pseudo-element round it, the badge no bigger: for a row with a tap of its
 * own (a frequency's copy). Without, the row it sits on is the tap.
 */
export function NotamBadge({ mark, kind, onOpen }: { mark: NotamMark; kind: string; onOpen?: () => void }) {
  const props = { variant: "destructive" as const, "data-testid": "notam-badge", "data-kind": kind, "data-severity": mark.severity };
  const words = (
    <>
      {mark.word}
      <span className="sr-only">{`: ${mark.label}`}</span>
    </>
  );
  if (!onOpen) return <Badge {...props}>{words}</Badge>;
  return (
    <Badge
      {...props}
      className="relative overflow-visible after:absolute after:-inset-3 after:content-['']"
      render={<button type="button" onClick={onOpen} />}
    >
      {words}
    </Badge>
  );
}

/**
 * The NOTAMs on one thing, over the card: one in full (NotamFull) as the
 * Info tab's list opens it, several as that list's rows, each opening in
 * full.
 */
export function NotamSheet({ notams, ident, onClose }: { notams: FieldNotam[]; ident: string; onClose: () => void }) {
  const [one] = notams;
  if (notams.length === 1 && one)
    return (
      <SheetCard title={headingOf(one, ident)} description={ident} onClose={onClose} testId="place-notam-card">
        <NotamFull n={one} ident={ident} />
      </SheetCard>
    );
  return (
    <SheetCard title="NOTAMs" description={ident} onClose={onClose} testId="place-notams-on">
      <div className="flex flex-col pb-6">
        <NotamRows notams={notams} ident={ident} state={null} />
      </div>
    </SheetCard>
  );
}
