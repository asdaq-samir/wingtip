import { cn } from "cn";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

// shadcn's Base UI progress, its track the bar itself as the Radix one's
// root was: no label or value beside it here.
function Progress({ className, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root value={value} data-slot="progress" {...props}>
      <ProgressPrimitive.Track
        data-slot="progress-track"
        className={cn("relative flex h-1.5 w-full items-center overflow-x-hidden rounded-full bg-muted", className)}
      >
        <ProgressPrimitive.Indicator data-slot="progress-indicator" className="h-full bg-primary transition-all" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
