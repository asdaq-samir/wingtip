import { cn } from "cn";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

// shadcn's Base UI progress, its track the bar itself as the Radix one's
// root was: no label or value beside it here. The indicator is the track's
// full width scaled to the value along x, where Base UI sets its width: a
// width eased lays the bar out and paints it again every frame, a
// transform eases on the compositor alone.
function Progress({ className, value, min = 0, max = 100, ...props }: ProgressPrimitive.Root.Props) {
  const share = typeof value === "number" && max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : null;
  return (
    <ProgressPrimitive.Root value={value} min={min} max={max} data-slot="progress" {...props}>
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn("relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-muted", className)}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full origin-left bg-primary transition-transform rtl:origin-right"
          style={share === null ? undefined : { width: "100%", transform: `scaleX(${share})` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
