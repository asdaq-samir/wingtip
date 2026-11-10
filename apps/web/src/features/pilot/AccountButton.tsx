import { Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { fromChunk } from "../../lib/fromChunk";
import { pilotQuery } from "../../lib/queryClient";
import { AccountFace } from "./AccountFace";
import { ACCOUNT_BUTTON } from "./accountLook";

/** The menu on a chunk of its own (Base UI's Menu and its positioning,
 *  ~40 KB): the first load's budget (scripts/first-load.mjs, 1.10 MB).
 *  Asked for a moment after the page draws, or at the first press. */
const menu = fromChunk(
  () => import("./AccountMenuButton"),
  (m) => m.default,
);
const AFTER_MS = 2000;

/**
 * The account button beside the one search (AccountMenuButton, its menu
 * of Setup's rows): the same button drawn at once, the menu round it once
 * its chunk is in -- a press before then asks for it.
 */
export default function AccountButton({ className }: { className?: string }) {
  const { data: pilot } = useQuery(pilotQuery);
  const name = pilot ? pilot.fullName || pilot.displayName : null;
  useEffect(() => {
    const later = window.setTimeout(menu.prefetch, AFTER_MS);
    return () => window.clearTimeout(later);
  }, []);
  const waiting = (
    <button
      type="button"
      aria-label={name ? `Account and settings, ${name}` : "Account and settings"}
      aria-haspopup="menu"
      data-testid="account-button"
      data-console-button=""
      onPointerDown={menu.prefetch}
      className={cn(ACCOUNT_BUTTON, className)}
    >
      <AccountFace name={name} />
    </button>
  );
  return (
    <Suspense fallback={waiting}>
      <menu.Part className={className} />
    </Suspense>
  );
}
