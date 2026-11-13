package app.wingtipmaps.android.airplane

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.addAircraft
import app.wingtipmaps.android.api.aircraft
import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import app.wingtipmaps.android.api.saveFigures
import app.wingtipmaps.android.api.updateAircraft
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The account's airplanes (the gateway's /api/aircraft), a fake in the tests. */
interface OwnRemote {
    /** The pilot's airplanes; null signed out. */
    suspend fun list(): List<AircraftDto>?
    suspend fun add(request: AircraftRequest): AircraftDto
    suspend fun update(id: Long, request: AircraftRequest): AircraftDto
    suspend fun figures(id: Long, figures: OwnFigures): AircraftDto
}

object GatewayOwnRemote : OwnRemote {
    override suspend fun list() = Gateway.aircraft()
    override suspend fun add(request: AircraftRequest) = Gateway.addAircraft(request)
    override suspend fun update(id: Long, request: AircraftRequest) = Gateway.updateAircraft(id, request)
    override suspend fun figures(id: Long, figures: OwnFigures) = Gateway.saveFigures(id, figures)
}

/**
 * The pilot's own airplanes and their figures, one place for every
 * screen: on the account signed in, on this phone signed out (OwnStore),
 * the phone's offered to the account at sign-in (`offer`). An airplane
 * signed in but without the cruise speed and burn the account's record
 * requires, or without an N-number, stays on the phone until it has them.
 * The gateway works no figure out; it keeps them.
 */
class OwnAirplanes(private val store: OwnStore, private val remote: OwnRemote = GatewayOwnRemote) : OwnSaving {
    private val _records = MutableStateFlow(store.all())
    val records: StateFlow<Map<String, OwnRecord>> = _records.asStateFlow()

    private val _signedIn = MutableStateFlow(false)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    /** The phone's airplanes the account could keep, asked once a session. */
    private val _offer = MutableStateFlow<List<OwnRecord>>(emptyList())
    val offer: StateFlow<List<OwnRecord>> = _offer.asStateFlow()
    private var offered = false
    private var fetched: List<AircraftDto> = emptyList()

    /** Asked again at launch and at every sign-in or out. A gateway out of
     *  reach leaves what is known as it was. */
    suspend fun refresh() {
        val list = runCatching { remote.list() }.getOrElse { return }
        fetched = list.orEmpty()
        _signedIn.value = list != null
        val phone = store.all()
        val account = fetched.map(OwnRecord::of).associateBy { it.key }
        _records.value = phone + account
        _offer.value = if (list != null && !offered) phone.values.filter { it.tail != null && it.key !in account } else emptyList()
    }

    /** `changes` saved over `base` (its record, or a new one for the
     *  N-number carrying the book's cruise and burn): to the account
     *  where it can keep it, else on the phone. The inline ask's single
     *  figure goes to PUT …/figures where that is all it is. */
    override suspend fun save(base: OwnRecord, changes: Map<String, Double?>) {
        val next = base.with(changes)
        val was = base.id?.let { id -> fetched.firstOrNull { it.id == id } }
        val onlyOwn = changes.isNotEmpty() && changes.values.none { it == null } && changes.keys.all { FigureKey.of(it)?.top == false }
        val request = OwnRecord.request(next, was)
        if (!_signedIn.value || request == null) {
            store.put(next)
            _records.value = _records.value + (next.key to next)
            return
        }
        when {
            base.id != null && onlyOwn -> remote.figures(base.id, OwnRecord.ownFigures(changes))
            base.id != null -> remote.update(base.id, request)
            else -> remote.add(request)
        }
        store.remove(next.key)
        refresh()
    }

    /** A figure back to the type's book figure: the pilot's taken away,
     *  or, for the cruise and burn the account's record cannot be without,
     *  set to the book's (the engine reads one equal to the book's as the
     *  book's). */
    override suspend fun reset(base: OwnRecord, key: String, book: Double?) {
        val required = key == FigureKey.CRUISE.key || key == FigureKey.BURN.key
        save(base, mapOf(key to if (required && base.id != null) book else null))
    }

    /** The sign-in offer taken: each of the phone's airplanes the account
     *  can keep added to it (or over its record of the same N-number). */
    suspend fun keepOnAccount() {
        offered = true
        val phone = _offer.value
        _offer.value = emptyList()
        phone.forEach { r ->
            val base = account(r.key)?.let(OwnRecord::of) ?: OwnRecord(tail = r.tail, type = r.type)
            save(base, r.figures)
        }
    }

    fun notNow() {
        offered = true
        _offer.value = emptyList()
    }

    /** What the phone keeps of the pilot's airplanes gone, and what it
     *  knew of the account's: signed out, or the account deleted. */
    fun forget() {
        store.clear()
        fetched = emptyList()
        offered = false
        _signedIn.value = false
        _offer.value = emptyList()
        _records.value = emptyMap()
    }

    private fun account(key: String): AircraftDto? = fetched.firstOrNull { OwnRecord.key(it.tailNumber, it.typeDesignator) == key }

    companion object {
        @Volatile
        private var shared: OwnAirplanes? = null

        fun of(context: Context): OwnAirplanes = shared ?: synchronized(this) {
            shared ?: run {
                val prefs = Kept.of(context, "own_airplanes")
                val records = stringPreferencesKey("records")
                OwnAirplanes(OwnStore({ prefs[records] }, { text -> prefs.edit { it[records] = text } }))
            }.also { shared = it }
        }

        /** The record that goes with the airplane flown: the N-number's
         *  (else the picked type's), where it is of the type picked or none
         *  was picked, so a record of another type never lends its figures. */
        fun applicable(records: Map<String, OwnRecord>, tail: String?, aircraft: String): OwnRecord? {
            val r = records[OwnRecord.key(tail, aircraft)] ?: return null
            return r.takeIf { aircraft.isEmpty() || r.type.isEmpty() || r.type.equals(aircraft, ignoreCase = true) }
        }
    }
}
