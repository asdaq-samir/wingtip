package app.wingtipmaps.android.api

import retrofit2.Response

// A generated call's answer read as the app's hand-written calls read
// theirs: a planner's refusal in its own words (Planner.Failure, FastAPI's
// "detail"), a gateway's in its (Gateway.Refusal), and a read that is
// nobody's signed out as null. An error's body is read and closed here;
// a model's is read and closed by Retrofit's converter.

/** The body of an answer that failed, read and closed. */
private fun Response<*>.errorText(): String = errorBody()?.use { it.string() }.orEmpty()

/** The planner's answer (200), or its words why not. */
fun <T : Any> Response<T>.planned(): T {
    if (code() != 200) throw Planner.Failure(code(), Planner.detail(errorText()))
    return body() ?: throw Planner.Failure(code(), null)
}

/** The planner's answer, or null where it has none (`none`, a 404). */
fun <T : Any> Response<T>.plannedOrNone(none: Set<Int> = setOf(404)): T? = if (code() in none) null.also { errorText() } else planned()

/** The gateway's answer within `ok`, refused in its own words outside. */
fun <T : Any> Response<T>.accepted(ok: IntRange = 200..299): T {
    if (code() !in ok) throw Gateway.Refusal(code(), Gateway.words(errorText()))
    return body() ?: throw Gateway.Refusal(code(), null)
}

/** A gateway call with no answer to read (a 204, a redirect followed),
 *  refused in its own words outside `ok`. */
fun Response<Unit>.done(ok: IntRange = 200..299) {
    if (code() !in ok) throw Gateway.Refusal(code(), Gateway.words(errorText()))
}

/** A read that is nobody's when signed out: null for the statuses in
 *  `none` (401, 403 and 204 unless a call says otherwise). */
fun <T : Any> Response<T>.readOrNone(none: Set<Int> = setOf(204, 401, 403)): T? {
    if (code() == 200) return body()
    if (code() in none) return null.also { errorText() }
    throw Gateway.Refusal(code(), Gateway.words(errorText()))
}
