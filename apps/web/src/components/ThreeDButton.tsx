import { cn } from "cn";
import { Button } from "./ui/button";
import { usePreferences } from "../lib/preferences";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";

/**
 * The map stood up in 3D and laid flat again, a round glass button of its
 * own under the microphone's, as Apple Maps' 3D button is (the owner,
 * 2026-11-13: "3d should come out too as another round button below the
 * listening round button, but keep them both round like in Apple Maps"):
 * "3D" while the map is flat, "2D" while it stands, tinted. Off goes back
 * to the 2D chart, its relief shaded; the preference is the one `threeD` (lib/preferences). The stock
 * Button, named by what a tap does ("Show in 3D", its "3D" in the name for
 * voice control, WCAG 2.5.3): a toggle whose name changed with its pressed
 * state was read "Show in 2D, pressed", which says the opposite of the map
 * (WAI-ARIA APG, Button: a toggle's label does not change with its state).
 * Its 44-point area a pseudo-element over the glass's edge round it,
 * never a bigger button.
 */
export default function ThreeDButton() {
  const on = usePreferences((s) => s.threeD);
  const setThreeD = usePreferences((s) => s.setThreeD);
  return (
    <div data-map-food="" className={cn("flex rounded-full p-1", GLASS)}>
      <Button
        variant="ghost"
        onClick={() => setThreeD(!on)}
        aria-label={on ? "Show in 2D" : "Show in 3D"}
        data-testid="map-3d-button"
        className={cn(
          // The area square, as the account button's under it: round, its
          // corners were the glass's, not the button's (the iOS audit's P1).
          // 44 px whatever the text size, as the map's other buttons (MAP_BUTTON).
          "relative size-(--size-map-button) rounded-full font-semibold text-foreground native:text-foreground",
          on && "text-tint native:text-tint",
          TEXT.detail,
        )}
      >
        {on ? "2D" : "3D"}
      </Button>
    </div>
  );
}
