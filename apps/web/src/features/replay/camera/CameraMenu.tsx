import { Video } from "lucide-react";
import { SpeedMenu } from "../../../components/PlaybackBar";
import { CAMERAS, setReplayCamera, useReplayCamera, type CameraKind } from "./cameraStore";

/** The replay's camera, a menu among a playback bar's parts (a menu, not
 *  a slider: decision 0017), the camera's name on its button. "Free" lets
 *  the map go to the pilot's hand. Inside a PlaybackToolbar. */
export function CameraMenu({ testId }: { testId: string }) {
  const kind = useReplayCamera((s) => s.kind);
  return (
    <span className="inline-flex items-center gap-1">
      <Video className="size-4 text-muted-foreground" aria-hidden />
      <SpeedMenu<CameraKind | "free">
        name="Camera"
        value={kind ?? "free"}
        choices={[...CAMERAS, { value: "free", label: "Free" }]}
        onPick={(v) => setReplayCamera(v === "free" ? null : v)}
        testId={testId}
      />
    </span>
  );
}
