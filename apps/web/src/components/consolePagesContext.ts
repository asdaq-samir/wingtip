import { createContext, useContext } from "react";

/** A console's pages, for its rows (ConsolePages' PageRow): opening one,
 *  and the one the list was last left from, for the focus back. */
export const Pages = createContext<{ open: (page: string) => void; from: string | null } | null>(null);

/** Opens one of the console's pages from something on its list that is
 *  not a row -- You's Add Your Name, opening Pilot Details -- as a row
 *  does: its close back to the list, not out of the console. */
export function useOpenPage(): (page: string) => void {
  const pages = useContext(Pages);
  return (page) => pages?.open(page);
}
