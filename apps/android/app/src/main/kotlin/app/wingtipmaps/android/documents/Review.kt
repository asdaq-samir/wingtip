package app.wingtipmaps.android.documents

import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.documents.model.HandbookFigure
import app.wingtipmaps.android.documents.model.HandbookFigures
import app.wingtipmaps.android.documents.model.HandbookRead
import app.wingtipmaps.android.documents.model.LogbookEntryDraft
import app.wingtipmaps.android.documents.model.LogbookRowCheck
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.Locale
import kotlin.math.roundToInt
import app.wingtipmaps.android.api.generated.gateway.Corner as GatewayCorner
import app.wingtipmaps.android.api.generated.gateway.Cruise as GatewayCruise
import app.wingtipmaps.android.api.generated.gateway.Distance as GatewayDistance
import app.wingtipmaps.android.api.generated.gateway.HandbookFigures as GatewayFigures

/** How a flag is shown: "wrong" (it cannot be right) in the stop tone,
 *  "check" (outside the band, or at odds with another figure) in the
 *  caution tone, as the app colours every finding. Neither stops the
 *  pilot confirming it (decision 0008, warn never limit). */
enum class FlagTone {
    STOP,
    CAUTION,
    ;

    companion object {
        fun of(level: String): FlagTone = if (level == "wrong") STOP else CAUTION
    }
}

/**
 * The handbook page's review: the read reduced to the items the pilot
 * confirmed, by each item's key in handbook_read_check's answer ("cruise.2",
 * "takeoff.0", "climb", "glide", "empty", "weight", "envelope", "fuel"), to
 * ask the engine again for what is kept; and the engine's figures in the
 * gateway's own shape. The rule is the engine's; this only picks.
 */
object HandbookReview {
    fun confirmed(read: HandbookRead, keys: Set<String>): HandbookRead {
        fun <T> rows(list: List<T>?, group: String): List<T>? = list?.filterIndexed { i, _ -> "$group.$i" in keys }
        return read.copy(
            cruise = rows(read.cruise, "cruise"),
            takeoff = rows(read.takeoff, "takeoff"),
            landing = rows(read.landing, "landing"),
            climb = read.climb.takeIf { "climb" in keys },
            glide = read.glide.takeIf { "glide" in keys },
            empty = read.empty.takeIf { "empty" in keys },
            maxTakeoffWeight = read.maxTakeoffWeight.takeIf { "weight" in keys },
            envelope = if ("envelope" in keys) read.envelope else emptyList(),
            fuel = read.fuel.takeIf { "fuel" in keys },
        )
    }

    /** The engine's figures as the gateway keeps them (HandbookRequest):
     *  the same members, the lists given even where empty. */
    fun forGateway(f: HandbookFigures): GatewayFigures = GatewayFigures(
        climbBurnGph = f.climbBurnGph,
        climbRateFpm = f.climbRateFpm,
        climbSpeedKias = f.climbSpeedKias,
        cruise = f.cruise.orEmpty().map { GatewayCruise(it.altitudeFt, it.burnGph, it.powerPct, it.rpm, it.tasKt) },
        emptyArmIn = f.emptyArmIn,
        emptyWeightLb = f.emptyWeightLb,
        envelope = f.envelope.orEmpty().map { GatewayCorner(it.armIn, it.weightLb) },
        fuelTotalGal = f.fuelTotalGal,
        glideRatio = f.glideRatio,
        glideSpeedKias = f.glideSpeedKias,
        landing = f.landing.orEmpty().map { GatewayDistance(it.groundRollFt, it.overObstacleFt, it.pressureAltitudeFt, it.tempC) },
        maxTakeoffWeightLb = f.maxTakeoffWeightLb,
        takeoff = f.takeoff.orEmpty().map { GatewayDistance(it.groundRollFt, it.overObstacleFt, it.pressureAltitudeFt, it.tempC) },
        usableFuelGal = f.usableFuelGal,
    )

    /** A figure to a tenth, as the form's fields show it; empty for none. */
    fun tenth(v: Double?): String = v?.let { String.format(Locale.US, "%.1f", it) }.orEmpty()

    /** A figure as the page prints it, with its unit: "4,000 ft",
     *  "8.6 gph", "65%"; and, where the app's units differ, "→" the
     *  figure the app keeps. */
    fun figure(f: HandbookFigure): String {
        val read = number(f.value, f.unit)
        return if (f.unit == f.appUnit) read else "$read → ${number(f.appValue, f.appUnit)}"
    }

    private fun number(v: Double, unit: String): String {
        val n = if (v == Math.rint(v) && kotlin.math.abs(v) < 1e12) String.format(Locale.US, "%,d", v.toLong())
        else BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
        return if (unit == "%") "$n%" else "$n $unit"
    }
}

/**
 * The logbook page's review: a row is logged only with a date read
 * (14 CFR 61.51(b)(1)(i) asks the date of each flight), so a row without
 * one cannot be confirmed; a confirmed row is the gateway's
 * LogbookEntryRequest, its counts and hours as the engine drew them
 * (the engine writes a count as a number, made whole here).
 */
object LogbookReview {
    fun canConfirm(row: LogbookRowCheck): Boolean = !row.entry.flownOn.isNullOrBlank()

    fun request(e: LogbookEntryDraft): LogbookEntryRequest? {
        val day = e.flownOn?.ifBlank { null } ?: return null
        return LogbookEntryRequest(
            aircraft = e.aircraft,
            aircraftType = e.aircraftType,
            airHours = e.airHours,
            approaches = e.approaches.roundToInt(),
            crossCountryHours = e.crossCountryHours,
            dayLandings = e.dayLandings.roundToInt(),
            distanceNm = e.distanceNm,
            dualHours = e.dualHours,
            flightId = null,
            flownOn = day,
            fromTrack = false,
            holding = e.holding,
            instrumentHours = e.instrumentHours,
            longestLegNm = e.longestLegNm,
            nightHours = e.nightHours,
            nightLandings = e.nightLandings.roundToInt(),
            remarks = e.remarks,
            route = e.route,
            soloHours = e.soloHours,
            totalHours = e.totalHours,
            touchAndGoes = e.touchAndGoes.roundToInt(),
            toweredLandings = e.toweredLandings.roundToInt(),
            tracking = e.tracking,
        )
    }
}
