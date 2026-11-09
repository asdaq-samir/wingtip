package app.wingtipmaps.android.design

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import app.wingtipmaps.android.design.generated.WingtipMotion
import app.wingtipmaps.android.design.generated.WingtipSpring
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The expressive motion scheme: the tokens' springs, and nothing that
 *  moves under Remove animations. */
class ExpressiveMotionTest {
    @Test
    fun springsAreTheTokens() {
        val fast = WingtipMotionScheme(reduce = false).fastSpatialSpec<Float>() as SpringSpec<Float>
        assertEquals(WingtipSpring.FastSpatial.dampingRatio, fast.dampingRatio)
        assertEquals(WingtipSpring.FastSpatial.stiffness, fast.stiffness)
        val effects = WingtipMotionScheme(reduce = false).defaultEffectsSpec<Float>() as SpringSpec<Float>
        assertEquals(WingtipSpring.DefaultEffects.stiffness, effects.stiffness)
    }

    @Test
    fun removeAnimationsSnapsAndFades() {
        val still = WingtipMotionScheme(reduce = true)
        assertTrue(still.defaultSpatialSpec<Float>() is SnapSpec<Float>)
        assertTrue(still.slowSpatialSpec<Float>() is SnapSpec<Float>)
        assertEquals(WingtipMotion.FADE_MS, (still.fastEffectsSpec<Float>() as TweenSpec<Float>).durationMillis)
    }
}
