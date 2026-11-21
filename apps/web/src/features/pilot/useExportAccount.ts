import { useMutation } from "@tanstack/react-query";
import { shareFile } from "../../lib/flightPlanFiles";
import { showError } from "../../lib/problems";
import { gateway } from "../../lib/api/http";
import { describeError } from "../../lib/api/errors";
import { localDay } from "../../lib/format";

/** The file's name as the gateway gives it (ExportController), else one
 *  of today's, this device's day (lib/format's localDay: an ISO string's
 *  is UTC's, tomorrow by the evening across the U.S.); never a folder,
 *  whatever the header says. */
export function exportFileName(disposition: string | null, today: Date = new Date()): string {
  const named = /filename="?([^";]+)"?/
    .exec(disposition ?? "")?.[1]
    ?.split(/[\\/]/)
    .pop();
  return named || `wingtip-maps-${localDay(today)}.json`;
}

/** Everything the gateway keeps for the signed-in pilot, as one JSON
 *  file (GET /api/me/export): their account, airplanes, flights, logbook,
 *  currency and training, shared or saved as the logbook's CSV is
 *  (shareFile). A failure says so where the pilot is (lib/problems). */
export function useExportAccount() {
  return useMutation({
    // Through the gateway's own client (lib/api/http): its request id, its
    // timeout and its errors in the app's words, which a raw fetch here
    // skipped (CODE-39).
    mutationFn: async () => {
      const { data: text, response } = await gateway.GET("/api/me/export", { parseAs: "text" });
      await shareFile(exportFileName(response.headers.get("Content-Disposition")), "application/json", text ?? "");
    },
    onError: (err) => {
      if ((err as Error).name !== "AbortError") showError("Your data was not exported", describeError(err));
    },
  });
}
