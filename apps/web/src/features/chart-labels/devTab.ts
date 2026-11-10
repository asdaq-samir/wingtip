import { create } from "zustand";

/** The developer's places, the training page's first row's (DevBar): the
 *  ratings that train the chart model, and how good the models are. */
export type DevTab = "train" | "perf";

/** The tab up, the page's and the retrain's: a confirmed retrain is
 *  followed on Perf (useRetrain), from wherever it was asked for. */
export const useDevTab = create<{ tab: DevTab; pick: (tab: DevTab) => void }>((set) => ({ tab: "train", pick: (tab) => set({ tab }) }));
