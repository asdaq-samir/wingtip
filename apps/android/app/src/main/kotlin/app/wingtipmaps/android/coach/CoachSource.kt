package app.wingtipmaps.android.coach

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.coach
import app.wingtipmaps.android.api.coachWords
import app.wingtipmaps.android.api.currency
import app.wingtipmaps.android.api.generated.CoachAsk
import app.wingtipmaps.android.api.generated.CoachDebrief
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.api.generated.assistant.CoachWordsAnswer
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.TrainingDto
import app.wingtipmaps.android.api.logbook
import app.wingtipmaps.android.api.training
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

/** The Coach's servers: what the gateway keeps of the pilot, the
 *  planner's plan and the assistant's words; a fake in the tests. */
interface CoachSource {
    suspend fun entries(): List<LogbookEntryDto>?
    suspend fun currency(): CurrencyDto?
    suspend fun training(): TrainingDto?
    suspend fun home(): String?
    suspend fun plan(ask: CoachAsk): ProficiencyPlan
    suspend fun words(plan: ProficiencyPlan): CoachWordsAnswer
    /** Whether the words may be asked for at all: they are Claude's. */
    fun wordsOffered(): Boolean = true
    /** The saved flights' debriefs (CoachDebriefs); none by default. */
    suspend fun debriefs(): List<CoachDebrief> = emptyList()
}

object ServerCoach : CoachSource {
    override suspend fun entries() = Gateway.logbook()
    override suspend fun currency() = Gateway.currency()
    override suspend fun training() = Gateway.training()
    override suspend fun home() = Gateway.me()?.homeBase
    override suspend fun plan(ask: CoachAsk) = Planner.coach(ask)
    override suspend fun words(plan: ProficiencyPlan) = Planner.coachWords(plan)
    override fun wordsOffered() = ClaudeGate.on.value
    override suspend fun debriefs() = CoachDebriefs.fetch()
}

/** The certificate the pilot picked, kept on this phone as the web keeps
 *  it in the browser ("wingtip.coach.certificate"); a fake in the tests. */
interface CertificateKeeper {
    fun read(): Certificate?
    fun keep(certificate: Certificate)
}

class CertificatePreference(private val prefs: Kept) : CertificateKeeper {
    /** The app's "wingtip" store's, for Hilt. */
    @Inject constructor(@ApplicationContext context: Context) : this(Kept.of(context, "wingtip"))

    override fun read(): Certificate? = Certificate.of(prefs[KEY])
    override fun keep(certificate: Certificate) = prefs.edit { it[KEY] = certificate.wire }

    companion object {
        private val KEY = stringPreferencesKey("coach.certificate")

        fun of(context: Context) = CertificatePreference(context)
    }
}
