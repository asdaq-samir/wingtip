import { useState, type ComponentProps, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { BANNER_INK, bannerGlass, type BannerTone } from "./bannerGlass";
import { TEXT } from "../lib/text";

/** A banner's action: the tint's word on the glass, a capsule as the
 *  stock small ghost Button is (OK, Show, Try again, Keep off). */
export function BannerButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" size="sm" variant="ghost" className={cn("shrink-0 rounded-full text-tint", className)} {...props} />;
}

type Props = Omit<ComponentProps<"div">, "title" | "role"> & {
  icon: LucideIcon;
  tone?: BannerTone;
  /** The line, in its tone's ink and semibold. */
  title: ReactNode;
  /** A second line under it, in the text's ink. */
  sub?: ReactNode;
  /** What a tap on the line opens under it (Base UI's Collapsible). */
  more?: ReactNode;
  /** Its buttons at the end (BannerButton, CloseButton). */
  actions?: ReactNode;
  /** How a screen reader takes it: `status` by default; `region` where
   *  the caller says it once itself (lib/announce), `alert` for a moment
   *  that must interrupt. */
  role?: "status" | "alert" | "region";
  label?: string;
  /** Two lines before it is cut short, where the line is the message. */
  lines?: 1 | 2;
  titleTestId?: string;
  moreTestId?: string;
};

/**
 * One banner over the map: its glyph, its line (and a second under it),
 * a tap opening more under it where there is more, and its actions at the
 * end, 44 tall as a list's row is, on the banners' glass (bannerGlass).
 * Every line in the banners' column is this, each caller passing only its
 * words and buttons: what is ahead (AlertsBanner), the copilot's message,
 * an airplane's alert, what the app could not do, the field weather's age,
 * the sunlight scheme, the ATC copilot's listening line. It was seven
 * hand-built copies, each with its own padding, weight and ink.
 *
 * Its rest props (a data attribute or a test id) go on the glass, round
 * the stock Alert, which is clear: its own card colour outranked the glass
 * on the same element, and it read white.
 */
export default function MapBanner({
  icon: Icon,
  tone = "plain",
  title,
  sub,
  more,
  actions,
  role = "status",
  label,
  lines = 1,
  titleTestId,
  moreTestId,
  className,
  ...rest
}: Props) {
  const [open, setOpen] = useState(false);
  const cut = open ? "" : lines === 2 ? "line-clamp-2" : "truncate";
  const words = (
    <>
      {/* The test id on the line's words where nothing opens, on the
          button that opens more where something does. */}
      <span className={cn("block max-w-full font-semibold", cut)} data-testid={more ? undefined : titleTestId}>
        {title}
      </span>
      {sub && <span className={cn("block max-w-full text-foreground", cut)}>{sub}</span>}
    </>
  );
  return (
    <div className={cn(bannerGlass(), className)} {...rest}>
      <Alert
        role={role}
        aria-label={label}
        className={cn(
          "flex min-h-11 gap-2 rounded-(--radius-banner) border-transparent bg-transparent py-1 pr-1 pl-3 *:[svg]:translate-y-0",
          // Opened, the glyph by the first line rather than the middle.
          open ? "items-start *:[svg]:mt-[0.6rem]" : "items-center",
          !actions && "pr-3",
          BANNER_INK[tone],
        )}
      >
        <Icon className={cn("shrink-0", tone === "tint" && "text-tint")} aria-hidden />
        {more ? (
          // The line a tap opening the rest under it: the disclosure beside
          // the button that opens it, not inside it, and a screen reader is
          // told which it controls.
          <Collapsible open={open} onOpenChange={setOpen} className={cn("flex min-w-0 flex-1 flex-col self-stretch", TEXT.detail)}>
            <CollapsibleTrigger
              data-testid={titleTestId}
              // The line's whole height, so its 44-point hit area is its own.
              className="flex min-w-0 flex-1 flex-col justify-center py-1 text-left outline-none focus-visible:underline"
            >
              {words}
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-1.5 pb-1 text-foreground" data-testid={moreTestId}>
              {more}
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className={cn("flex min-w-0 flex-1 flex-col justify-center py-1", TEXT.detail)}>{words}</div>
        )}
        {actions && (
          <div className={cn("flex shrink-0 items-center gap-1", open && "self-start")} onClickCapture={() => setOpen(false)}>
            {actions}
          </div>
        )}
      </Alert>
    </div>
  );
}
