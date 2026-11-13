import { useState, type ReactNode } from "react";
import SheetDialog from "./SheetDialog";
import { Button } from "./ui/button";
import { askMicrophone, permissionState } from "../lib/permissions";

/**
 * Why the ATC copilot wants the microphone, said before the browser asks:
 * turning the copilot on (Settings' ATC page) opens this first where the
 * browser has not been answered yet. Allow asks the browser and turns it
 * on; Not Now leaves it off. Granted already, it turns on at once.
 * Returns the sheet to draw and the ask, with what to do once allowed.
 */
export function useMicPrimer(): [ReactNode, (then: () => void) => void] {
  const [waiting, setWaiting] = useState<(() => void) | null>(null);
  const ask = (then: () => void) => {
    void permissionState("microphone").then((state) => {
      if (state === "granted") then();
      else setWaiting(() => then);
    });
  };
  const allow = () => {
    const then = waiting;
    setWaiting(null);
    // On, whatever the answer: the copilot says itself where it cannot listen.
    void askMicrophone().then(() => then?.());
  };
  const sheet = (
    <SheetDialog
      open={waiting !== null}
      onOpenChange={(open) => {
        if (!open) setWaiting(null);
      }}
      title="The Microphone"
      description="Wingtip listens to the radio to write down your clearance. Wingtip records no audio, and keeps speech on this device wherever your browser can."
      testId="mic-primer"
    >
      <div className="grid gap-2">
        <Button type="button" size="lg" className="h-12 rounded-(--radius-control) font-semibold" onClick={allow} data-testid="mic-allow">
          Allow
        </Button>
        <Button type="button" variant="ghost" onClick={() => setWaiting(null)} data-testid="mic-not-now">
          Not Now
        </Button>
      </div>
    </SheetDialog>
  );
  return [sheet, ask];
}
