import { createContext } from "react";

/** Sections laid open, each its title over its content, rather than folded
 *  into an accordion (AccordionSection): the planning panel's tabs, which
 *  already show one part of the flight at a time, provide it. */
export const SectionsOpen = createContext(false);

/** Inside a section's content (AccordionSection), folded or laid open: a
 *  list group's title there (ListGroup) is a group's label under the
 *  section's 20-point title, not a third heading at the same size. */
export const InSection = createContext(false);
