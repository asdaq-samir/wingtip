import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { SkeletonLine } from "../../../components/QueryState";
import { TEXT } from "../../../lib/text";

/** One end of the flight in its summary: the field's ident, a tap that
 *  opens its card where there is one to open, and its town under it. */
export function End({
  ident,
  place,
  at,
  right = false,
  onOpen,
  testId,
  openTestId,
}: {
  ident: string;
  place?: string | null;
  at?: string | null;
  right?: boolean;
  onOpen?: () => void;
  testId?: string;
  openTestId?: string;
}) {
  const name = <span className={cn("max-w-full truncate font-bold", TEXT.title)}>{ident}</span>;
  return (
    <span className={cn("flex min-w-0 flex-col", right && "items-end text-right")} data-testid={testId}>
      {onOpen ? (
        <Button
          variant="link"
          size="inline"
          onClick={onOpen}
          aria-label={`${ident}'s card`}
          data-testid={openTestId}
          className="relative max-w-full after:absolute after:-inset-x-2 after:-inset-y-3"
        >
          {name}
        </Button>
      ) : (
        <span className="text-foreground">{name}</span>
      )}
      {place && <span className={cn("max-w-full truncate text-muted-foreground", TEXT.note)}>{place}</span>}
      {at && <span className={cn("max-w-full truncate text-muted-foreground tabular-nums", TEXT.note)}>{at}</span>}
    </span>
  );
}

/** An end still asked for, at an End's height: its ident's and town's lines. */
export function EndPending({ right = false }: { right?: boolean }) {
  return (
    <span className={cn("flex min-w-0 flex-col", right && "items-end")}>
      <span className={TEXT.title}>
        <SkeletonLine className="w-14" />
      </span>
      <span className={TEXT.note}>
        <SkeletonLine className="w-20" />
      </span>
    </span>
  );
}
