import { cn } from "cn";
import SheetDialog from "../../../../components/SheetDialog";
import { Button } from "../../../../components/ui/button";
import { WELCOME, unseen, useTips } from "../../../../lib/firstRunTips";
import { TEXT } from "../../../../lib/text";
import { useWelcome, type WelcomeStep } from "../../hooks/useWelcome";
import type { RouteParts } from "../RouteBox";
import { WelcomePage } from "./WelcomePages";

/** Each page's title and its one sentence. */
const PAGES: Record<WelcomeStep, { title: string; line: string }> = {
  airplane: {
    title: "Your Airplane",
    line: "Times and fuel are worked out for the airplane you fly. With none, Wingtip shows only what it can without one.",
  },
  home: { title: "Home Airport", line: "Where your flights usually start, when Wingtip cannot tell where you are." },
  rules: { title: "VFR or IFR", line: "Which rules every route is planned under: its altitudes, and its fuel reserve." },
  location: { title: "Your Location", line: "Wingtip plans from where you are and shows your airplane on the chart." },
  ready: { title: "Ready to Plan", line: "See a whole flight first: Madison to Oshkosh, with its route, nav log and Brief." },
};

/**
 * The welcome: a short sheet the first time the planner opens on this
 * device with no route, before the first flight's card (FirstFlight) --
 * the airplane, Home, VFR or IFR, then the location with why before the
 * browser asks, and a sample flight to open in one tap. Every page can
 * be skipped, its close too; once finished or skipped it is not shown
 * again (useWelcome).
 */
export default function Welcome({
  routed,
  onPlan,
  onOpened,
}: {
  routed: boolean;
  onPlan: (parts: RouteParts) => void;
  onOpened: () => void;
}) {
  const due = useTips((s) => unseen(s.seen, WELCOME));
  if (!due || routed) return null;
  return <WelcomeSheet onPlan={onPlan} onOpened={onOpened} />;
}

function WelcomeSheet({ onPlan, onOpened }: { onPlan: (parts: RouteParts) => void; onOpened: () => void }) {
  const vm = useWelcome({ onPlan, onOpened });
  const page = PAGES[vm.step];
  const asks = vm.step === "location" || vm.step === "ready";
  return (
    <SheetDialog
      open
      onOpenChange={(open) => {
        if (!open) vm.skip();
      }}
      title={page.title}
      testId="welcome"
      description={page.line}
    >
      {/* Named for the page transition (lib/viewTransition). */}
      <div className="grid gap-4 [view-transition-name:wingtip-page]" data-testid={`welcome-${vm.step}`}>
        <WelcomePage vm={vm} />
        {!asks && (
          <div className="grid gap-2">
            <Button type="button" size="lg" className="h-12 rounded-[14px] font-semibold" onClick={vm.next} data-testid="welcome-next">
              Next
            </Button>
            <Button type="button" variant="ghost" onClick={vm.skip} data-testid="welcome-skip">
              Skip
            </Button>
          </div>
        )}
        <p className={cn("text-center text-muted-foreground", TEXT.note)} aria-live="polite">
          {vm.index + 1} of {vm.count}
        </p>
      </div>
    </SheetDialog>
  );
}
