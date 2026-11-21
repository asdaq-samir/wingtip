package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.AircraftRegistration

/**
 * Whose name an airplane card shows from the FAA aircraft registry, in the
 * Google Play app, as the App Store app does (the iPhone's RegistryNames).
 * App Review 5.1.1(viii) does not permit an app to compile personal
 * information "from any source that is not directly from the user or
 * without the user's explicit consent, even public databases", and Play's
 * User Data policy asks the same care, so the card names a registrant
 * only where it compiles no private person's data: the pilot's own
 * airplanes (the card's OwnRecord, on the phone or the account), and
 * registrants the FAA types as an organisation. Anyone else
 * is their kind and state, "Individual, WI", with no name, no town and no
 * co-owners' names (the owner, 2026-11-21; docs/design/registry-names.md).
 * The web keeps every name, the owner's choice of 2026-11-14. A display
 * rule of the stores', not an aviation rule, so it is the app's own.
 */
object RegistryNames {
    /**
     * The FAA's Type Registrant (MASTER and DEREG, the registry's readme
     * ardata.pdf), in the planner's words (wingtip/registry_codes.py,
     * REGISTRANT), lowercased: the kinds that are an organisation, 3
     * Corporation, 5 Government, 7 LLC and 8 Non-citizen corporation.
     * 1 Individual, 4 Co-owned and 9 Non-citizen co-owned are people, and a
     * 2 Partnership is most often two people by name, so each of those is
     * written as its kind and state.
     */
    val ORGANISATIONS = setOf("corporation", "government", "llc", "non-citizen corporation")

    fun isOrganisation(ownerType: String?): Boolean = ownerType?.trim()?.lowercase() in ORGANISATIONS

    /** Whether the card names this registrant: the pilot's own airplane, or an organisation. */
    fun named(ownerType: String?, own: Boolean): Boolean = own || isOrganisation(ownerType)

    /** "Individual, WI": the kind and where, for a registrant not named; the country outside the US. */
    fun kindAndState(ownerType: String?, state: String?, country: String?): String {
        val kind = ownerType?.ifBlank { null } ?: "Private owner"
        val place = state?.ifBlank { null } ?: country?.ifBlank { null }?.takeIf { it != "US" }
        return listOfNotNull(kind, place).joinToString(", ")
    }

    /** The Owner row: the name where it is shown, else the kind and state;
     *  null where the owner asked the FAA to withhold it (49 U.S.C. 44114(b)),
     *  which the card says as "Not in the record". */
    fun owner(record: AircraftRegistration, own: Boolean): String? {
        val name = record.owner?.ifBlank { null } ?: return null
        return if (named(record.ownerType, own)) name else kindAndState(record.ownerType, record.state, record.country)
    }

    /** The Co-owners row: their names where the owner is named, else how many; null with none. */
    fun coOwners(record: AircraftRegistration, own: Boolean): String? {
        val names = record.coOwnerNames.orEmpty()
        if (named(record.ownerType, own) && names.isNotEmpty()) return names.joinToString(", ")
        return record.coOwners?.takeIf { it > 0 }?.toString()
    }

    /** The town row, only where the owner is named: a person's town is what their kind and state leave out. */
    fun town(record: AircraftRegistration, own: Boolean): String? {
        if (!named(record.ownerType, own)) return null
        return listOfNotNull(record.city, record.state ?: record.country?.takeIf { it != "US" }).joinToString(", ").ifEmpty { null }
    }

    /** A past registration's registrant: named only where it is an
     *  organisation (a past owner of the pilot's own airplane is someone
     *  else), else its kind and state. */
    fun pastOwner(ownerType: String?, owner: String?, city: String?, state: String?): String? {
        val name = owner?.ifBlank { null } ?: return null
        if (!isOrganisation(ownerType)) return kindAndState(ownerType, state, null)
        return listOfNotNull(name, listOfNotNull(city, state).joinToString(", ").ifEmpty { null }).joinToString(" · ")
    }

    /** Who reserved the N-number: the registry gives no kind for them, so
     *  they are named only on the pilot's own airplane, else their state. */
    fun reservedBy(registrant: String?, city: String?, state: String?, own: Boolean): String? {
        if (!own) return state?.ifBlank { null }
        return listOfNotNull(registrant, listOfNotNull(city, state).joinToString(", ").ifEmpty { null }).joinToString(" · ").ifEmpty { null }
    }
}
