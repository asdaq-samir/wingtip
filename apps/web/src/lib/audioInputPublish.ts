import { useAtcRadio, type HeardInput } from "./atcRadio";
import { isOutside, matchInput, settingsId, useInputs, type Held, type InputChoice } from "./audioInputPure";

/**
 * What is live, put in the radio's store: the track's own name now, or,
 * where the outside input chosen is not heard, that it is lost, why as far
 * as the page knows -- no longer listed, its track ended, the route moved
 * to the device's own microphone, or not to be had at all -- and what is
 * heard instead; and whether the capture is paused (muted), when no sound
 * reaches the page whatever the input sends. Read at every input event
 * and a second after listening starts (lib/atcListening), as starting
 * Safari's recognizer may move the route itself.
 */
export function publishInput(h: Held | null, missing: InputChoice | null) {
  if (!h) {
    // An outside input wanted and not had, nothing in its place: the
    // recognizer hears the default.
    if (missing)
      useAtcRadio.setState({ input: { label: missing.label, outside: true, lost: true, why: "missing", instead: null, paused: false } });
    return;
  }
  const { track } = h;
  const live = track.readyState === "live";
  const now = track.label || h.label;
  const { found, inputs } = useInputs.getState();
  const gone = found && !matchInput(inputs, { id: h.id, label: h.label });
  const fellBack = live && !!track.label && !isOutside(track.label);
  const why: HeardInput["why"] = !h.outside ? null : gone ? "disconnected" : !live ? "ended" : fellBack ? "moved" : null;
  const input: HeardInput = why
    ? { label: h.label, outside: true, lost: true, why, instead: fellBack ? track.label : null, paused: false }
    : missing && !isOutside(now)
      ? { label: missing.label, outside: true, lost: true, why: "missing", instead: live ? now : null, paused: false }
      : { label: now, outside: isOutside(now), lost: false, why: null, instead: null, paused: live && !!track.muted };
  useAtcRadio.setState({ input });
  useInputs.setState({
    chosen: input.lost ? null : (matchInput(inputs, { id: live ? settingsId(track) || h.id : h.id, label: now })?.id ?? null),
  });
}
