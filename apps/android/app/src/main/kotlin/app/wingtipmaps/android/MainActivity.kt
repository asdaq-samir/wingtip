package app.wingtipmaps.android

import android.app.assist.AssistContent
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import app.wingtipmaps.android.ai.ScreenContext
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.ui.RootScreen
import app.wingtipmaps.android.ui.WingtipTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * The one activity: the map under the sheet (RootScreen), drawn edge to
 * edge under the status and navigation bars as a map app is. A link that
 * opened the app -- at launch, or while it is open (onNewIntent, the
 * manifest's singleTask) -- is read by Links: the sign-in link is the
 * session's; a route or a field is handed to the screens. Hilt's entry
 * point (AndroidEntryPoint), so hiltViewModel makes the screens' models.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val session: Session by viewModels()

    /** A link for the screens, until RootScreen has taken it. */
    private val pending = MutableStateFlow<Links.Link?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch's splash screen, the same from Android 8 on (the
        // manifest's Theme.WingtipMaps.Starting), gone as the first frame draws.
        installSplashScreen()
        // Edge to edge, the bars see-through (Activity 1.14 hands this to
        // core's WindowCompat, its own enableEdgeToEdge deprecated).
        WindowCompat.enableEdgeToEdge(window)
        super.onCreate(savedInstanceState)
        setContent {
            WingtipTheme {
                RootScreen(pending = pending, onHandled = { pending.value = null })
            }
        }
        // The launch's own link once: a rotation recreates the activity
        // with the same intent, and the route is not planned again for it.
        if (savedInstanceState == null) open(intent)
    }

    /** What is on the screen for Gemini's "ask about this screen" and the
     *  system's assistants: the route planned (ScreenContext). */
    override fun onProvideAssistContent(outContent: AssistContent) {
        super.onProvideAssistContent(outContent)
        ScreenContext.fill(outContent, KeptPlan(application).read())
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        open(intent)
    }

    private fun open(intent: Intent?) {
        val data = intent?.data ?: return
        when (val link = Links.parse(data.toString())) {
            is Links.SignIn -> session.open(data)
            is Links.Route, is Links.Place, is Links.Open, is Links.Shared -> pending.value = link
            null -> {}
        }
    }
}
