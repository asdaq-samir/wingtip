import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// The Baseline Profile's generator and the release build's checks on a
// device (docs/NATIVE-ANDROID.md, "Release build"): a test module, Google's
// stock template for it, that installs the app's benchmarkRelease build (R8
// and the release's keep rules, signed with the debug key) and drives it
// from outside with UiAutomator.
plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "app.wingtipmaps.android.baselineprofile"
    compileSdk {
        version = release(37) {
            minorApiLevel = 2
        }
    }

    defaultConfig {
        // Macrobenchmark and the profile's capture want Android 9 or later
        // (Android 13 or later to capture without root).
        minSdk = 28
        targetSdk = 37
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // The package the app is installed under (app/build.gradle.kts' appId).
        testInstrumentationRunnerArguments["targetAppId"] =
            (System.getenv("ANDROID_NATIVE_APP_ID") ?: providers.gradleProperty("androidNativeAppId").orNull ?: "")
                .trim().ifEmpty { "app.wingtipmaps.android.native" }
    }

    targetProjectPath = ":app"
    // The tests run in their own process and drive the app from outside,
    // so the app is never killed under them (the stock template's setting).
    experimentalProperties["android.experimental.self-instrumenting"] = true

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_25
        targetCompatibility = JavaVersion.VERSION_25
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_25)
        allWarningsAsErrors.set(true)
    }
}

// The phone or emulator attached, CI's or the developer's: no managed
// device, so nothing downloads a system image.
baselineProfile {
    useConnectedDevices = true
}

dependencies {
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.test.uiautomator)
    implementation(libs.androidx.benchmark.macro.junit4)
}
