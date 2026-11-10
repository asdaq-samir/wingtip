import { ChartColumn, GraduationCap } from "lucide-react";
import { cn } from "cn";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { TEXT } from "../../lib/text";
import { AccountButton } from "../pilot";
import type { DevTab } from "./devTab";

const PLACES: { value: DevTab; label: string; Icon: typeof GraduationCap }[] = [
  { value: "train", label: "Train", Icon: GraduationCap },
  { value: "perf", label: "Perf", Icon: ChartColumn },
];

/**
 * The developer's page's first row: its two places, Train and Perf, on the
 * stock Tabs (Base UI's, static), and the account button at the right, as
 * the planner's one search has it beside its field (the one-search design,
 * 2026-11-09, which took the planner's tab bar and its Setup away). The
 * tab up tapped on the pill opens the sheet (`onUp`).
 */
export default function DevBar({ tab, onPick, onUp }: { tab: DevTab; onPick: (tab: DevTab) => void; onUp: () => void }) {
  return (
    <div className="flex h-full w-full items-center gap-2 print:hidden">
      <Tabs value={tab} onValueChange={(value) => onPick(value as DevTab)} className="h-full min-w-0 flex-1 gap-0" data-testid="dev-tabs">
        <TabsList variant="line" aria-label="Places" className="h-full! w-full gap-0 p-0">
          {PLACES.map(({ value, label, Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              onClick={() => value === tab && onUp()}
              data-testid={`tab-${value}`}
              className={cn(
                "h-full flex-col gap-0.5 rounded-lg after:hidden",
                value === tab ? "text-tint data-active:text-tint dark:data-active:text-tint" : "text-foreground/80",
              )}
            >
              <Icon className="size-6" aria-hidden="true" />
              <span className={cn("font-semibold", TEXT.tabBar)}>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <AccountButton />
    </div>
  );
}
