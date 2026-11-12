package app.wingtipmaps.android.atc

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The ATC copilot's one view model (the web's useAtcCopilot, the
 * iPhone's AtcCopilot): while flying, with the pilot's leave, the radio
 * listened to on and on (AtcListener); each call to us read by the engine
 * into a card of its items (atc_call, with the call before it carried so
 * a readback with no call sign is known for ours), our readback checked
 * against it (readback_check, AIM 4-4-7 b). Nothing is set until a tap:
 * the pilot decides (14 CFR 91.3; decision 0008, warn never limit).
 */
@HiltViewModel(assistedFactory = AtcCopilotModel.Factory::class)
class AtcCopilotModel @AssistedInject constructor(
    @Assisted private val listener: AtcListener,
    private val rules: AtcRules = EngineAtc,
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(listener: AtcListener): AtcCopilotModel
    }

    /** The next frequency and the code the pilot set from a card, kept in
     *  sight on the card's foot until replaced. */
    data class Kept(val frequency: String? = null, val facility: String? = null, val squawk: String? = null)

    data class State(
        val on: Boolean = false,
        val cards: List<AtcCard> = emptyList(),
        /** Flying with the copilot on and no registration to listen for:
         *  no airplane is ever assumed (decision 0011). */
        val noTail: Boolean = false,
        /** Why the last tap could not do what it asked. */
        val problem: String? = null,
        val kept: Kept = Kept(),
    ) {
        val card: AtcCard? get() = if (on) AtcCards.shown(cards) else null
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    val listening: StateFlow<Boolean> get() = listener.listening
    val error: StateFlow<String?> get() = listener.error
    /** What the radio says as it is heard, for the listening capsule. */
    val heard: StateFlow<List<Heard>> get() = listener.heard

    private var tail: String? = null
    private var started = false
    /** The transmissions already read, by id, with the words read. */
    private val read = mutableMapOf<Int, String>()

    init {
        viewModelScope.launch { listener.heard.collect(::onHeard) }
    }

    /**
     * Listening starts as the flight does and stops with it, where the
     * copilot started it; a listening the pilot started is theirs.
     */
    fun follow(mode: AtcMode, flying: Boolean, tail: String?) {
        val name = tail?.trim()?.uppercase()?.ifEmpty { null }
        this.tail = name
        val on = mode == AtcMode.FLYING
        _state.update { it.copy(on = on, noTail = on && flying && name == null) }
        val auto = on && flying && name != null
        if (auto && !started && !listener.listening.value) {
            started = true
            listener.start()
        } else if (!auto && started) {
            started = false
            listener.stop()
        }
    }

    /** The listening capsule's Stop: the radio let go until the pilot
     *  taps Listen again or the flight starts anew. */
    fun stop() {
        listener.stop()
    }

    /** The Listen tap, where listening did not start by itself (the
     *  microphone was allowed only now). */
    fun listen() {
        started = true
        listener.start()
    }

    private fun onHeard(heard: List<Heard>) {
        if (!_state.value.on) return
        for (t in heard) {
            if (!t.final || read[t.id] == t.text) continue
            read[t.id] = t.text
            _state.update { it.copy(cards = AtcCards.heardInto(it.cards, t, tail, rules)) }
        }
    }

    /** A tap on an item's chip: Direct To through `direct` (the plan's,
     *  which answers why not where it cannot), the frequency or the code
     *  kept in sight. */
    fun act(index: Int, direct: (String) -> String?) {
        val card = _state.value.card ?: return
        val item = card.items.getOrNull(index) ?: return
        _state.update { it.copy(problem = null) }
        when (AtcWords.actionOf(item)) {
            ItemAction.DIRECT -> direct(item.said.orEmpty().uppercase())?.let { why ->
                _state.update { it.copy(problem = why) }
                return
            }
            ItemAction.FREQUENCY -> _state.update { it.copy(kept = it.kept.copy(frequency = item.mhz, facility = item.facility)) }
            ItemAction.SQUAWK -> _state.update { it.copy(kept = it.kept.copy(squawk = item.code)) }
            null -> return
        }
        change(card.id) { it.copy(set = it.set + index) }
    }

    /** Read Back: listening already, the next transmission is it; else
     *  the microphone listens once, from this tap. */
    fun readBack() {
        val card = _state.value.card ?: return
        change(card.id) { it.copy(awaiting = true, readback = null) }
        if (listener.listening.value) return
        viewModelScope.launch {
            val said = listener.once()
            val now = _state.value.cards.firstOrNull { it.id == card.id } ?: return@launch
            change(card.id) { if (said.isNullOrBlank()) now.copy(awaiting = false) else AtcCards.readBack(now, said, tail, rules) }
        }
    }

    /** ✕: the card put away; the next call to us shows its own. */
    fun dismiss() {
        val card = _state.value.card ?: return
        change(card.id) { it.copy(dismissed = true) }
        _state.update { it.copy(problem = null) }
    }

    private fun change(id: Int, how: (AtcCard) -> AtcCard) =
        _state.update { s -> s.copy(cards = s.cards.map { if (it.id == id) how(it) else it }) }

    override fun onCleared() {
        if (started) listener.stop()
    }
}
