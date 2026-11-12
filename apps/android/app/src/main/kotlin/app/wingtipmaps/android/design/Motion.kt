package app.wingtipmaps.android.design

import android.content.Context
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

/** Whether the pilot has asked for less motion: Accessibility's "Remove
 *  animations" sets the system's animator duration scale to 0, as
 *  Developer options' "Animator duration scale: Animation off" does. */
fun reduceMotion(animatorScale: Float): Boolean = animatorScale == 0f

/** Reduce Motion as a Compose value, read again each time the app comes
 *  back to the front (the switch is in the system's Settings). */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    var reduce by remember { mutableStateOf(readReduceMotion(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { reduce = readReduceMotion(context) }
    return reduce
}

internal fun readReduceMotion(context: Context): Boolean =
    reduceMotion(Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))
