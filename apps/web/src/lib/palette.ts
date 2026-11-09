import { create } from "zustand";

/**
 * The command palette's state (features/shell/palette): closed, open to
 * everything -- airports, screens and the common actions -- or open to
 * pick the airport to fly Direct To. Here in lib so the keyboard's
 * shortcuts (hooks/use-shortcuts) and the Map menu's row can open it
 * without importing the palette, which is its own chunk.
 */
export type PaletteMode = "all" | "direct";

export const usePalette = create<{ open: PaletteMode | null }>(() => ({ open: null }));

export const openPalette = (mode: PaletteMode = "all") => usePalette.setState({ open: mode });
export const closePalette = () => usePalette.setState({ open: null });

/** Whether the keys are a Mac's (⌘) or another's (Ctrl), for what a menu
 *  shows beside a command. */
const onMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The palette's own keys as a menu shows them. */
export const paletteKeys = (): string => (onMac() ? "⌘K" : "Ctrl K");
