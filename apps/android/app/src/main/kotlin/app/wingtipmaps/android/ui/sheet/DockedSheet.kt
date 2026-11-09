package app.wingtipmaps.android.ui.sheet

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.AnchoredDraggableDefaults
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.gestures.animateTo
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipMotion
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.roundToInt
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import androidx.compose.material3.ExperimentalMaterial3Api

/** Where the docked sheet rests: the pill (the figures and the tabs'
 *  names), half the screen, or the whole of it (decision 0018). */
enum class SheetStop { PILL, HALF, FULL }

/** The one stop below, or none from the pill. */
fun SheetStop.lower(): SheetStop? = when (this) {
    SheetStop.FULL -> SheetStop.HALF
    SheetStop.HALF -> SheetStop.PILL
    SheetStop.PILL -> null
}

/** Every move of the sheet: ease-out over 300 ms, no spring (decision
 *  0018), from the tokens. */
val SheetMotion: AnimationSpec<Float> = tween(WingtipMotion.SHEET_MS, easing = WingtipMotion.SheetEase)

/**
 * The docked sheet's place: Foundation's own anchored drag between the
 * three stops. Its fling settles on the next stop in the throw's
 * direction, never two (AnchoredDraggableDefaults.flingBehavior), so a
 * throw moves one size; a finger dragged past half may carry it on.
 */
@Stable
class DockedSheetState(initial: SheetStop) {
    val drag = AnchoredDraggableState(initial)

    /** The stop the sheet rests at, or is settling to. */
    val stop: SheetStop get() = drag.settledValue

    suspend fun moveTo(stop: SheetStop) = drag.animateTo(stop, SheetMotion)

    /** One stop down; false at the pill. */
    suspend fun lower(): Boolean {
        val to = drag.currentValue.lower() ?: return false
        moveTo(to)
        return true
    }

    internal companion object {
        val saver = Saver<DockedSheetState, String>(save = { it.drag.settledValue.name }, restore = { DockedSheetState(SheetStop.valueOf(it)) })
    }
}

@Composable
fun rememberDockedSheetState(initial: SheetStop = SheetStop.PILL): DockedSheetState =
    rememberSaveable(saver = DockedSheetState.saver) { DockedSheetState(initial) }

/**
 * The map's panel: one sheet docked on the screen's foot at the pill,
 * half or full, Material's sheet surface and drag handle over what is
 * under it (decision 0013: the panel stays where it is). A list inside
 * drags the sheet once it is scrolled to its top, as Material's own
 * bottom sheet does.
 *
 * Back, the system's predictive gesture, lowers the sheet one stop, the
 * sheet following the finger part of the way while the gesture is held;
 * at the pill the gesture goes on to the screen's own handlers (a card
 * popped) and then out of the app.
 *
 * @param peek how much of the sheet shows at the pill, the navigation
 *   bar included.
 * @param body what lies under the sheet, given what the sheet covers at
 *   the pill, where the map centres what it shows.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DockedSheet(
    state: DockedSheetState,
    peek: Dp,
    modifier: Modifier = Modifier,
    body: @Composable (covered: Dp) -> Unit,
    sheet: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val scope = rememberCoroutineScope()
    BoxWithConstraints(modifier.fillMaxSize()) {
        val height = with(density) { maxHeight.toPx() }
        val fullAt = with(density) { (top + WingtipSpace.Sm).toPx() }
        val pillAt = height - with(density) { peek.toPx() }
        val halfAt = (height / 2).coerceIn(fullAt, pillAt)
        val anchors = remember(height, fullAt, pillAt) {
            DraggableAnchors {
                SheetStop.PILL at pillAt
                SheetStop.HALF at halfAt
                SheetStop.FULL at fullAt
            }
        }
        LaunchedEffect(anchors) { state.drag.updateAnchors(anchors, state.drag.targetValue) }
        val scroll = remember(state) { SheetScroll(state) }
        // The sheet felt as it settles at a stop it was not at before.
        val haptics = rememberHaptics()
        LaunchedEffect(state) {
            snapshotFlow { state.drag.settledValue }.drop(1).collect { haptics.tap(WingtipHaptic.DETENT) }
        }

        body(peek)

        // Back lowers the sheet one stop; the sheet follows a third of the
        // way while the gesture is held, the rest when it is let go.
        PredictiveBackHandler(enabled = state.stop != SheetStop.PILL) { progress ->
            val from = state.drag.currentValue
            val to = from.lower() ?: return@PredictiveBackHandler
            val fromPx = anchors.positionOf(from)
            val toPx = anchors.positionOf(to)
            try {
                progress.collect { event ->
                    val want = fromPx + (toPx - fromPx) * event.progress / 3
                    state.drag.dispatchRawDelta(want - state.drag.offset)
                }
                scope.launch { state.moveTo(to) }
            } catch (e: CancellationException) {
                scope.launch { state.moveTo(from) }
                throw e
            }
        }

        val offset = state.drag.offset.takeUnless { it.isNaN() } ?: pillAt
        Surface(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset { IntOffset(0, offset.roundToInt()) }
                .fillMaxWidth()
                .height(with(density) { (height - fullAt).toDp() })
                .nestedScroll(scroll)
                .anchoredDraggable(
                    state = state.drag,
                    reverseDirection = false,
                    orientation = Orientation.Vertical,
                    flingBehavior = AnchoredDraggableDefaults.flingBehavior(state.drag, animationSpec = SheetMotion),
                ),
            shape = RoundedCornerShape(topStart = SheetCorner, topEnd = SheetCorner),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = BottomSheetDefaults.Elevation,
        ) {
            Column(Modifier.fillMaxWidth()) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { BottomSheetDefaults.DragHandle() }
                sheet()
            }
        }
    }
}

/** Material's sheet corner, the extra-large shape's (28 dp, the tokens'
 *  dialog radius). */
private val SheetCorner = app.wingtipmaps.android.design.generated.WingtipRadius.Dialog
