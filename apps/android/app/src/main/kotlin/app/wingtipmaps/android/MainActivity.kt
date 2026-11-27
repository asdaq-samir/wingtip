package app.wingtipmaps.android

import android.app.assist.AssistContent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.KeyboardShortcutInfo
import android.view.Menu
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
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.Shortcut
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.route.redoEdit
import app.wingtipmaps.android.route.undoEdit
import app.wingtipmaps.android.share.FileProblem
import app.wingtipmaps.android.share.FlightFiles
import app.wingtipmaps.android.ui.Appearance
import app.wingtipmaps.android.ui.AppearancePreference
import app.wingtipmaps.android.ui.FileTaker
import app.wingtipmaps.android.ui.NightMode
import app.wingtipmaps.android.ui.RootScreen
import app.wingtipmaps.android.ui.WingtipTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/**
 * The one activity: the map under the sheet (RootScreen), drawn edge to
 * edge under the status and navigation bars as a map app is. A link that
 * opened the app -- at launch, or while it is open (onNewIntent, the
 * manifest's singleTask) -- is read by Links: the sign-in link is the
 * session's; a route or a field is handed to the screens. Hilt's entry
 * point (AndroidEntryPoint), so hiltViewModel makes the screens' models.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity(), FileTaker {
    private val session: Session by viewModels()

    /** The one plan the screens share (RootScreen's hiltViewModel is this
     *  activity's), for the keyboard's Undo and Redo. */
    private val plan: Plan by viewModels()

    /** A link for the screens, until RootScreen has taken it. */
    private val pending = MutableStateFlow<Links.Link?>(null)

    /** Why a file handed to the app was not taken, until it is read. */
    private val problem = MutableStateFlow<String?>(null)

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(newBase)
        // The app's Light or Dark in the window's theme before Android 12 (NightMode.override).
        NightMode.override(newBase)?.let(::applyOverrideConfiguration)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch's splash screen, the same from Android 8 on (the
        // manifest's Theme.WingtipMaps.Starting), gone as the first frame draws.
        installSplashScreen()
        // Edge to edge, the bars see-through (Activity 1.14 hands this to
        // core's WindowCompat, its own enableEdgeToEdge deprecated).
        WindowCompat.enableEdgeToEdge(window)
        super.onCreate(savedInstanceState)
        // The app's own Light or Dark to the system, so the next launch's
        // window is in it (NightMode, Android 12 and later).
        NightMode.apply(this, AppearancePreference.flow(this).value ?: Appearance.SYSTEM)
        setContent {
            WingtipTheme {
                RootScreen(pending = pending, onHandled = { pending.value = null }, onLink = { pending.value = it })
                FileProblem(problem)
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

    /** A key pressed with Ctrl that no view took (a text field keeps its
     *  own Ctrl+Z): the app's shortcut, if it is one (Shortcut). */
    override fun onKeyShortcut(keyCode: Int, event: KeyEvent): Boolean {
        val shortcut = Shortcut.of(keyCode, event.isCtrlPressed, event.isShiftPressed, event.isAltPressed || event.isMetaPressed)
            ?: return super.onKeyShortcut(keyCode, event)
        when (shortcut) {
            Shortcut.UNDO -> plan.undoEdit()
            Shortcut.REDO -> plan.redoEdit()
            else -> shortcut.screen?.let(ScreenRequests::ask)
        }
        return true
    }

    /** Esc no view took: the system turns it into Back (its fallback key),
     *  which closes a card, a sheet or a page; with nothing to close it is
     *  kept here, so Esc never sends the app away (Android's Tier 2
     *  Keyboard_Exit: Esc closes or cancels). */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_ESCAPE && !onBackPressedDispatcher.hasEnabledCallbacks()) return true
        return super.onKeyDown(keyCode, event)
    }

    /** The shortcuts, listed in the system's Keyboard Shortcuts Helper
     *  (Meta+/), Esc's Close last. */
    override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>?, menu: Menu?, deviceId: Int) {
        super.onProvideKeyboardShortcuts(data, menu, deviceId)
        val items = Shortcut.entries.map { KeyboardShortcutInfo(getString(it.label), it.key, it.meta) } +
            KeyboardShortcutInfo(getString(R.string.close), KeyEvent.KEYCODE_ESCAPE, 0)
        data?.add(KeyboardShortcutGroup(getString(R.string.app_name), items))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        open(intent)
    }

    private fun open(intent: Intent?) {
        handed(intent)?.let { file ->
            take(file, intent?.type)
            return
        }
        val data = intent?.data ?: return
        when (val link = Links.parse(data.toString())) {
            is Links.SignIn -> session.open(data)
            is Links.Place, is Links.Open, is Links.Shared, is Links.Doc -> pending.value = link
            null -> {}
        }
    }

    /** A file another app shared (Send) or opened with Wingtip (View): the
     *  manifest's PDF, GPX and flight-plan filters. A link is no file. */
    private fun handed(intent: Intent?): Uri? = when (intent?.action) {
        Intent.ACTION_SEND -> IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
        Intent.ACTION_VIEW -> intent.data
        else -> null
    }?.takeIf { it.scheme == "content" }

    /** A file handed over, opened, shared or dropped on the window
     *  (WindowDrop), taken for what it is (FlightFiles): a PDF among the
     *  pilot's own documents, a route in the shared flight's preview, and
     *  otherwise why not, said over the map. */
    override fun take(uri: Uri, type: String?) {
        val kind = FlightFiles.kind(FlightFiles.name(contentResolver, uri), type ?: contentResolver.getType(uri))
        when (kind) {
            FlightFiles.Kind.PDF -> keep(uri)
            FlightFiles.Kind.ROUTE -> lifecycleScope.launch {
                FlightFiles.readRoute(contentResolver, uri)
                    .onSuccess { route ->
                        pending.value = route.link
                        if (route.dropped > 0) problem.value = resources.getQuantityString(R.plurals.route_file_dropped, route.dropped, route.dropped)
                    }
                    .onFailure { problem.value = (it as? IllegalArgumentException)?.message ?: getString(R.string.route_file_unreadable) }
            }
            null -> problem.value = getString(R.string.route_file_unreadable)
        }
    }

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
