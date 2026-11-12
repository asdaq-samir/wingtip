package app.wingtipmaps.android.di

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.ai.AiWords
import app.wingtipmaps.android.aircraft.AircraftForm
import app.wingtipmaps.android.atc.AtcRules
import app.wingtipmaps.android.atc.EngineAtc
import app.wingtipmaps.android.atc.RadioListener
import app.wingtipmaps.android.clearance.ClearanceRules
import app.wingtipmaps.android.clearance.EngineClearance
import app.wingtipmaps.android.coach.CoachSource
import app.wingtipmaps.android.coach.ServerCoach
import app.wingtipmaps.android.copilot.CopilotRules
import app.wingtipmaps.android.copilot.CopilotSource
import app.wingtipmaps.android.copilot.EngineCopilot
import app.wingtipmaps.android.copilot.PlannerCopilot
import app.wingtipmaps.android.emergency.EmergencyRules
import app.wingtipmaps.android.emergency.EmergencySource
import app.wingtipmaps.android.emergency.EngineEmergency
import app.wingtipmaps.android.emergency.PlannerEmergency
import app.wingtipmaps.android.live.AreaWords
import app.wingtipmaps.android.live.EngineAreaWords
import app.wingtipmaps.android.live.EngineLive
import app.wingtipmaps.android.live.LiveRules
import app.wingtipmaps.android.live.LiveSource
import app.wingtipmaps.android.live.PlannerLive
import app.wingtipmaps.android.logbook.DraftRules
import app.wingtipmaps.android.logbook.EngineDraft
import app.wingtipmaps.android.logbook.LogbookEdits
import app.wingtipmaps.android.logbook.LogbookSource
import app.wingtipmaps.android.logbook.ServerLogbook
import app.wingtipmaps.android.logbook.ServerLogbookEdits
import app.wingtipmaps.android.ready.PlannerReadyWeather
import app.wingtipmaps.android.ready.ReadyWeather
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlin.time.Clock
import kotlin.time.Instant

/**
 * What the screens' view models are built from, beside the network
 * (NetworkModule): the app's one clock (AppClock), the radio listener,
 * and each source and rule set a view model takes, as the server's or the
 * engine's own. A test hands a view model its fakes by its constructor,
 * as before.
 */
@Module
@InstallIn(SingletonComponent::class)
object SourcesModule {
    /** The app's one wall clock: AppClock's, which a test sets. */
    @Provides
    fun clock(): Clock = object : Clock {
        override fun now(): Instant = AppClock.now()
    }

    /** The phone's on-device recognizer listened to (one in the process). */
    @Provides
    fun radio(@ApplicationContext context: Context): RadioListener = RadioListener.of(context)

    @Provides fun aiWords(): AiWords = AiWords

    @Provides fun readyWeather(): ReadyWeather = PlannerReadyWeather

    @Provides fun logbookSource(): LogbookSource = ServerLogbook

    @Provides fun logbookEdits(): LogbookEdits = ServerLogbookEdits

    @Provides fun draftRules(): DraftRules = EngineDraft

    @Provides fun clearanceRules(): ClearanceRules = EngineClearance

    @Provides fun copilotSource(): CopilotSource = PlannerCopilot

    @Provides fun copilotRules(): CopilotRules = EngineCopilot

    @Provides fun atcRules(): AtcRules = EngineAtc

    @Provides fun liveSource(): LiveSource = PlannerLive

    @Provides fun liveRules(): LiveRules = EngineLive

    @Provides fun areaWords(): AreaWords = EngineAreaWords

    @Provides fun emergencySource(): EmergencySource = PlannerEmergency

    @Provides fun emergencyRules(): EmergencyRules = EngineEmergency

    @Provides fun coachSource(): CoachSource = ServerCoach

    @Provides fun aircraftRules(): AircraftForm.Rules = AircraftForm.EngineRules
}
