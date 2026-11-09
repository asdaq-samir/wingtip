// Material 3 1.5.0-rc01 still marks its loading indicator experimental,
// the one Expressive part it does; the owner chose rc01 over our own copy
// (2026-11-09), so the opt-in is taken here, for this file alone.
@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package app.wingtipmaps.android.design

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LoadingIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import app.wingtipmaps.android.R

/**
 * Something being fetched where no skeleton stands in for it (a button's
 * work, a page's first answer): Material 3 Expressive's own loading
 * indicator, in the tint, sized by `modifier`. Under Remove animations it
 * is the same indicator held at its first shape (its determinate form at
 * nought), since the stock one still steps through its shapes on a timer
 * when the system's animator scale is 0. TalkBack reads "Loading", an
 * indeterminate progress bar, either way.
 */
@Composable
fun Loading(modifier: Modifier = Modifier) {
    val loading = stringResource(R.string.loading)
    Box(
        modifier.clearAndSetSemantics {
            contentDescription = loading
            progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
        },
    ) {
        if (rememberReduceMotion()) LoadingIndicator(progress = { 0f }) else LoadingIndicator()
    }
}
