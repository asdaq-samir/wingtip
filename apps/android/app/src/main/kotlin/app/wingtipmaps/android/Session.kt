package app.wingtipmaps.android

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.api.deleteAccount
import app.wingtipmaps.android.checklist.ChecklistStore
import app.wingtipmaps.android.plan.KeptPlan
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Who is signed in, and the way in: the emailed link, which opens the
 * app (docs/NATIVE-ANDROID.md: Google refuses to sign in inside an app's web
 * view, and Sign in with Apple's sheet is iOS's). The gateway's session
 * cookie, kept by CookieStore, is the sign-in itself. The twin of the iOS
 * app's Session.swift, as a ViewModel with its state in flows.
 */
class Session : ViewModel() {
    private val _pilot = MutableStateFlow<Pilot?>(null)
    val pilot: StateFlow<Pilot?> = _pilot.asStateFlow()

    /** Whether the gateway has been asked once since launch. */
    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    /** A sign-in link has been asked for and the gateway took the ask. */
    private val _linkSent = MutableStateFlow(false)
    val linkSent: StateFlow<Boolean> = _linkSent.asStateFlow()

    init {
        refresh()
    }

    /** Asks the gateway who is signed in: at launch, and after any sign-in. */
    fun refresh() {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        try {
            _pilot.value = Gateway.me()
            _problem.value = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline, or the gateway down: the last answer stands, and the
            // chart is still the pilot's from its cache.
            _problem.value = e.message ?: "The gateway could not be reached."
        }
        // Whether the server's Claude features are this pilot's, asked with
        // every sign-in change: DEVELOPERS depends on who it is (ClaudeGate).
        ClaudeGate.refresh(_pilot.value?.developer == true)
        _loaded.value = true
    }

    fun requestMagicLink(email: String) {
        viewModelScope.launch {
            try {
                Gateway.requestMagicLink(email.trim())
                _problem.value = null
                _linkSent.value = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = "The link could not be sent: ${e.message}"
                _linkSent.value = false
            }
        }
    }

    /** An App Link opened in the app: the sign-in link's token is verified
     *  here; any other link is the screens' (Links, MainActivity). */
    fun open(uri: Uri) {
        val link = Links.parse(uri.toString()) as? Links.SignIn ?: return
        viewModelScope.launch {
            try {
                Gateway.verifyMagicLink(link.token)
                _linkSent.value = false
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = "The sign-in link did not work: ${e.message}"
            }
        }
    }

    /** Signing out ends the session on the gateway and forgets what the
     *  phone kept of the pilot's, their airplanes' checklists and their
     *  plan kept for the next launch (the owner's pick: sign-out clears, as
     *  the web app's useLogout does). The public aviation data kept for the
     *  air -- the fields' cards, the NOTAMs, the weather (KeptForAir) -- is
     *  not the pilot's, and stays. */
    fun signOut(context: Context) {
        val checklists = ChecklistStore.of(context.applicationContext)
        val plan = KeptPlan(context.applicationContext as Application)
        viewModelScope.launch {
            runCatching { Gateway.signOut() }
            forget(checklists)
            plan.clear()
            ClaudeGate.refresh(developer = false)
        }
    }

    /** The account being deleted: the button waits while it is. */
    private val _deleting = MutableStateFlow(false)
    val deleting: StateFlow<Boolean> = _deleting.asStateFlow()

    /** The account deleted on the gateway, which signs out every device,
     *  then this phone forgets the pilot as signing out does. Where the
     *  gateway refuses (nothing deleted), the pilot stays signed in and
     *  its words are the problem shown under the account. */
    fun deleteAccount(context: Context) {
        val checklists = ChecklistStore.of(context.applicationContext)
        val plan = KeptPlan(context.applicationContext as Application)
        viewModelScope.launch {
            _deleting.value = true
            try {
                Gateway.deleteAccount()
                _problem.value = null
                forget(checklists)
                plan.clear()
                ClaudeGate.refresh(developer = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = "The account could not be deleted: ${e.message}"
            } finally {
                _deleting.value = false
            }
        }
    }

    private fun forget(checklists: ChecklistStore) {
        _pilot.value = null
        _linkSent.value = false
        checklists.forgetAll()
    }
}
