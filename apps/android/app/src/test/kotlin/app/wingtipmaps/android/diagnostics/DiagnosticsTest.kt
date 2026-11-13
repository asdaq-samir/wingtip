package app.wingtipmaps.android.diagnostics

import android.app.ApplicationExitInfo
import app.wingtipmaps.android.api.generated.gateway.FaultReport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The diagnostics' pure parts: the body cut to what the gateway takes
 *  (DiagnosticsController's limits), the exits that are faults, the
 *  crash's file, and the session's frame figures. */
class DiagnosticsTest {
    private val fault = FaultReport(
        kind = "crash",
        signature = "java.lang.IllegalStateException: boom",
        detail = "at x.y(Z.kt:1)",
        at = "2026-11-09T12:00:00Z",
    )

    @Test
    fun aBodySaysTheBuildAndTheSystemAndNothingOfThePilots() {
        val body = DiagnosticsBodies.build("1.0", 42, "16", tablet = false, faults = listOf(fault), metrics = mapOf("frames" to 120.0))
        assertNotNull(body)
        body!!
        assertEquals("android", body.platform)
        assertEquals("1.0 (42)", body.version)
        assertEquals("Android 16", body.os)
        assertEquals("phone", body.device)
        assertEquals("app", body.page)
        assertEquals(listOf(fault), body.faults)
        assertEquals(mapOf("frames" to 120.0), body.metrics)
        assertEquals("tablet", DiagnosticsBodies.build("1.0", 1, "16", true, listOf(fault), emptyMap())!!.device)
    }

    @Test
    fun nothingToSayIsNoBody() {
        assertNull(DiagnosticsBodies.build("1.0", 1, "16", false, emptyList(), emptyMap()))
    }

    @Test
    fun aBodyIsCutToTheGatewaysLimits() {
        val many = List(25) { fault.copy(signature = "sig $it\nsecond line", detail = "x".repeat(70_000)) }
        val metrics = (0 until 35).associate { "m$it" to it * 1e7 } + mapOf("Bad-Name" to 1.0, "nan" to Double.NaN, "neg" to -5.0)
        val body = DiagnosticsBodies.build("1.0-beta/é", 7, "x".repeat(50), false, many, metrics)!!
        assertEquals(DiagnosticsBodies.MAX_FAULTS, body.faults.size)
        assertEquals("sig 24", body.faults.last().signature)
        assertTrue(body.faults.all { it.detail.length == DiagnosticsBodies.MAX_DETAIL })
        assertTrue(body.metrics.size <= DiagnosticsBodies.MAX_METRICS)
        assertTrue(body.metrics.keys.none { it == "Bad-Name" || it == "nan" })
        assertTrue(body.metrics.values.all { it in 0.0..DiagnosticsBodies.MAX_METRIC })
        assertTrue(Regex("[A-Za-z0-9._ ()+-]{1,40}").matches(body.version))
        assertTrue(body.os.length <= 40)
    }

    @Test
    fun aFaultOfAKindTheGatewayDoesNotKnowIsLeftOut() {
        assertNull(DiagnosticsBodies.build("1.0", 1, "16", false, listOf(fault.copy(kind = "oops")), emptyMap()))
    }

    @Test
    fun crashesHangsAndForcedExitsAreFaultsAndOrdinaryEndsAreNot() {
        assertEquals("crash", ExitReasons.kindOf(ApplicationExitInfo.REASON_CRASH))
        assertEquals("crash", ExitReasons.kindOf(ApplicationExitInfo.REASON_CRASH_NATIVE))
        assertEquals("hang", ExitReasons.kindOf(ApplicationExitInfo.REASON_ANR))
        assertEquals("exit", ExitReasons.kindOf(ApplicationExitInfo.REASON_LOW_MEMORY))
        assertEquals("exit", ExitReasons.kindOf(ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE))
        for (ordinary in listOf(
            ApplicationExitInfo.REASON_EXIT_SELF, ApplicationExitInfo.REASON_USER_REQUESTED,
            ApplicationExitInfo.REASON_USER_STOPPED, ApplicationExitInfo.REASON_PERMISSION_CHANGE,
            ApplicationExitInfo.REASON_DEPENDENCY_DIED, ApplicationExitInfo.REASON_OTHER,
            ApplicationExitInfo.REASON_SIGNALED, ApplicationExitInfo.REASON_UNKNOWN,
        )) assertNull(ExitReasons.kindOf(ordinary))
    }

    @Test
    fun anExitIsSaidOnceWithItsReasonAndDescription() {
        val at = 1_762_689_600_000L
        val hang = ExitReasons.fault(ApplicationExitInfo.REASON_ANR, "Input dispatching timed out", at, "\"main\" tid=1", reportedUpToMs = 0)!!
        assertEquals("hang", hang.kind)
        assertEquals("ANR: Input dispatching timed out", hang.signature)
        assertEquals("\"main\" tid=1", hang.detail)
        assertEquals(Instant.ofEpochMilli(at).toString(), hang.at)
        assertNull(ExitReasons.fault(ApplicationExitInfo.REASON_ANR, null, at, null, reportedUpToMs = at))
        assertNull(ExitReasons.fault(ApplicationExitInfo.REASON_USER_REQUESTED, null, at, null, reportedUpToMs = 0))
        // A Kotlin crash the catcher wrote down is not said twice; a native one is.
        assertNull(ExitReasons.fault(ApplicationExitInfo.REASON_CRASH, null, at, null, 0, caught = true))
        assertNotNull(ExitReasons.fault(ApplicationExitInfo.REASON_CRASH_NATIVE, null, at, null, 0, caught = true))
    }

    @Test
    fun aCrashWrittenDownIsReadBackAsACrashFault() {
        val at = Instant.parse("2026-11-09T12:00:00Z")
        val error = IllegalStateException("boom\nmore")
        val read = CrashCatcher.read(CrashCatcher.write(error, at))!!
        assertEquals("crash", read.kind)
        assertEquals("java.lang.IllegalStateException: boom", read.signature)
        assertTrue(read.detail.startsWith("java.lang.IllegalStateException: boom"))
        assertEquals("2026-11-09T12:00:00Z", read.at)
        assertEquals("java.lang.RuntimeException", CrashCatcher.signatureOf(RuntimeException()))
        assertNull(CrashCatcher.read("not a time\nx"))
    }

    @Test
    fun aSessionsFramesGiveTheJankRatioAndItsLaunch() {
        assertEquals(
            mapOf("frames" to 200.0, "janky_frames" to 10.0, "jank_ratio" to 0.05, "launch_ms" to 850.0),
            FrameStats.figures(200, 10, 850),
        )
        assertEquals(emptyMap<String, Double>(), FrameStats.figures(0, 0, null))
    }
}
