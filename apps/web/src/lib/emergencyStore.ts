import { create } from "zustand";

/** Where the emergency assistant was opened from: the flying mode's
 *  Emergency, the pilot's own words ("mayday", "engine failure",
 *  "emergency", components/pilotCommand), or the emergency checklists. */
type EmergencyFrom = "flying" | "voice" | "checklist";

/**
 * Whether the emergency assistant is open, and from where: one place any
 * of its three ways in opens it from, with no map button of its own (the
 * owner's call, 2026-11-08: the map's EMER button is gone).
 */
export const useEmergencyOpen = create<{ open: EmergencyFrom | null }>(() => ({ open: null }));

export const openEmergency = (from: EmergencyFrom) => useEmergencyOpen.setState({ open: from });
export const closeEmergency = () => useEmergencyOpen.setState({ open: null });
