package app.wingtipmaps.android.design

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import app.wingtipmaps.android.design.generated.WingtipMotion
import app.wingtipmaps.android.design.generated.WingtipSpring
import app.wingtipmaps.android.design.generated.WingtipSpringSpec

/** A token's spring as Compose's animation spec. */
fun <T> WingtipSpringSpec.spec(): SpringSpec<T> = spring(dampingRatio = dampingRatio, stiffness = stiffness)

/**
 * Material 3 Expressive's motion scheme, from the tokens' springs: what
 * the app's own expressive parts (a press's shape, a choice's pill, a
 * figure's roll, a card under the back gesture) move by, read through
 * ExpressiveMotion.current. The BOM's Material 3 (1.4) keeps its
 * MotionScheme and MaterialTheme's motionScheme internal, so this is the
 * same six specs with the tokens' copy of its springs; the stock
 * components keep Material's own motion until the BOM opens it.
 *
 * Under Remove animations (rememberReduceMotion) nothing moves: a
 * spatial change is at once, and a colour or an opacity fades over
 * motion.fade, never sprung.
 */
@Immutable
class WingtipMotionScheme(private val reduce: Boolean) {
    fun <T> defaultSpatialSpec(): FiniteAnimationSpec<T> = spatial(WingtipSpring.DefaultSpatial)
    fun <T> fastSpatialSpec(): FiniteAnimationSpec<T> = spatial(WingtipSpring.FastSpatial)
    fun <T> slowSpatialSpec(): FiniteAnimationSpec<T> = spatial(WingtipSpring.SlowSpatial)
    fun <T> defaultEffectsSpec(): FiniteAnimationSpec<T> = effects(WingtipSpring.DefaultEffects)
    fun <T> fastEffectsSpec(): FiniteAnimationSpec<T> = effects(WingtipSpring.FastEffects)
    fun <T> slowEffectsSpec(): FiniteAnimationSpec<T> = effects(WingtipSpring.SlowEffects)

    private fun <T> spatial(spring: WingtipSpringSpec): FiniteAnimationSpec<T> = if (reduce) snap() else spring.spec()

    private fun <T> effects(spring: WingtipSpringSpec): FiniteAnimationSpec<T> =
        if (reduce) tween(WingtipMotion.FADE_MS) else spring.spec()

    override fun equals(other: Any?): Boolean = other is WingtipMotionScheme && other.reduce == reduce

    override fun hashCode(): Int = reduce.hashCode()
}

private val LocalExpressiveMotion = staticCompositionLocalOf { WingtipMotionScheme(reduce = false) }

/** The motion scheme in effect, set by the Wingtip theme (WingtipTheme). */
object ExpressiveMotion {
    val current: WingtipMotionScheme
        @Composable @ReadOnlyComposable
        get() = LocalExpressiveMotion.current

    /** The scheme provided to `content`. */
    @Composable
    fun Provide(scheme: WingtipMotionScheme, content: @Composable () -> Unit) {
        CompositionLocalProvider(LocalExpressiveMotion provides scheme, content = content)
    }
}
