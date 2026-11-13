package app.wingtipmaps.android.baselineprofile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The release build still reaches the engine after R8 (CI's emulator,
 * native-android.yml): the app's benchmarkRelease build -- the release's
 * shrinking and keep rules, signed with the debug key -- is started and its
 * map left to settle. The map's first rest asks the engine `distance_nm`
 * through the generated bindings (MapPane's onView), so a JNA interface
 * or Structure R8 renamed or dropped (proguard-rules.pro keeps them) or a
 * contract class's serializer stripped is logged by Engine.rule as
 * "<rule> failed" under the "engine" tag, or kills the process. Neither
 * may happen.
 */
@RunWith(AndroidJUnit4::class)
class ReleaseEngineTest {
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

    @Test
    fun theReleaseBuildLoadsTheEngineAndCallsIt() {
        device.executeShellCommand("am force-stop $targetAppId")
        device.executeShellCommand("logcat -c")
        val started = device.executeShellCommand("am start -W -n $targetAppId/app.wingtipmaps.android.MainActivity")
        assertTrue("the app did not start: $started", started.contains("Status: ok"))
        assertTrue("no window of the app's", device.wait(Until.hasObject(By.pkg(targetAppId).depth(0)), DRAWN_MS))
        device.waitForIdle(DRAWN_MS)

        val pid = device.executeShellCommand("pidof $targetAppId").trim()
        assertTrue("the app's process has gone", pid.isNotEmpty())
        val log = device.executeShellCommand("logcat -d --pid=$pid")
        assertFalse("the app crashed:\n$log", log.contains("FATAL EXCEPTION") || log.contains("UnsatisfiedLinkError"))
        val engine = log.lines().filter { " engine" in it && " failed" in it }
        assertTrue("the engine failed in the release build:\n${engine.joinToString("\n")}", engine.isEmpty())
    }
}
