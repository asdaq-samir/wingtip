import { Fragment } from "react";
import { cn } from "cn";
import { LEGAL_PAGES } from "../../../../lib/legal";
import { wantScreen } from "../../../../lib/navigation/wanted";
import { TEXT } from "../../../../lib/text";
import { Button as BaseButton } from "@base-ui/react/button";

/** A foot link: grey words, its 44-point hit area a pseudo-element round
 *  them, the links far enough apart that their areas meet without
 *  overlapping (CLAUDE.md; the web audit's WEB-45: Privacy and Terms were
 *  42 and 35 by 26 with no area of their own). */
const FOOT_LINK =
  "relative outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The foot of the search's page, as Apple Maps on the web ends its sheet
 * (the owner's screenshot, 2026-11-10): Privacy | Terms | Legal, centred
 * in grey, then the copyright. All the way up the map's own row of these
 * (lib/map/gl/MapCredits) is under the sheet, so they are here. Legal is
 * About, where each data source and its licence is listed. No "manage
 * your business" line: there is no page for flight schools or clubs yet.
 */
export default function SheetFooter() {
  const links = [
    ...LEGAL_PAGES.filter((p) => p.key !== "support").map((p) => ({
      key: p.key,
      label: p.key === "privacy" ? "Privacy" : "Terms",
      href: p.href,
    })),
  ];
  return (
    <footer
      className={cn("flex flex-col items-center gap-3 px-4 pt-6 pb-4 text-center text-muted-foreground", TEXT.note)}
      data-testid="sheet-footer"
    >
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-6">
        {links.map((l) => (
          <Fragment key={l.key}>
            <a href={l.href} target="_blank" rel="noopener" className={FOOT_LINK}>
              {l.label}
            </a>
            <span aria-hidden="true">|</span>
          </Fragment>
        ))}
        <BaseButton onClick={() => wantScreen("about")} className={FOOT_LINK}>
          Legal
        </BaseButton>
      </nav>
      <p>© {new Date().getFullYear()} Wingtip Maps</p>
    </footer>
  );
}
