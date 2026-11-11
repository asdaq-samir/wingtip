import { Fragment } from "react";
import { cn } from "cn";
import { LEGAL_PAGES } from "../../../../lib/legal";
import { wantScreen } from "../../../../lib/navigation/wanted";
import { TEXT } from "../../../../lib/text";

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
      <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-2">
        {links.map((l) => (
          <Fragment key={l.key}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener"
              className="relative py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </a>
            <span aria-hidden="true">|</span>
          </Fragment>
        ))}
        <button
          type="button"
          onClick={() => wantScreen("about")}
          className="relative py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Legal
        </button>
      </nav>
      <p>© {new Date().getFullYear()} Wingtip Maps</p>
    </footer>
  );
}
