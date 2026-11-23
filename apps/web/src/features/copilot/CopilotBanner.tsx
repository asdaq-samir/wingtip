import { useEffect, useState } from "react";
import { CircleAlert, Info, Radio, TriangleAlert } from "lucide-react";
import MapBanner, { BannerButton } from "../../components/MapBanner";
import type { BannerTone } from "../../components/bannerGlass";
import { LATEST_KEPT_MS, useLatestAtcCall } from "../../lib/atc/latestCall";
import { useFeelOnNew } from "../../lib/haptics";
import { useCopilot } from "./useCopilot";

/** A warning's red, a caution's amber, as the alerts banner's are; an
 *  advisory in the text's own ink. */
const TONE: Record<"warning" | "caution" | "advisory", BannerTone> = { warning: "warning", caution: "caution", advisory: "plain" };

const ICON = { warning: TriangleAlert, caution: CircleAlert, advisory: Info } as const;

/** With no message of its own, the ATC copilot's last call to us in one
 *  line (lib/atc/latestCall), once its card is put away and for a while
 *  after: the altitude, heading and frequency last given, and what the
 *  pilot set from it (the next frequency, the code). */
function AtcLine() {
  const atc = useLatestAtcCall();
  // The line heard at `at` goes LATEST_KEPT_MS after it.
  const [gone, setGone] = useState<number | null>(null);
  useEffect(() => {
    if (atc.at == null) return;
    const at = atc.at;
    const timer = window.setTimeout(() => setGone(at), Math.max(0, at + LATEST_KEPT_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [atc.at]);
  if (!atc.line || atc.cardShown || atc.at == null || gone === atc.at) return null;
  const set = [atc.frequency && `Next ${atc.facility ? `${atc.facility} ` : ""}${atc.frequency}`, atc.squawk && `Code ${atc.squawk}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <MapBanner
      className="tabular-nums"
      data-testid="copilot-atc-line"
      icon={Radio}
      tone="tint"
      title={`ATC ${atc.line}`}
      sub={set || undefined}
    />
  );
}

/**
 * The in-flight copilot's one message (useCopilot), in the map's banner
 * column under what is ahead: its line, and a tap opening the why and
 * where each figure comes from (the METAR, 14 CFR, ITWS ...), look and go.
 * OK puts that message away; a new one comes in its place. Nothing while
 * the first thing that matters is one the alerts banner already shows.
 */
export default function CopilotBanner() {
  const { message, dismiss } = useCopilot();
  // A new warning or caution felt as it comes up (lib/haptics); an advisory only shown.
  useFeelOnNew(message && message.level !== "advisory" && !message.elsewhere ? message.id : null, "warning");
  if (!message || message.elsewhere) return <AtcLine />;
  return (
    <MapBanner
      // A new message is a new banner, closed; the same one (the engine's
      // id, the same while what it says is) keeps its place and stays open
      // as its minutes count down: keyed by its line, the detail the pilot
      // opened shut each minute ("3 min left of course", copilot.spec).
      key={message.id}
      data-copilot-banner={message.kind}
      // Told to a screen reader once by useCopilot (lib/announce): a
      // live region arriving with its words in it is not read by every
      // reader, and the message is read again with each look.
      role="region"
      label="Copilot"
      icon={ICON[message.level]}
      tone={TONE[message.level]}
      title={message.title}
      lines={2}
      titleTestId="copilot-title"
      moreTestId="copilot-detail"
      more={
        <>
          {message.detail.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {message.sources.map((source) => (
            <p key={source} className="text-muted-foreground" data-copilot-source="">
              {source}
            </p>
          ))}
        </>
      }
      actions={
        <BannerButton data-testid="copilot-dismiss" onClick={dismiss}>
          OK
        </BannerButton>
      }
    />
  );
}
