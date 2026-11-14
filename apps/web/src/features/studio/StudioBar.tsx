import { Button as BaseButton } from "@base-ui/react/button";
import { Clapperboard } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import { AccountButton } from "../pilot";

/** The Studio's first row, and at rest its pill: its name, and the
 *  account button at the right, where Pilot, Developer and Studio are
 *  switched (AccountMenu), as the developer's page has it (DevBar). The
 *  name tapped opens the sheet (`onUp`). */
export function StudioBar({ title, onUp }: { title: string; onUp: () => void }) {
  return (
    <div className="flex h-full w-full items-center gap-2 print:hidden">
      <BaseButton
        onClick={onUp}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="studio-bar"
      >
        <Clapperboard className="size-6 shrink-0 text-tint" aria-hidden />
        <span className={cn("truncate font-semibold", TEXT.title)}>{title}</span>
      </BaseButton>
      <AccountButton />
    </div>
  );
}
