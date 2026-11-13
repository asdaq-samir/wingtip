import { Settings } from "lucide-react";
import { openSettings, type SettingsGroup } from "../lib/openSettings";
import RoundButton from "./RoundButton";

/**
 * The gear at a card's head start, where a card with one has its Share
 * (CardHeadRow's `leading`), at the owner's ask (2026-11-13: "put a
 * settings button on the top left side"; "put settings as icon on top
 * left corner"): the Map card's, opening the app's Settings at its Map
 * group (option A, the same day), and You's, opening it at its top. The
 * same round glass button as Share and the close beside it, so the head
 * row keeps its two buttons' one look.
 */
export default function SettingsButton({ group, testId = "card-settings" }: { group?: SettingsGroup; testId?: string }) {
  return (
    <RoundButton label="Settings" onClick={() => openSettings(group)} data-testid={testId}>
      <Settings className="size-5" strokeWidth={2} />
    </RoundButton>
  );
}
