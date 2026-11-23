import { cn } from "cn";
import FindingIcon from "../../components/FindingIcon";
import { SkeletonLine } from "../../components/QueryState";
import { FINDING_TONE, type Finding } from "../../lib/findings";
import { TEXT } from "../../lib/text";
import { useAnnounce } from "../../lib/announce";
import { useVerdict } from "../../lib/verdict";

/** The verdict's wash: the Brief's one alarm. */
const WASH: Partial<Record<Finding, string>> = { stop: "bg-destructive/10", caution: "bg-caution-wash" };

/**
 * Whether to go, as the engine words it (lib/verdict, gonogo_brief), a
 * pill under the Brief's name in its pinned head, at the owner's pick of
 * option A (2026-11-19): said first (decision 0012) and in sight on every
 * page of the Brief, where it was a banner over the overview's cards and
 * said again over Preflight's checks. No live region on it, as it is there
 * when the Brief opens; its arrival is said once (useAnnounce), not again
 * while the pilot reads (docs/design/web.md §5). The same width from the
 * first frame while checking, so the head does not jump (FL-21).
 */
export default function VerdictPill() {
  const items = useVerdict((v) => v.items);
  const line = useVerdict((v) => v.line);
  const verdict = items.length ? line : null;
  useAnnounce(verdict ? `Brief ready: ${verdict.words}` : null);
  return (
    <p
      className={cn(
        "mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
        TEXT.detail,
        (verdict && WASH[verdict.finding]) ?? "bg-muted",
        verdict && FINDING_TONE[verdict.finding],
      )}
      data-testid={verdict ? "brief-verdict" : "brief-verdict-pending"}
      data-finding={verdict?.finding}
    >
      <FindingIcon finding={verdict?.finding ?? "pending"} className="size-4" />
      {verdict ? <span className="min-w-0 text-balance">{verdict.words}</span> : <SkeletonLine className="w-40" />}
    </p>
  );
}
