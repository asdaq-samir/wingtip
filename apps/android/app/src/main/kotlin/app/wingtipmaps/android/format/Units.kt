package app.wingtipmaps.android.format

/**
 * The unit conversions the app makes, one copy each and nowhere else
 * (scripts/ci/simplicity_ratchet.py's phone_unit_literals counts a unit
 * literal outside this file). Each is a definition worked out exactly, as
 * the engine's core::units is: the international foot and nautical mile
 * of the 1959 yard and pound agreement (NIST SP 811 B.9), never typed
 * rounded (3.28084 ft a metre, 1.943844 kt a metre a second). Android's
 * android.icu MeasureUnit names units but converts none.
 */
object Units {
    /** Metres in a foot, the international foot (NIST SP 811 B.9). */
    const val M_PER_FT = 0.3048

    /** Feet in a metre: 3.280839895..., not the rounded 3.28084. */
    const val FT_PER_M = 1.0 / M_PER_FT

    /** Metres in a nautical mile, the international nautical mile (NIST SP
     *  811 B.9). */
    const val M_PER_NM = 1852.0

    /** Knots in a metre a second: 3,600 s an hour over 1,852 m a mile,
     *  1.943844492.... */
    const val KT_PER_M_S = 3600.0 / M_PER_NM
}
