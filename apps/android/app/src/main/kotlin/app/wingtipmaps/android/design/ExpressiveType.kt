package app.wingtipmaps.android.design

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight

/*
 * Material 3 Expressive's emphasized type roles: a role a weight heavier
 * for what leads a screen -- a figure glanced at in flight, the choice
 * made in a group. The BOM's Material 3 (1.4) keeps its own emphasized
 * roles internal, so they are the tokens' roles (WingtipTypography) with
 * the weight raised, the size and the line height kept.
 */

/** A figure's emphasized role: the strip's and the instruments'. */
val Typography.titleMediumEmphasized: TextStyle get() = titleMedium.copy(fontWeight = FontWeight.Bold)

/** A title's emphasized role. */
val Typography.titleLargeEmphasized: TextStyle get() = titleLarge.copy(fontWeight = FontWeight.Bold)

/** A control's emphasized label: the choice made. */
val Typography.labelLargeEmphasized: TextStyle get() = labelLarge.copy(fontWeight = FontWeight.Bold)
