package app.wingtipmaps.android.api

import java.time.LocalDate

// The pilot's own account, as the web's Setup has it: everything the
// gateway keeps of them given back as one file, and the account deleted
// (Google Play's account deletion rule, and Apple's 5.1.1(v) on the
// iPhone). Signed in only; both go through Gateway.request, so the DELETE
// carries the XSRF-TOKEN header Spring Security's CSRF check asks of it.

/** The account deleted with everything of it, and every device signed
 *  out (DELETE /api/me, 204). A 502, where nothing was deleted because the
 *  planner could not be reached, is a Refusal in the gateway's words. */
suspend fun Gateway.deleteAccount() {
    send("DELETE", "/api/me")
}

/** The pilot's data as the gateway wrote it, and the name it gave the file. */
class AccountExport(val fileName: String, val bytes: ByteArray)

/** Everything the gateway keeps of the pilot (GET /api/me/export), as one
 *  JSON file named by its Content-Disposition. */
suspend fun Gateway.exportAccount(): AccountExport =
    streaming.newCall(request("GET", "/api/me/export")).await().use { response ->
        val bytes = response.body.bytes()
        if (response.code != 200) throw Gateway.Refusal(response.code, words(bytes.decodeToString()))
        AccountExport(exportFileName(response.header("Content-Disposition")), bytes)
    }

/** The file's name from the answer's Content-Disposition
 *  (`attachment; filename="wingtip-maps-2026-11-09.json"`), else the same
 *  pattern with today's date; only the name's last part, so it cannot
 *  point anywhere but the folder the pilot picks. */
fun exportFileName(contentDisposition: String?, today: LocalDate = LocalDate.now()): String {
    val named = contentDisposition?.let { Regex("filename=\"?([^\";]+)\"?").find(it)?.groupValues?.get(1) }
        ?.substringAfterLast('/')?.substringAfterLast('\\')?.trim()
    return named?.takeIf { it.isNotEmpty() } ?: "wingtip-maps-$today.json"
}
