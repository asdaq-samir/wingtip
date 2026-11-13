import { useState } from "react";
import { RefreshCw } from "lucide-react";
import RoundButton from "./RoundButton";
import { Spinner } from "./ui/spinner";
import { refreshLive, useLiveRefresh, type LiveCard } from "../lib/liveRefresh";

/**
 * A live card's Refresh, in its head beside its share and close: what the
 * card shows asked again now, the stock spinner in its place until the
 * answers are in. The card keeps itself fresh besides (useLiveRefresh):
 * on a timer where its queries have one, and as the window or the card
 * comes back into sight. It was a pull from the card's top, a gesture of
 * our own the stock sheet's drag shared (the owner, 2026-11-10).
 */
export default function RefreshButton({ card, label = "Refresh" }: { card: LiveCard; label?: string }) {
  useLiveRefresh(card);
  return <RefreshNow card={card} label={label} />;
}

/** The button alone, for a card that keeps itself fresh (useLiveRefresh)
 *  where the button is not always on the screen: an airport's, whose
 *  Refresh is in its Weather tab (the owner, 2026-11-11). */
export function RefreshNow({ card, label = "Refresh", className }: { card: LiveCard; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <RoundButton
      label={label}
      aria-busy={busy || undefined}
      className={className}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void refreshLive(card).finally(() => setBusy(false));
      }}
      data-testid={`${card}-refresh`}
    >
      {busy ? (
        <Spinner className="size-5" role={undefined} aria-label={undefined} aria-hidden />
      ) : (
        <RefreshCw className="size-5" strokeWidth={2} />
      )}
    </RoundButton>
  );
}
