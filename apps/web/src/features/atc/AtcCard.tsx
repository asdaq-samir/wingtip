import { Check, CircleAlert, Radio } from "lucide-react";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import { GLASS } from "../../lib/mapChrome";
import { Button } from "../../components/ui/button";
import { useAnnounce } from "../../lib/announce";
import { TEXT } from "../../lib/text";
import type { AtcCard as Card } from "./atcCards";
import type { AtcItem } from "./atcEngine";
import { ACTION_LABEL, itemWords, type ItemAction } from "./atcWords";

/** A chip's 32 points made 44 to a finger without growing (the app's
 *  rule): a pseudo-element round it, the rows gap-2 so the areas meet. */
const CHIP = "relative shrink-0 rounded-full text-tint after:absolute after:-inset-1.5 after:content-['']";

/** The readback's lines: a tick where it matched, else each item missed
 *  or said differently, those AIM 4-4-7 b asks be read back first. */
function ReadbackResult({ check }: { check: NonNullable<Card["readback"]>["check"] }) {
  if (!check.items.length) {
    return (
      <p className={cn("flex items-center gap-1.5 text-muted-foreground", TEXT.note)} role="status" data-testid="atc-readback">
        <Check className="size-4 shrink-0" aria-hidden="true" />
        Readback complete
      </p>
    );
  }
  const items = [...check.items].sort((a, b) => Number(b.required) - Number(a.required));
  return (
    <ul className={cn("flex flex-col gap-0.5 text-caution-ink", TEXT.note)} role="status" data-testid="atc-readback">
      {items.map((i) => (
        <li key={i.item + i.cleared} className="flex items-start gap-1.5" data-required={i.required || undefined}>
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {i.said !== null ? `${capital(i.item)}: ${i.said} said, ${i.cleared} given` : `${capital(i.item)} ${i.cleared} not read back`}
          </span>
        </li>
      ))}
    </ul>
  );
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * A call to us as the ATC copilot read it: what was said, then each item
 * on a row of its own with what a tap can do with it (Set Altitude,
 * Direct To, Set Next for the frequency, Set Code, Enter Route), the
 * readback's result once heard, and Read Back. Nothing is set until a
 * chip is tapped; ✕ puts the card away, its line kept in the copilot's
 * banner.
 */
export default function AtcCard({
  card,
  can,
  problem,
  onAct,
  onReadBack,
  onClose,
}: {
  card: Card;
  can: (item: AtcItem) => ItemAction | null;
  problem: string | null;
  onAct: (index: number) => void;
  onReadBack: () => void;
  onClose: () => void;
}) {
  // Said to a screen reader at once, once a call (lib/announce): a
  // role="alert" arriving whole is not read by every reader.
  useAnnounce(`ATC: ${card.text}`, "assertive");
  return (
    <div
      className={cn(GLASS, "pointer-events-auto w-full max-w-md rounded-(--radius-banner) py-2 pr-1 pl-3")}
      role="region"
      aria-label="Call from ATC"
      data-testid="atc-card"
    >
      <div className="flex items-start gap-2">
        <Radio className="mt-1 size-5 shrink-0 text-tint" aria-hidden="true" />
        <p className={cn("min-w-0 flex-1 text-muted-foreground line-clamp-2", TEXT.note)} data-testid="atc-card-heard">
          {card.text}
        </p>
        <CloseButton label="Put away" onClick={onClose} data-testid="atc-card-close" />
      </div>
      {card.items.length > 0 && (
        <ul className="flex flex-col gap-2 py-1 pr-2" data-testid="atc-items">
          {card.items.map((item, index) => {
            const action = can(item);
            const done = card.set.includes(index);
            return (
              <li key={`${item.kind}-${index}`} className="flex min-h-8 items-center gap-2" data-atc-item={item.kind}>
                <span className={cn("min-w-0 flex-1 font-semibold tabular-nums", TEXT.detail)}>{itemWords(item)}</span>
                {action &&
                  (done ? (
                    <span className={cn("flex shrink-0 items-center gap-1 text-muted-foreground", TEXT.note)} data-testid="atc-item-done">
                      <Check className="size-4" aria-hidden="true" />
                      Set
                    </span>
                  ) : (
                    <Button size="sm" variant="secondary" className={CHIP} data-testid={`atc-set-${action}`} onClick={() => onAct(index)}>
                      {ACTION_LABEL[action]}
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-1 pr-2">
        {card.readback && <ReadbackResult check={card.readback.check} />}
        {card.awaiting && (
          <p className={cn("text-muted-foreground", TEXT.note)} role="status">
            Read it back…
          </p>
        )}
        {problem && (
          <p className={cn("text-destructive-ink", TEXT.note)} role="status">
            {problem}
          </p>
        )}
      </div>
      {!card.awaiting && (
        <div className="flex flex-wrap gap-2 pt-1 pr-2">
          <Button size="sm" variant="secondary" className={CHIP} data-testid="atc-read-back" onClick={onReadBack}>
            {card.readback ? "Read Back Again" : "Read Back"}
          </Button>
        </div>
      )}
    </div>
  );
}
