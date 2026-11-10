package app.wingtipmaps.android.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Shape

/**
 * Whether the Native look is up (ui/Theme's WingtipTheme provides it):
 * Material as it comes out of the box, the owner's word on 2026-11-10
 * ("Native means how they come out of the box, look and behavior wise").
 * In it a part takes no Wingtip shape, type or feel of its own: each
 * place the app sets one asks here once, and in Native leaves the stock
 * component's own default.
 */
val LocalNative = staticCompositionLocalOf { false }

/** The brand's shape for a part, or in Native the stock component's own
 *  default, which the caller names as it stands in Material's defaults. */
@Composable
@ReadOnlyComposable
fun lookShape(brand: Shape, stock: Shape): Shape = if (LocalNative.current) stock else brand
