import { createContext, useContext } from "react";

/** The kept list's row a control is in (RemovableRow): its Remove, for
 *  Edit's minus (RemoveMinus) to do. */
export const RowRemove = createContext<{ remove: () => void } | null>(null);

/** The removable row round a control, if any. */
export const useRowRemove = () => useContext(RowRemove);
