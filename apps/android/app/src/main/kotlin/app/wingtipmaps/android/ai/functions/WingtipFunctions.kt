package app.wingtipmaps.android.ai.functions

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.appfunctions.AppFunctionDeclaration
import androidx.appfunctions.AppFunctionElementNotFoundException
import androidx.appfunctions.AppFunctionInstruction
import androidx.appfunctions.AppFunctionService
import androidx.appfunctions.AppFunctionServiceEntryPoint
import androidx.core.net.toUri
import app.wingtipmaps.android.MainActivity
import kotlinx.coroutines.CancellationException

/**
 * The app's actions and entities for Gemini and the system's other agents
 * (Android's on-device MCP, AppFunctions; docs/android-ai.md): an airport's
 * card, frequencies and approaches, the nearest fields, the route planned
 * and its NOTAMs, the Brief's verdict, the pilot's airplanes and logbook,
 * and the app opened on a route, a field, a screen or the Emergency
 * Assistant. The answers are WingtipActions', which the app's own Ask
 * gives Gemini Nano too; the words each function is described by are
 * FunctionWords'. The KSP compiler writes the service the manifest
 * declares (WingtipFunctionService) and the schema the system indexes.
 * Android 16 and later; the library does the checking.
 */
@RequiresApi(Build.VERSION_CODES.BAKLAVA)
@AppFunctionServiceEntryPoint(serviceName = "WingtipFunctionService", appFunctionXmlFileName = "wingtip_functions")
abstract class WingtipFunctions : AppFunctionService() {
    private val actions by lazy { WingtipActions(application) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.AIRPORT)
    suspend fun findAirport(@AppFunctionInstruction(FunctionWords.P_IDENT) ident: String): AirportEntity = answer { actions.airport(ident) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.SEARCH)
    suspend fun searchAirports(@AppFunctionInstruction(FunctionWords.P_QUERY) query: String): List<AirportEntity> = answer { actions.search(query) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.NEAREST)
    suspend fun nearestAirports(): List<NearestEntity> = answer { actions.nearest() }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.FREQUENCIES)
    suspend fun airportFrequencies(@AppFunctionInstruction(FunctionWords.P_IDENT) ident: String): List<FrequencyEntity> = answer { actions.frequencies(ident) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.APPROACHES)
    suspend fun airportApproaches(@AppFunctionInstruction(FunctionWords.P_IDENT) ident: String): List<ApproachEntity> = answer { actions.approaches(ident) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.ROUTE)
    suspend fun plannedRoute(): RouteEntity = answer { actions.route() }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.NOTAMS)
    suspend fun routeNotams(): List<NotamEntity> = answer { actions.notams() }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.BRIEF)
    suspend fun briefVerdict(): BriefEntity = answer { actions.brief() }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.AIRPLANES)
    suspend fun myAirplanes(): List<AirplaneEntity> = answer { actions.airplanes() }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.LOGBOOK)
    suspend fun logbookFlights(@AppFunctionInstruction(FunctionWords.P_COUNT) count: Int): List<LogbookEntryEntity> = answer { actions.logbook(count) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.OPEN_SCREEN)
    suspend fun openScreen(@AppFunctionInstruction(FunctionWords.P_SCREEN) screen: String): OpenedEntity = opened { actions.screen(screen) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.PLAN_ROUTE)
    suspend fun planRoute(
        @AppFunctionInstruction(FunctionWords.P_DEP) dep: String,
        @AppFunctionInstruction(FunctionWords.P_DEST) dest: String,
        @AppFunctionInstruction(FunctionWords.P_STOPS) stops: List<String>,
    ): OpenedEntity = opened { actions.plan(dep, dest, stops) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.SHOW_AIRPORT)
    suspend fun showAirport(@AppFunctionInstruction(FunctionWords.P_IDENT) ident: String): OpenedEntity = opened { actions.showAirport(ident) }

    @AppFunctionDeclaration(isDescribedByKDoc = false)
    @AppFunctionInstruction(FunctionWords.EMERGENCY)
    suspend fun openEmergency(): OpenedEntity = opened { actions.screen("emergency") }

    /** An action's answer, or why there is none in words the agent can
     *  say (AppFunctions' not-found, which an agent reads as "no such
     *  thing" rather than a fault). */
    private suspend fun <T> answer(block: suspend () -> T): T = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: WingtipActions.NoAnswer) {
        throw AppFunctionElementNotFoundException(e.message)
    }

    /** A screen to open, with the PendingIntent an agent starts it by:
     *  the app's activity on the link, as a link tapped anywhere opens it. */
    private suspend fun opened(block: suspend () -> WingtipActions.Opening): OpenedEntity {
        val opening = answer(block)
        val intent = Intent(Intent.ACTION_VIEW, opening.link.toUri(), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val open = PendingIntent.getActivity(this, opening.link.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return OpenedEntity(opening.said, opening.link, open)
    }
}
