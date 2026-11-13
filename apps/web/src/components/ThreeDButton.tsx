import { cn } from "cn";
import { Toggle } from "./ui/toggle";
import { usePreferences } from "../lib/preferences";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";

/**
 * The map stood up in 3D and laid flat again, a round glass button of its
 * own under the microphone's, as Apple Maps' 3D button is (the owner,
 * 2026-11-13: "3d should come out too as another round button below the
 * listening round button, but keep them both round like in Apple Maps"):
 * "3D" while the map is flat, "2D" while it stands, pressed. Off goes back
 * to the 2D chart, its relief shaded; the preference is the one `threeD` (lib/preferences). The stock
 * Toggle (Base UI's, ui/toggle), so it is a pressed or unpressed button to
 * a screen reader; its 44-point area a pseudo-element over the glass's
 * edge round it, never a bigger button.
 */
export default function ThreeDButton() {
  const on = usePreferences((s) => s.threeD);
  const setThreeD = usePreferences((s) => s.setThreeD);
  return (
    <div data-map-food="" className={cn("flex rounded-full p-1", GLASS)}>
      <Toggle
        pressed={on}
        onPressedChange={setThreeD}
        aria-label={on ? "Show in 2D" : "Show in 3D"}
        data-testid="map-3d-button"
        className={cn(
          "relative size-9 rounded-full font-semibold text-foreground after:absolute after:-inset-1 after:rounded-full after:content-['']",
          "aria-pressed:bg-transparent data-pressed:text-tint",
          TEXT.detail,
        )}
      >
        {on ? "2D" : "3D"}
      </Toggle>
    </div>
  );
}
