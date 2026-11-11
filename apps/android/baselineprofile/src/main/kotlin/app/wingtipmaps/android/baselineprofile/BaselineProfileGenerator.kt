package app.wingtipmaps.android.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The app's Baseline Profile: the classes and methods a cold start runs,
 * from the launcher to the map and the sheet, compiled ahead of time on
 * the phone so the first launch is not run through the interpreter.
 * `./gradlew :app:generateBaselineProfile` with a phone or an emulator
 * attached (Android 13 or later, or a rooted one) writes it into the
 * app's src/main/generated/baselineProfiles, which is committed.
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(packageName = targetAppId, includeInStartupProfile = true) { startToMap() }
}
