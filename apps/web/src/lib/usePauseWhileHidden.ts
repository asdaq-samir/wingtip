import { useEffect } from "react";

/** A player's store (zustand's), as far as playing goes. */
interface Playing {
  getState: () => { playing: boolean; set: (patch: { playing: boolean }) => void };
}

/**
 * A timeline's play paused while the app is in the background, so nothing
 * plays unseen, and on again on return if it was playing: the radar loop
 * (features/weather-loop) and the flow layer's hours (features/weather-flow)
 * alike, where the one went on and the other stayed paused (the hand-built
 * audit, 2026-11-12). `on` for the one component that runs the clock.
 */
export function usePauseWhileHidden(on: boolean, player: Playing) {
  useEffect(() => {
    if (!on) return;
    let resume = false;
    const onVisibility = () => {
      const s = player.getState();
      if (document.hidden) {
        resume = s.playing;
        if (s.playing) s.set({ playing: false });
      } else if (resume) {
        resume = false;
        s.set({ playing: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [on, player]);
}
