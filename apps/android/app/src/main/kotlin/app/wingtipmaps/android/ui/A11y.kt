package app.wingtipmaps.android.ui

import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView

/**
 * What the phone's accessibility settings ask of a screen, in one place:
 * less motion, larger type, a screen reader. Compose's own animations
 * already follow the system's animator scale; these are for what it does
 * not reach (MapLibre's camera) and for the layouts that change with type.
 */
object A11y {
    /** Type this much larger than the default no longer fits a row of four
     *  figures on a phone: from 150 % the rows stack (the figures strip). */
    const val LARGE_TYPE = 1.5f

    /** Android's "Remove animations" (Settings, Accessibility), which sets
     *  the animator scale to 0: the map then jumps where it would glide. */
    fun reducedMotion(context: Context): Boolean =
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

    /** Whether TalkBack, or another screen reader that explores by touch,
     *  is on: what is only worth asking for when someone will hear it. */
    fun screenReader(context: Context): Boolean =
        (context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager)?.isTouchExplorationEnabled == true
}

/** Whether the pilot's font size is large enough that rows of figures
 *  should stack rather than shrink or cut their figures. */
@Composable
fun largeType(): Boolean = LocalDensity.current.fontScale >= A11y.LARGE_TYPE

/**
 * Says `words` once each time `key` changes to something new, for an
 * alert whose text changes every second (the miles to it count down) and
 * so cannot be a live region without being read again and again. Nothing
 * is said for a null key.
 */
@Composable
fun AnnounceOnce(key: Any?, words: String?) {
    val view = LocalView.current
    LaunchedEffect(key) {
        // Deprecated on Android 16 in favour of live regions and pane
        // titles, which re-read the whole node on every change; still the
        // one way to say a thing once.
        @Suppress("DEPRECATION")
        if (key != null && !words.isNullOrEmpty()) view.announceForAccessibility(words)
    }
}
