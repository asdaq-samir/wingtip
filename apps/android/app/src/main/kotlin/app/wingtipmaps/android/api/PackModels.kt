package app.wingtipmaps.android.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The planner's answers the cycle packs give on the phone too (the
// engine's readers answer the planner's own shapes: AirspaceAt,
// AheadAlert, the in-view lists), generated from the planner's document
// (api/generated) under the names the app uses.

/** One region's phone pack (CyclePackRegion, wingtip.cycle_pack's write_phone):
 *  its bounds in degrees, its size and its CRC-32, for the phone to check
 *  it whole. */
typealias CyclePackRegion = app.wingtipmaps.android.api.generated.CyclePackRegion

/** The planner's list of the phones' packs of its FAA cycle
 *  (/api/cycle-packs, the planner's CyclePacks). */
typealias CyclePackIndex = app.wingtipmaps.android.api.generated.CyclePacks

/** A band of airspace over a point (AirspaceBand): the document's
 *  `class` is A to G. */
typealias AirspaceBand = app.wingtipmaps.android.api.generated.AirspaceBand

/** A Class B's Mode C veil the point is in (ModeCVeil). */
typealias ModeCVeil = app.wingtipmaps.android.api.generated.ModeCVeil

/** The point named off its nearest fix, "VPBNG/095/14.2" (PointOffFix). */
typealias PointOffFix = app.wingtipmaps.android.api.generated.PointOffFix

/** A special-use area over the point (SpecialUse), as the FAA's file has it. */
typealias SpecialUse = app.wingtipmaps.android.api.generated.SpecialUse

/** A TFR over the point now or to come (TfrHere). */
typealias TfrHere = app.wingtipmaps.android.api.generated.TfrHere

/** The airspace over a point (AirspaceAt): from the planner, or from the
 *  pack of its region on the phone (CyclePacks.airspaceAt). */
typealias AirspaceAt = app.wingtipmaps.android.api.generated.AirspaceAt

/** One thing ahead of the airplane (AheadAlert, wingtip.alerts): airspace, a
 *  special-use area or a TFR its track goes into in the next five
 *  minutes, or the ground or an obstacle it comes within 500 ft of in the
 *  next minute. The planner's judgment (or the engine's, from the packs);
 *  the app says it. */
typealias AheadAlert = app.wingtipmaps.android.api.generated.AheadAlert

/** What is ahead with no network (wt_ahead, the engine's own C function,
 *  whose answer is not one of the planner's documented shapes): the
 *  alerts, and the kinds that could not be judged on the phone (the
 *  obstacles are the planner's alone; the TFRs are not kept here yet),
 *  which are said to be missing, never read as clear. */
@Serializable
data class Ahead(
    val alerts: List<AheadAlert>,
    val unavailable: List<String> = emptyList(),
    /** The packs' ground under the airplane (their terrain grid's highest
     *  in its cell, with its margin): the glide ring's ground (InFlight). */
    @SerialName("ground_ft") val groundFt: Double? = null,
)
