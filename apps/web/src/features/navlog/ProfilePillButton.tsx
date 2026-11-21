import { InputGroupButton } from "../../components/ui/input-group";
import { TabCount } from "../../components/FloatingBar";
import { ICON } from "../../lib/icons";
import { PILL_END } from "./pillLook";

/**
 * The Profile's button at the end of FPL's altitude pill (AltitudeGroup's
 * `profile`), where it was the floating tab bar's (the owner, 2026-11-20: "Now
 * we have more space can N number show an info button and can FL show
 * profile button rather than in the tab bar?"): the side view's glyph,
 * opening the Profile card as the tab bar's did, greyed till there is a
 * plan to show (`profileReady`), and the altitude's own caution counted on
 * its corner, a 1 (TabCount, the one badge), said in its name.
 */
export interface PillProfile {
  openProfile: () => void;
  profileReady: boolean;
  altitudeMark: string | null;
}

export default function ProfilePillButton({ openProfile, profileReady, altitudeMark }: PillProfile) {
  const label =
    altitudeMark === "caution" ? "Profile, 1 caution" : altitudeMark === "tight" ? "Profile, 1 caution: your altitude is tight" : "Profile";
  return (
    <InputGroupButton
      size="icon-xs"
      className={PILL_END}
      aria-label={label}
      onClick={openProfile}
      disabled={!profileReady}
      data-testid="route-profile"
    >
      <span className="relative flex">
        <ICON.profile aria-hidden="true" />
        {altitudeMark && <TabCount count={1} mark="caution" testId="route-profile-count" />}
      </span>
    </InputGroupButton>
  );
}
