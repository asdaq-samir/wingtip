/**
 * What Wingtip Maps is and is not, in one place: the words Settings' About
 * and the briefing's foot both say, so they cannot drift apart (the data's
 * sources and their terms are components/dataSources). The pilot
 * in command's authority and the preflight duty are 14 CFR 91.3 and
 * 91.103; the official briefing is Flight Service's (1800wxbrief.com,
 * 1-800-WX-BRIEF). There is no first-launch dialog to accept them, at the
 * owner's ask ("no aviation app does that").
 */

const LIMITS =
  "Wingtip Maps is a planning aid for VFR and IFR flight. It does not replace an official weather briefing (1800wxbrief.com or 1-800-WX-BRIEF), current FAA charts and publications, or the pilot in command’s judgement and final authority (14 CFR 91.3, 91.103). Its checkpoints are a model’s suggestions: check them against the chart.";

/** The reminder a planning aid owes its pilot: the limits, then what to
 *  check before flight (14 CFR 91.103). About's, the printed briefing's
 *  foot and wherever else it is said. */
export const PLANNING_AID = `${LIMITS} Before flight, verify current weather, NOTAMs, TFRs, airport status, aircraft performance, and applicable regulations (14 CFR 91.103).`;
