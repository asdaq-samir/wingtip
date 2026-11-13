import { useEffect, useState } from "react";

/**
 * Whether the sheet has been drawn where it rests: its slide is eased only
 * from then. The Drawer measures after its first frame, and with the
 * easing on from the start the sheet slid from its full height to the pill
 * as the page opened.
 */
export function useDrawn(): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  return drawn;
}
