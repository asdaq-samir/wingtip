package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.CfrText
import app.wingtipmaps.android.api.generated.Library
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.io.File

// TODO(claude/documents): PlannerApi's libraryShelf and libraryText are
// written by scripts/build/api-models-apps.sh once the planner's
// openapi.json has the library's routes (python -m app.openapi), which is
// the integrator's on that branch.

/** The documents library's shelf (/api/library): every document in its
 *  order, each with the edition the planner keeps and its date. */
suspend fun Planner.libraryShelf(): Library = api.libraryShelf().planned()

/** A CFR part's text in an edition (/api/library/{doc}/{edition}/text):
 *  its subparts, sections and paragraphs. */
suspend fun Planner.libraryText(doc: String, edition: String): CfrText = api.libraryText(doc, edition).planned()

/**
 * A document's PDF in an edition (/api/library/{doc}/{edition}.pdf)
 * written whole into `into`: a file's bytes, which the generated client
 * does not carry, on the streaming client as the chart downloads are.
 * The edition is in the address, so a copy of it is good for good.
 * `told` hears the bytes written and expected (-1 unknown) each megabyte;
 * the copy ends early where `stopped` says so, and answers false.
 */
suspend fun Planner.libraryPdf(doc: String, edition: String, into: File, told: suspend (Long, Long) -> Unit = { _, _ -> }, stopped: () -> Boolean = { false }): Boolean {
    val request = Request.Builder().url(url("/api/library/$doc/$edition.pdf")).build()
    return Gateway.streaming.newCall(request).executeAsync().use { response ->
        if (response.code != 200) throw Planner.Failure(response.code, null)
        val total = response.body.contentLength()
        into.outputStream().use { out ->
            val input = response.body.byteStream()
            val buffer = ByteArray(1 shl 16)
            var written = 0L
            var said = 0L
            while (true) {
                if (stopped()) return@use false
                val n = input.read(buffer)
                if (n < 0) break
                out.write(buffer, 0, n)
                written += n
                if (written - said > (1L shl 20)) {
                    said = written
                    told(written, total)
                }
            }
            true
        }
    }
}
