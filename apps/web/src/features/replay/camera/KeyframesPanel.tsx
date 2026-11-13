import { KeyRound, Trash2 } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Switch } from "../../../components/ui/switch";
import { TEXT } from "../../../lib/text";
import { usePastFlight } from "../../../lib/replay/clock";
import { useExporting } from "../export/exportStore";
import { replayTimes } from "../replayTime";
import { viewNow } from "./cameraView";
import { addKeyframe, CAMERAS, changeKeyframe, followKeyframes, removeKeyframe, useReplayCamera, type CameraKind } from "./cameraStore";

/**
 * A video's camera moves: keyframes at moments of the replay, each a
 * camera (the menu's) or, with the camera Free, the view where the map is
 * held. Listed in time, each one's camera changeable from its menu and
 * its moment a tap away; the camera eases from one to the next
 * (keyframes.ts) in the preview and in the export alike.
 */
export function KeyframesPanel() {
  const { keys, keyed, kind } = useReplayCamera();
  const at = usePastFlight((s) => s.at);
  return (
    <div className="flex flex-col gap-3" data-testid="studio-keyframes">
      <Button
        variant="outline"
        disabled={at === null}
        onClick={() => {
          const map = useExporting.getState().map;
          if (at !== null) addKeyframe(at, kind ? null : map && viewNow(map));
        }}
        data-testid="studio-keyframe-add"
      >
        <KeyRound aria-hidden />
        Add a keyframe here
      </Button>
      <p className={cn("text-muted-foreground", TEXT.note)}>
        The camera picked, or with Free, the view as the map is now. The camera eases from each keyframe to the next.
      </p>
      {keys.length > 0 && (
        <ListGroup>
          <ListRow
            title="Camera follows the keyframes"
            value={<Switch checked={keyed} onCheckedChange={followKeyframes} aria-label="Camera follows the keyframes" />}
          />
          {keys.map((k) => (
            <ListRow
              key={k.id}
              title={
                <button
                  type="button"
                  className="relative tabular-nums text-primary after:absolute after:-inset-3 after:content-['']"
                  onClick={() => usePastFlight.setState({ at: k.t })}
                >
                  {replayTimes(k.t).zulu}
                </button>
              }
              value={
                <span className="inline-flex items-center gap-2">
                  {k.kind === "fixed" ? (
                    <span className={TEXT.note}>Held view</span>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" data-testid={`studio-keyframe-kind-${k.id}`} />}>
                        {CAMERAS.find((c) => c.value === k.kind)?.label}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                          value={k.kind}
                          onValueChange={(v: string) => changeKeyframe(k.id, { kind: v as CameraKind })}
                        >
                          {CAMERAS.map((c) => (
                            <DropdownMenuRadioItem key={c.value} value={c.value}>
                              {c.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Delete the keyframe" onClick={() => removeKeyframe(k.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                </span>
              }
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}
