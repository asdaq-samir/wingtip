/**
 * What Wingtip Maps is and is not, in one place: the words Settings' About
 * and the briefing's foot both say. They are design/wording.json's
 * planningAid, the same on all three apps (docs/design/rules.md, section
 * 15); the data's sources and their terms are components/dataSources. The
 * pilot in command's authority and the preflight duty are 14 CFR 91.3 and
 * 91.103; the official briefing is Flight Service's (1800wxbrief.com,
 * 1-800-WX-BRIEF). There is no first-launch dialog to accept them, at the
 * owner's ask ("no aviation app does that").
 */
import { WORDING } from "../lib/wording/generated/wording";

/** The reminder a planning aid owes its pilot: the limits, then what to
 *  check before flight (14 CFR 91.103). About's, the printed briefing's
 *  foot and wherever else it is said. */
export const PLANNING_AID: string = WORDING.planningAid;
