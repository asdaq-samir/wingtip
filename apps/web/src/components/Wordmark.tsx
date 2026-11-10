import { cn } from "cn";
import { TEXT } from "../lib/text";

/**
 * The app's name as the sheet's title: the mark (public/favicon.svg, the
 * small-size master, which recolours itself at night) beside "Wingtip
 * Maps" in bold, as Apple Maps on the web sets its logo and "Maps" over
 * its search (the owner's screenshot, 2026-11-10). A heading, so a screen
 * reader hears where the sheet starts.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <h1 className={cn("flex min-w-0 items-center gap-1.5 font-bold tracking-tight text-foreground", TEXT.card, className)}>
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} className="size-7 shrink-0" />
      <span className="truncate">Wingtip Maps</span>
    </h1>
  );
}
