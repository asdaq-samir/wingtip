import { Badge } from "../../ui/badge";

// TODO(claude/badges): the app's one StatusBadge replaces this local one
// once that branch is merged; the kinds and words are the same.

/** What a thing's state is, in a word beside its line (the owner,
 *  2026-11-14: "Use badges where we can for example tfr active etc."). */
type StatusKind = "active" | "later" | "closed" | "out-of-service" | "private" | "military" | "inAir";

/** Each kind's word, and the stock Badge's look for it: what a pilot must
 *  not fly into or count on in the destructive red, the rest quiet. */
const LOOK = {
  active: { word: "Active", variant: "destructive" },
  later: { word: "Later", variant: "secondary" },
  closed: { word: "Closed", variant: "destructive" },
  "out-of-service": { word: "Out of service", variant: "destructive" },
  private: { word: "Private", variant: "secondary" },
  military: { word: "Military", variant: "secondary" },
  inAir: { word: "In the air", variant: "default" },
} as const satisfies Record<StatusKind, { word: string; variant: "destructive" | "secondary" | "default" }>;

/** A state as the stock Badge (shadcn's), one look on every card. */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  const { word, variant } = LOOK[kind];
  return (
    <Badge variant={variant} data-testid={`status-${kind}`}>
      {word}
    </Badge>
  );
}
