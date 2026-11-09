package app.wingtipmaps.android.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.core.net.toUri
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.components.FilledButton
import androidx.glance.appwidget.components.Scaffold
import androidx.glance.appwidget.components.TitleBar
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import app.wingtipmaps.android.MainActivity
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.generated.WingtipTypography
import app.wingtipmaps.android.ui.materialScheme

/** The brand's colours by day and by night, never the wallpaper's. */
private val WingtipWidgetColors = ColorProviders(
    light = WingtipPalettes.Light.materialScheme(dark = false),
    dark = WingtipPalettes.Dark.materialScheme(dark = true),
)

/** The widget's two sizes: a small square, and the wide one with room
 *  for the departure time and a way into the nav log. */
private val Small = DpSize(WingtipSize.Panel / 3, WingtipSize.Panel / 3)
private val Wide = DpSize(WingtipSize.Panel * 2 / 3, WingtipSize.Panel / 3)

/**
 * Next Flight on the home screen (Glance, Android's way to put an app's
 * one fact on the launcher), the twin of the iPhone's FlightWidget: the
 * route, the nav log's distance, time and fuel, when it leaves and when
 * this was last planned, from the snapshot the app keeps (FlightSnapshot,
 * NextFlightFeed); it never asks the planner. Material 3 Expressive's
 * widget scaffold and title bar with the Wingtip mark, in the Wingtip
 * theme's colours; a tap opens the app, the wide one's button its nav log.
 */
class NextFlightWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(Small, Wide))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val flight = FlightSnapshot.read(context)
        val words = WidgetWords(
            title = context.getString(R.string.widget_next_flight),
            none = context.getString(R.string.widget_no_flight),
            planOne = context.getString(R.string.widget_plan_one),
            navLog = context.getString(R.string.widget_nav_log),
        )
        provideContent {
            GlanceTheme(colors = WingtipWidgetColors) { NextFlight(flight, words) }
        }
    }
}

/** The nav log by the app's own link (Links, design/screens.json). */
private const val NAV_LOG = "wingtipmaps://plan?open=navlog"

/** The widget's words, read from the resources before it is drawn. */
private data class WidgetWords(val title: String, val none: String, val planOne: String, val navLog: String)

@Composable
private fun NextFlight(flight: FlightSnapshot?, words: WidgetWords) {
    val context = LocalContext.current
    val open = actionStartActivity(Intent(context, MainActivity::class.java))
    Scaffold(
        titleBar = { TitleBar(startIcon = ImageProvider(R.drawable.ic_stat_wingtip), title = words.title, iconColor = GlanceTheme.colors.primary) },
        modifier = GlanceModifier.fillMaxSize().clickable(open),
    ) {
        Column(GlanceModifier.fillMaxSize()) {
            val type = WingtipTypography
            if (flight == null) {
                Text(words.none, style = TextStyle(fontSize = type.titleMedium.fontSize, fontWeight = FontWeight.Bold, color = GlanceTheme.colors.onSurface))
                Text(words.planOne, style = TextStyle(fontSize = type.bodyMedium.fontSize, color = GlanceTheme.colors.onSurfaceVariant))
                return@Column
            }
            Text(flight.route, maxLines = 1, style = TextStyle(fontSize = type.titleMedium.fontSize, fontWeight = FontWeight.Bold, color = GlanceTheme.colors.onSurface))
            Text(flight.figures, maxLines = 1, style = TextStyle(fontSize = type.bodyMedium.fontSize, color = GlanceTheme.colors.onSurfaceVariant))
            val wide = LocalSize.current.width >= Wide.width
            if (wide) flight.leaves?.let { Text(it, maxLines = 1, style = TextStyle(fontSize = type.bodyMedium.fontSize, color = GlanceTheme.colors.onSurfaceVariant)) }
            Text(flight.asOf, maxLines = 1, style = TextStyle(fontSize = type.labelMedium.fontSize, color = GlanceTheme.colors.onSurfaceVariant))
            if (wide) {
                Spacer(GlanceModifier.height(WingtipSpace.Sm))
                FilledButton(text = words.navLog, onClick = actionStartActivity(Intent(Intent.ACTION_VIEW, NAV_LOG.toUri(), context, MainActivity::class.java)))
            }
        }
    }
}

/** The widget's receiver, which Android's launcher talks to. */
class NextFlightReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextFlightWidget()
}
