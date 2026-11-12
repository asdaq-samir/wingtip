package app.wingtipmaps.android

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.account.PhoneWipe
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.deleteAccount
import app.wingtipmaps.android.api.setContact
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.HomeAirport
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
class Session(app: Application) : AndroidViewModel(app) {
    private val _pilot = MutableStateFlow<Pilot?>(null)
    val pilot: StateFlow<Pilot?> = _pilot.asStateFlow()

    /** Whether the gateway has been asked once since launch. */
    private val _loaded = MutableStateFlow(false)
    val loaded: StateFlow<Boolean> = _loaded.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    /** Whether the problem is the account's own check failing, which Try
     *  Again asks again ([refresh]); a link or a deletion is asked again
     *  by its own button. */
    private val _checkFailed = MutableStateFlow(false)
    val checkFailed: StateFlow<Boolean> = _checkFailed.asStateFlow()

    /** A sign-in link has been asked for and the gateway took the ask. */
    private val _linkSent = MutableStateFlow(false)
    val linkSent: StateFlow<Boolean> = _linkSent.asStateFlow()

    /** A sign-in link opened and waiting for the pilot's yes (SignInDialog). */
    private val _signInAsk = MutableStateFlow<SignInAsk?>(null)
    val signInAsk: StateFlow<SignInAsk?> = _signInAsk.asStateFlow()

    /** The address this phone last asked a link for, kept so a link
     *  opened after the app was closed still names it. */
    private val asked = app.getSharedPreferences("sign_in", Context.MODE_PRIVATE)

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
            // The account's home base is the pilot's home airport on every
            // device they sign in on (HomeAirport): this phone takes it.
            HomeAirport.mirrored(_pilot.value?.homeBase, null)?.let { FlightChoices.of(getApplication()).setHome(it) }
            _problem.value = null
            _checkFailed.value = false
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Offline, or the gateway down: the last answer stands, and the
            // chart is still the pilot's from its cache.
            _problem.value = Problems.say("Your account could not be checked", e)
            _checkFailed.value = true
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
                asked.edit { putString(ASKED, email.trim()) }
                _problem.value = null
                _linkSent.value = true
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = Problems.say("The link could not be sent", e)
                _linkSent.value = false
            }
        }
    }

    /** An App Link opened in the app: a sign-in link, asked first and
     *  verified only on the pilot's yes (signIn); any other link is the
     *  screens' (Links, MainActivity). */
    fun open(uri: Uri) {
        val link = Links.parse(uri.toString()) as? Links.SignIn ?: return
        _signInAsk.value = SignInAsk(link.token, asked.getString(ASKED, null), _pilot.value?.email, checking = true)
        // Whose link it is, asked of the gateway without spending it; where
        // it cannot be reached, the question names the address asked for.
        viewModelScope.launch {
            val checked = checkLink(link.token)
            _signInAsk.value = _signInAsk.value?.takeIf { it.token == link.token }?.let(checked)
        }
    }

    /** The gateway's word on a link, as the change it makes to the ask. */
    private suspend fun checkLink(token: String): (SignInAsk) -> SignInAsk {
        try {
            val account = Gateway.magicLinkAccount(token)
            return { a -> if (account == null) a.copy(checking = false, expired = true) else a.copy(checking = false, account = account.email) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Gateway.Refusal) {
            val said = if (e.status == 429) "Too many sign-in links were checked from here. Try this one again later." else Problems.say("The sign-in link could not be checked", e)
            return { a -> a.copy(checking = false, refused = said) }
        } catch (e: Exception) {
            Problems.say("The sign-in link could not be checked", e)
            return { a -> a.copy(checking = false) }
        }
    }

    /** An expired link's offer: a new one sent to the address this phone
     *  asked for. */
    fun askAgain() {
        val address = _signInAsk.value?.address ?: return
        _signInAsk.value = null
        requestMagicLink(address)
    }

    /** The link not followed: nothing changes. */
    fun declineSignIn() {
        _signInAsk.value = null
    }

    /** The pilot's yes: where someone is signed in, that session ended
     *  and what the phone kept of it forgotten first, as signing out
     *  does, then the link's token verified. */
    fun signIn(context: Context) {
        val ask = _signInAsk.value ?: return
        _signInAsk.value = null
        val wipe = PhoneWipe.of(context)
        viewModelScope.launch {
            if (ask.current != null) {
                runCatching { Gateway.signOut() }
                forget(wipe)
            }
            try {
                Gateway.verifyMagicLink(ask.token)
                asked.edit { remove(ASKED) }
                _linkSent.value = false
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = Problems.say("The sign-in link did not work", e)
            }
        }
    }

    /** Signing out ends the session on the gateway and forgets everything
     *  the phone kept of the pilot's (PhoneWipe: records, tracks, last
     *  position, checklists, plan, cookies and the rest; the owner's pick:
     *  sign-out clears, as the web app's useLogout does). The public
     *  aviation data kept for the air -- the fields' cards, the NOTAMs, the
     *  weather (KeptForAir) -- is not the pilot's, and stays. */
    fun signOut(context: Context) {
        val wipe = PhoneWipe.of(context)
        viewModelScope.launch {
            runCatching { Gateway.signOut() }
            forget(wipe)
            ClaudeGate.refresh(developer = false)
        }
    }

    /** Why the home airport did not reach the account, shown under its row. */
    private val _homeProblem = MutableStateFlow<String?>(null)
    val homeProblem: StateFlow<String?> = _homeProblem.asStateFlow()

    /** Setup's Home Airport, picked or cleared (null): kept on this phone,
     *  and signed in, the account's home base too (PUT /api/me/contact,
     *  the phone number sent back as it is), so it follows the pilot to
     *  the web and the iPhone. */
    fun setHomeAirport(ident: String?) {
        val home = HomeAirport.mirrored(ident, null)
        FlightChoices.of(getApplication()).setHome(home)
        _homeProblem.value = null
        val pilot = _pilot.value ?: return
        viewModelScope.launch {
            try {
                _pilot.value = Gateway.setContact(pilot.phone, home)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _homeProblem.value = Problems.say(getApplication<Application>().getString(R.string.home_airport_unsaved), e)
            }
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
        val wipe = PhoneWipe.of(context)
        viewModelScope.launch {
            _deleting.value = true
            try {
                Gateway.deleteAccount()
                _problem.value = null
                forget(wipe)
                ClaudeGate.refresh(developer = false)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _problem.value = Problems.say("The account could not be deleted", e)
            } finally {
                _deleting.value = false
            }
        }
    }

    private companion object {
        const val ASKED = "asked"
    }

    private suspend fun forget(wipe: PhoneWipe) {
        _pilot.value = null
        _linkSent.value = false
        wipe.run()
    }
}
