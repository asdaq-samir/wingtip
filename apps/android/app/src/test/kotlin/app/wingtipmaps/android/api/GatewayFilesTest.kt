package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.client.apis.GatewayApi
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.http.GET
import kotlin.coroutines.Continuation

/** The calls kept whole (GatewayFiles) ask the generated client's own
 *  paths, so a path the gateway's OpenAPI document moves is caught here,
 *  with the regenerated GatewayApi, rather than by a pilot's export. */
class GatewayFilesTest {
    private fun path(api: Class<*>, name: String): String =
        checkNotNull(api.getMethod(name, Continuation::class.java).getAnnotation(GET::class.java)).value

    @Test
    fun theExportAsksTheGeneratedPath() {
        assertEquals(path(GatewayApi::class.java, "export"), path(GatewayFiles::class.java, "export"))
    }
}
