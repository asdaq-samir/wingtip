package app.wingtipmaps.android.baselineprofile

import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until

/** The app's package, as installed (app/build.gradle.kts' appId, handed in
 *  by this module's build). */
val targetAppId: String = InstrumentationRegistry.getArguments().getString("targetAppId")
    ?: error("targetAppId is passed by baselineprofile/build.gradle.kts")

/** How long the map and the sheet may take to draw on a slow emulator. */
const val DRAWN_MS = 15_000L

/**
 * A cold start as a pilot makes it: from the launcher to the map with the
 * sheet's first content, the moment MainActivity reports itself fully
 * drawn (RootScreen's ReportDrawnWhen), then the window left to settle.
 */
fun MacrobenchmarkScope.startToMap() {
    pressHome()
    startActivityAndWait()
    // The window is the app's once its first frame is drawn; the map's
    // style and the sheet follow, so the wait is for the app to go quiet.
    device.wait(Until.hasObject(By.pkg(targetAppId).depth(0)), DRAWN_MS)
    device.waitForIdle(DRAWN_MS)
}
