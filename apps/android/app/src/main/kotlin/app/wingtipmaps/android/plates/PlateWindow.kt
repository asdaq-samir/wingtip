package app.wingtipmaps.android.plates

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.ui.WingtipTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * A plate in a window of its own beside the map, as the iPad's chart
 * window is (PictureWindow): from the viewer's Open in New Window on a
 * tablet, a foldable or a desktop window, the system puts it beside the
 * app (FLAG_ACTIVITY_LAUNCH_ADJACENT, Android's multi-window guide) in a
 * task of its own, so the pilot keeps the plate up while the map and
 * the cards go on. Its own ship and ink are the app's (the one flight,
 * PlateInk), so a mark made in one window is there in the other once it
 * opens again. Links, files and shortcuts go to the app's window
 * (MainActivity), never a plate's: this activity has no intent filter.
 */
@AndroidEntryPoint
class PlateWindowActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        WindowCompat.enableEdgeToEdge(window)
        super.onCreate(savedInstanceState)
        val plate = PlateWindow.read(intent) ?: return finish()
        setContent {
            WingtipTheme {
                PlateViewer(plate.title, plate.url, plate.georeference, onClose = ::finish, inWindow = true)
            }
        }
    }
}

/** What a plate's window is asked for, carried in its intent's extras. */
data class PlateWindow(val title: String, val url: String, val georeference: PlateGeoreference?) {
    companion object {
        private const val TITLE = "plate.title"
        private const val URL = "plate.url"
        private const val GEOREFERENCE = "plate.georeference"

        /** The intent that opens `plate` beside the app, a window each time. */
        fun intent(context: Context, plate: PlateWindow): Intent = Intent(context, PlateWindowActivity::class.java)
            .putExtra(TITLE, plate.title)
            .putExtra(URL, plate.url)
            .putExtra(GEOREFERENCE, plate.georeference?.let { Gateway.json.encodeToString(PlateGeoreference.serializer(), it) })
            .addFlags(Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT or Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_MULTIPLE_TASK)

        /** The plate an intent asks for; none without its address. */
        fun read(intent: Intent?): PlateWindow? {
            val url = intent?.getStringExtra(URL)?.takeIf { it.startsWith("https://") } ?: return null
            val georeference = intent.getStringExtra(GEOREFERENCE)?.let { runCatching { Gateway.json.decodeFromString(PlateGeoreference.serializer(), it) }.getOrNull() }
            return PlateWindow(intent.getStringExtra(TITLE).orEmpty(), url, georeference)
        }
    }
}
