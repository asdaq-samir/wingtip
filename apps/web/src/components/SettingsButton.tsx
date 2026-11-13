import { Settings } from "lucide-react";
import { openSettings } from "../lib/openSettings";
import RoundButton from "./RoundButton";

/**
 * The gear at a card's head start, where a card with one has its Share
 * (CardHeadRow's `leading`): the Map card's, at the owner's ask
 * (2026-11-13: "put a settings button on the top left side"), opening the
 * app's Settings at its Map group (option A, the same day). The same
 * round glass button as Share and the close beside it, so the head row
 * keeps its two buttons' one look.
 */
export default function SettingsButton() {
  return (
    <RoundButton label="Settings" onClick={() => openSettings("map")} data-testid="card-settings">
      <Settings className="size-5" strokeWidth={2} />
    </RoundButton>
  );
}
