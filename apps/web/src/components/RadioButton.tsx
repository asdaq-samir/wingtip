import { lazy, Suspense, useEffect } from "react";
import { Radio } from "lucide-react";
import Waveform from "./Waveform";
import { cn } from "cn";
import IconButton from "./IconButton";
import { Toggle } from "@base-ui/react/toggle";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent } from "./ResponsivePopover";
import { useAtcRadio } from "../lib/atcRadio";
import { useCanListen } from "../lib/speechLocal";

const ClearanceCard = lazy(() => import("./ClearanceCard"));

/** The listening code, fetched as the map is drawn so a tap starts it at
 *  once: Safari lets a page listen only straight from the tap. */
let listening: typeof import("../lib/atcListening") | null = null;
const load = () => import("../lib/atcListening").then((m) => (listening = m));

/**
 * Comms assist, the radio's button on the map, in the Stops button's
 * place at the owner's ask (2026-11-02): a tap listens to the radio once
 * -- the radio's glyph becomes the radio's level and its circle widens
 * into the pill beside it, the words typing in (RadioPill, in
 * MapControls) -- and a pause or a second tap ends it, the pill then
 * offering what can be done of what was heard. The radio's own mark,
 * the radio's waves, and its own words ("Listening to the radio"): the
 * pilot's voice to the app is another feature with another look (Ask by
 * voice, features/voice; the owner, 2026-11-10). While the radio is
 * listened to on and on (the Radio card's Listen) a tap opens the card,
 * the log; where the browser has no recognizer (Firefox,
 * lib/speechLocal), the card to type in, nothing listening.
 */
export default function RadioButton() {
  const open = useAtcRadio((s) => s.cardOpen);
  const busy = useAtcRadio((s) => s.listening);
  const mode = useAtcRadio((s) => s.mode);
  const voice = useCanListen();
  const setOpen = (cardOpen: boolean) => useAtcRadio.setState({ cardOpen });
  useEffect(() => {
    void load();
  }, []);
  const tap = () => {
    if (!voice || mode === "radio") {
      setOpen(true);
      return;
    }
    if (mode === "once") {
      listening?.stopRadio();
      return;
    }
    if (listening) void listening.listenOnce([]);
    else void load().then((m) => m.listenOnce([]));
  };
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverAnchor asChild>
        {/* Base UI's Toggle, pressed while it listens; the tap does what
            the mode asks (tap). */}
        <Toggle
          pressed={busy}
          render={
            <IconButton
              label={
                mode === "once"
                  ? "Stop listening"
                  : mode === "radio"
                    ? "The radio, listening: open the log"
                    : voice
                      ? "Comms assist: listen"
                      : "Comms assist"
              }
              data-testid="radio-button"
              onClick={tap}
              className={cn(busy && "text-tint", mode === "radio" && "animate-pulse")}
            />
          }
        >
          {/* Live: the radio's level where an input is metered (lib/audioInput). */}
          {mode === "once" && busy ? <Waveform live /> : <Radio className="size-5" strokeWidth={1.75} aria-hidden="true" />}
        </Toggle>
      </ResponsivePopoverAnchor>
      <ResponsivePopoverContent
        title="Radio"
        side="right"
        align="end"
        className="flex w-96 flex-col gap-3 p-3"
        data-testid="clearance-card"
      >
        <Suspense fallback={<div className="h-40" aria-hidden="true" />}>
          <ClearanceCard onDone={() => setOpen(false)} />
        </Suspense>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}
