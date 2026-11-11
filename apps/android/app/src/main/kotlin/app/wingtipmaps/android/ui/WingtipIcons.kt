package app.wingtipmaps.android.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.AddLocation
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CellTower
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Square
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.outlined.CropSquare
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.NearMe
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * The shared concept table's glyphs (docs/design/icons.md), Android's
 * column: one Material Symbol per concept, so a screen asks for the
 * concept -- close, share, Direct To -- never a glyph's name, and the
 * same thing has the same shape on the web, the iPhone and here.
 */
object WingtipIcons {
    val close = Icons.Filled.Close

    /** A card's ← in the bar that takes the search's place: back one level. */
    val back = Icons.AutoMirrored.Filled.ArrowBack

    val share = Icons.Filled.Share
    val more = Icons.Filled.MoreVert

    /** The map's position button: the arrow outlined while off, filled
     *  while it reads or follows, so the state is in the shape as well as
     *  the colour. */
    val myLocationOff = Icons.Outlined.NearMe
    val myLocation = Icons.Filled.NearMe
    val brief = Icons.Filled.AutoAwesome

    /** Words made by AI (In Plain Words, Ask on the phone): the sparkle
     *  Material and Gemini both mark AI with. */
    val ai = Icons.Filled.AutoAwesome
    val navLog = Icons.Filled.FormatListNumbered
    val profile = Icons.AutoMirrored.Filled.ShowChart
    val mapLayers = Icons.Filled.Layers
    val flightPlan = Icons.Filled.Route
    val nearest = Icons.Filled.MyLocation
    val addToRoute = Icons.Filled.AddLocation
    val holdHere = Icons.Filled.Sync
    val undo = Icons.AutoMirrored.Filled.Undo
    val redo = Icons.AutoMirrored.Filled.Redo
    val call = Icons.Filled.Call
    val address = Icons.Filled.Place
    val copy = Icons.Filled.ContentCopy
    val send = Icons.AutoMirrored.Filled.Send
    /** A stream given up (the trip planner's Stop). */
    val stop = Icons.Filled.Stop
    /** The radio listened to (atc/RadioListener): a mast with its waves
     *  either side, Material's match for iOS's
     *  antenna.radiowaves.left.and.right, never the mic, which is Ask by
     *  voice's (the owner, 2026-11-10). */
    val radio = Icons.Filled.CellTower
    val airplane = Icons.Filled.Flight
    val setup = Icons.Filled.Settings

    /** An approach plate laid on the map (an airport card's approach's
     *  Show on Map), and the plate card's transparency slider's ends: an
     *  empty square for clear, a solid one for solid, as ForeFlight's. */
    val showOnMap = Icons.Outlined.Map
    val plateClear = Icons.Outlined.CropSquare
    val plateSolid = Icons.Filled.Square

    /** Fly Here, a new route to the field: the route's own glyph. */
    val flyHere = Icons.Filled.Route
    val departFrom = Icons.Filled.FlightTakeoff

    /**
     * Direct To, drawn as the chart's and the avionics' D-arrow: a D with
     * an arrow through it, left to right (the web's DirectToIcon), on
     * Material's 24-point grid with a 2-point line.
     */
    val directTo: ImageVector by lazy {
        ImageVector.Builder(name = "DirectTo", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f).apply {
            val line = SolidColor(Color.Black)
            // The D.
            path(stroke = line, strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(9f, 5f)
                lineTo(9f, 19f)
                moveTo(9f, 5f)
                horizontalLineTo(12f)
                arcTo(7f, 7f, 0f, isMoreThanHalf = false, isPositiveArc = true, x1 = 12f, y1 = 19f)
                horizontalLineTo(9f)
            }
            // The arrow through it.
            path(stroke = line, strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round) {
                moveTo(2f, 12f)
                horizontalLineTo(22f)
                moveTo(18f, 8f)
                lineTo(22f, 12f)
                lineTo(18f, 16f)
            }
        }.build()
    }
}
