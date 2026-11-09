package app.wingtipmaps.android.ui.sheet

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import kotlin.math.abs

/**
 * A list inside the sheet and the sheet as one gesture, as Material's own
 * bottom sheet joins them: a push up raises the sheet before the list
 * scrolls, a pull down with the list at its top lowers it, and a fling
 * that ends with the sheet between stops settles it on the next stop in
 * the fling's direction -- one stop, as a throw of the handle does.
 */
internal class SheetScroll(private val state: DockedSheetState) : NestedScrollConnection {
    private val drag get() = state.drag

    override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset =
        if (available.y < 0 && source == NestedScrollSource.UserInput) Offset(0f, drag.dispatchRawDelta(available.y)) else Offset.Zero

    override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset =
        if (source == NestedScrollSource.UserInput) Offset(0f, drag.dispatchRawDelta(available.y)) else Offset.Zero

    override suspend fun onPreFling(available: Velocity): Velocity {
        val offset = drag.offset
        return if (available.y < 0 && !offset.isNaN() && offset > drag.anchors.minPosition()) {
            settle(available.y)
            available
        } else {
            Velocity.Zero
        }
    }

    override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
        settle(available.y)
        return available
    }

    /** The next stop in the fling's direction, or the nearest for a slow
     *  one; nothing where the sheet already rests on a stop. */
    private suspend fun settle(velocity: Float) {
        val offset = drag.offset
        if (offset.isNaN()) return
        val target = if (abs(velocity) > MIN_FLING) drag.anchors.closestAnchor(offset, searchUpwards = velocity > 0) else drag.anchors.closestAnchor(offset)
        if (target != null && drag.anchors.positionOf(target) != offset) state.moveTo(target)
    }

    private companion object {
        /** Pixels a second under which a lift is a drop, not a throw. */
        const val MIN_FLING = 400f
    }
}
