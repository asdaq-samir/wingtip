import { Library } from "lucide-react";
import { PageRow } from "../../components/ConsolePages";
import { RowBadge } from "../../components/RowBadge";
import { SETTING_BADGE } from "../../lib/rowBadges";

/** You's row for the documents library (DocumentsPage), beside the
 *  pilot's other things: needs no sign-in, its documents on this device. */
export function DocumentsRow() {
  return (
    <PageRow
      page="documents"
      title="Documents"
      testId="documents-row"
      media={
        <RowBadge colour={SETTING_BADGE.documents} round>
          <Library />
        </RowBadge>
      }
    />
  );
}
