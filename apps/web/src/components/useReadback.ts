import { useEffect, useRef, useState } from "react";
import { useAtcRadio } from "../lib/atcRadio";
import { listenOnce, stopRadio } from "../lib/atcListening";

/** The card's read back: its words, whether it is being listened for, and
 *  what went wrong. \`text\` is the clearance it answers; \`onStart\` runs as
 *  a new read back begins (the card stops following the radio's newest). */
export function useReadback(text: string, onStart: () => void) {
  // The pilot's read back, heard or typed, checked against the clearance.
  // Read back again listens for it: with the radio listened to on and on,
  // the next transmission settled is it; otherwise the microphone opens
  // for this one read back (listenOnce, the pill over the map typing it),
  // and the card takes the words as it ends. The wait is a subscription
  // to the radio's store, started by the tap and ended at every end the
  // listening has, or with the card.
  const [readback, setReadback] = useState("");
  const [readingBack, setReadingBack] = useState(false);
  const [readbackProblem, setReadbackProblem] = useState<string | null>(null);
  const waiting = useRef<(() => void) | null>(null);
  useEffect(() => {
    const wait = waiting;
    return () => {
      wait.current?.();
      wait.current = null;
    };
  }, []);
  const readBackAgain = () => {
    waiting.current?.();
    onStart();
    setReadback("");
    setReadbackProblem(null);
    setReadingBack(true);
    const clearedText = text;
    const radio = useAtcRadio.getState();
    const after = radio.heard.at(-1)?.id ?? -1;
    const fromRadio = radio.listening && radio.mode === "radio";
    const done = (said: string, problem: string | null) => {
      waiting.current?.();
      waiting.current = null;
      setReadback(said);
      setReadbackProblem(problem);
      setReadingBack(false);
    };
    waiting.current = useAtcRadio.subscribe((s) => {
      if (fromRadio) {
        const next = s.heard.find((t) => t.final && t.id > after);
        if (next) done(next.text, null);
        else if (!s.listening) done("", s.error);
      } else if (s.pill?.readbackOf === clearedText) {
        if (!s.pill.listening) {
          done(s.pill.text, s.pill.text ? null : s.pill.error);
          useAtcRadio.setState({ pill: null });
        }
      } else if (!s.listening) {
        done("", null);
      }
    });
    if (!fromRadio) void listenOnce([], clearedText);
  };
  const readbackTap = () => {
    if (!readingBack) {
      readBackAgain();
      return;
    }
    // A second tap ends it: the microphone's listening, or the wait for
    // the radio's next transmission.
    if (useAtcRadio.getState().mode === "once") stopRadio();
    else {
      waiting.current?.();
      waiting.current = null;
      setReadingBack(false);
    }
  };
  return { readback, setReadback, readingBack, readbackProblem, setReadbackProblem, readbackTap };
}
