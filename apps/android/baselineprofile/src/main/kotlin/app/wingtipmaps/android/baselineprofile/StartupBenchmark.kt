package app.wingtipmaps.android.baselineprofile

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The release build's cold start on a real phone: the time to the first
 * frame (timeToInitialDisplayMs) and to the map with the sheet's first
 * content (timeToFullDisplayMs, from MainActivity's reportFullyDrawn),
 * with no ahead-of-time compilation and with the Baseline Profile, so the
 * profile's gain is the difference. Run on a phone, not an emulator,
 * whose timings are not a pilot's:
 * `./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest
 * -Pandroid.testInstrumentationRunnerArguments.class=app.wingtipmaps.android.baselineprofile.StartupBenchmark`.
 */
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val rule = MacrobenchmarkRule()

    @Test
    fun startupWithoutCompilation() = startup(CompilationMode.None())

    @Test
    fun startupWithBaselineProfile() = startup(CompilationMode.Partial(BaselineProfileMode.Require))

    private fun startup(mode: CompilationMode) = rule.measureRepeated(
        packageName = targetAppId,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.COLD,
        iterations = 10,
    ) { startToMap() }
}
