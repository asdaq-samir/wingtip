package app.wingtipmaps.android

import android.app.assist.AssistContent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.content.IntentCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import app.wingtipmaps.android.ai.ScreenContext
import app.wingtipmaps.android.library.DocPlace
import app.wingtipmaps.android.library.OwnShelf
import app.wingtipmaps.android.library.OwnShelf.Companion.addFrom
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.ui.RootScreen
import app.wingtipmaps.android.ui.WingtipTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/** What another app shares or opens for the documents library. */
private const val PDF = "application/pdf"

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
        shared(intent)?.let { pdf ->
            keep(pdf)
            return
        }
        val data = intent?.data ?: return
        when (val link = Links.parse(data.toString())) {
            is Links.SignIn -> session.open(data)
            is Links.Route, is Links.Place, is Links.Open, is Links.Shared, is Links.Doc -> pending.value = link
            null -> {}
        }
    }

    /** A PDF another app shared (Send) or opened with Wingtip (View): the
     *  manifest's application/pdf filters. */
    private fun shared(intent: Intent?): Uri? = when (intent?.action) {
        Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        Intent.ACTION_VIEW -> intent.data?.takeIf { intent.type == PDF || it.scheme == "content" && contentResolver.getType(it) == PDF }
        else -> null
    }?.takeIf { it.scheme == "content" }

    /** The PDF kept among the pilot's own documents, on this phone only,
     *  and opened in the reader; one that is not a PDF is said there. */
    private fun keep(pdf: Uri) {
        lifecycleScope.launch {
            runCatching { OwnShelf.of(this@MainActivity).addFrom(this@MainActivity, pdf) }
                .onSuccess { pending.value = Links.Doc(DocPlace.own(it.id).text) }
                .onFailure { pending.value = Links.Open(Screen.DOCUMENTS) }
        }
    }
}
