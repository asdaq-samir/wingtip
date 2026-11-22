import { NotebookPen } from "lucide-react";
import { PageRow } from "../../components/ConsolePages";
import { RowBadge } from "../../components/RowBadge";
import { SETTING_BADGE } from "../../lib/rowBadges";

/** You's row for the scratchpad (ScratchpadPage), beside the documents:
 *  needs no sign-in, its pages on this device. */
export function ScratchpadRow() {
  return (
    <PageRow
      page="scratchpad"
      title="Scratchpad"
      testId="scratchpad-row-open"
      media={
        <RowBadge colour={SETTING_BADGE.scratchpad} round>
          <NotebookPen />
        </RowBadge>
      }
    />
  );
}
