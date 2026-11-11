import { useState } from "react";

/** Whether a card kept between its openings is drawn: from its first
 *  opening on (CardLayer's `open`), so a card never opened costs nothing. */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}
