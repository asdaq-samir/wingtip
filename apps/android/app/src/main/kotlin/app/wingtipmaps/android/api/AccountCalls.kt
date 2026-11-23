package app.wingtipmaps.android.api

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.generated.gateway.PilotContactRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Streaming
import java.time.LocalDate

// The pilot's own account, as the web's Setup has it: everything the
// gateway keeps of them given back as one file, and the account deleted
// (Google Play's account deletion rule, and Apple's 5.1.1(v) on the
// iPhone). Signed in only; both go through the app's one client, so the
// DELETE carries the XSRF-TOKEN header Spring Security's CSRF check asks of
// it (Gateway.client's interceptor).

/** The account deleted with everything of it, and every device signed
 *  out (DELETE /api/me, 204). A 502, where nothing was deleted because the
 *  planner could not be reached, is a Refusal in the gateway's words. */
suspend fun Gateway.deleteAccount() {
    writes.pilotDelete().done()
}

/** The pilot's telephone number and home base, both at once (PUT
 *  /api/me/contact, the iPhone's Gateway.setContact): null is none, so a
 *  change to one carries the other as the account has it. The answer is
 *  the pilot with them. */
suspend fun Gateway.setContact(phone: String?, homeBase: String?): Pilot =
    writes.setContact(PilotContactRequest(homeBase = homeBase, phone = phone)).accepted()

/** The pilot's data as the gateway wrote it, and the name it gave the file. */
class AccountExport(val fileName: String, val bytes: ByteArray)

/** The gateway's calls whose answer is a file kept as sent (Gateway.files).
 *  Each path is the generated GatewayApi's own, which GatewayFilesTest
 *  holds the same, so a path the gateway's document moves fails a test
 *  rather than a pilot's export. */
interface GatewayFiles {
    /** GatewayApi.export: everything the gateway keeps of the pilot. */
    @Streaming
    @GET("api/me/export")
    suspend fun export(): Response<ResponseBody>
}

/** Everything the gateway keeps of the pilot (GET /api/me/export), as one
 *  JSON file named by its Content-Disposition. */
suspend fun Gateway.exportAccount(): AccountExport {
    val answer = files.export()
    val body = answer.body()
    if (answer.code() != 200 || body == null) {
        throw Gateway.Refusal(answer.code(), withContext(Dispatchers.IO) { answer.errorBody()?.use { words(it.string()) } })
    }
    val bytes = withContext(Dispatchers.IO) { body.use { it.bytes() } }
    return AccountExport(exportFileName(answer.headers()["Content-Disposition"]), bytes)
}

/** The file's name from the answer's Content-Disposition
 *  (`attachment; filename="wingtip-maps-2026-11-09.json"`), else the same
 *  pattern with today's date; only the name's last part, so it cannot
 *  point anywhere but the folder the pilot picks. */
fun exportFileName(contentDisposition: String?, today: LocalDate = AppClock.today()): String {
    val named = contentDisposition?.let { Regex("filename=\"?([^\";]+)\"?").find(it)?.groupValues?.get(1) }
        ?.substringAfterLast('/')?.substringAfterLast('\\')?.trim()
    return named?.takeIf { it.isNotEmpty() } ?: "wingtip-maps-$today.json"
}
