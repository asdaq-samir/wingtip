package app.wingtipmaps.android.ui

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
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
 * Whether the phone asks for more contrast, followed as it turns: Android
 * 14's colour contrast (Settings, Display: Medium or High, UiModeManager's
 * contrast of 0.5 or more) or Android 16's High contrast text
 * (AccessibilityManager, public from API 36). The web's prefers-contrast:
 * more and the iPhone's Increase Contrast, under which the grey words and
 * the edges are lifted (WingtipTheme). False before Android 14.
 */
@Composable
fun moreContrast(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return false
    val context = LocalContext.current
    val modes = remember(context) { context.getSystemService(UiModeManager::class.java) }
    var level by remember(modes) { mutableFloatStateOf(modes?.contrast ?: 0f) }
    DisposableEffect(modes) {
        val listener = UiModeManager.ContrastChangeListener { level = it }
        modes?.addContrastChangeListener(context.mainExecutor, listener)
        onDispose { modes?.removeContrastChangeListener(listener) }
    }
    return level >= MORE_CONTRAST || highContrastText()
}

/** UiModeManager's contrast at Medium (0.5) and above: more contrast asked. */
private const val MORE_CONTRAST = 0.5f

@Composable
private fun highContrastText(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA) return false
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(AccessibilityManager::class.java) }
    var on by remember(manager) { mutableStateOf(manager?.isHighContrastTextEnabled == true) }
    DisposableEffect(manager) {
        val listener = AccessibilityManager.HighContrastTextStateChangeListener { on = it }
        manager?.addHighContrastTextStateChangeListener(context.mainExecutor, listener)
        onDispose { manager?.removeHighContrastTextStateChangeListener(listener) }
    }
    return on
}

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
