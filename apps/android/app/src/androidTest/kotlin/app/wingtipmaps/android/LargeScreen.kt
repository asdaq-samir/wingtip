package app.wingtipmaps.android

/**
 * A test of the tablet's, the foldable's and the desktop window's layout,
 * which CI also runs on its tablet emulator (scripts/ci/android_device_tests.sh,
 * DEVICE=tablet: these alone there, the whole set on the phone). One that
 * needs the window itself wide checks so and is skipped where it is not.
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
annotation class LargeScreen
