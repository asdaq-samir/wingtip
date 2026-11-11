import { X } from "lucide-react";
import Wordmark from "../../../../components/Wordmark";
import { Button } from "../../../../components/ui/button";
import { AccountButton } from "../../../pilot";

/**
 * The sheet's title row over the one search, as Apple Maps on the web has
 * its name over its field (the owner's screenshot, 2026-11-10): the app's
 * name at the left and the account button at the row's right end, moved
 * there from beside the field, which now runs the sheet's width. Over a
 * search's results (`onClose`) a round grey ✕ there instead, which clears
 * the search and goes back to the start, as Apple's does.
 */
export default function SheetTitle({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Wordmark />
      {onClose ? (
        <Button
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Clear the search"
          className="relative size-8 rounded-full text-muted-foreground after:absolute after:-inset-1.5"
          data-testid="search-results-close"
        >
          <X className="size-4.5" strokeWidth={2.5} aria-hidden="true" />
        </Button>
      ) : (
        <AccountButton />
      )}
    </div>
  );
}
