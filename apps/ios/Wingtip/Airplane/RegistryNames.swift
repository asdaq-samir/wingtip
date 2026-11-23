import Foundation

/// Whose name an airplane card shows from the FAA aircraft registry, in the
/// App Store app. App Review 5.1.1(viii) does not permit an app to compile
/// personal information "from any source that is not directly from the
/// user or without the user's explicit consent, even public databases", and
/// the registry's names next to live traffic are just that. So the card
/// names a registrant only where it compiles no private person's data: the
/// pilot's own airplanes (in their account), and registrants the FAA types
/// as an organisation. Anyone else is written as their kind and state,
/// "Individual, WI", with no name, no town and no co-owners' names (the
/// owner, 2026-11-21; decision 0055, docs/design/rules.md 17). The web keeps every
/// name, the owner's choice of 2026-11-14 ("it's public info"), since it is
/// not on the App Store. A display rule of the store's, not an aviation
/// rule, so it is the app's own, as Android's RegistryNames is.
enum RegistryNames {
    /// The FAA's Type Registrant (MASTER and DEREG, the registry's readme
    /// ardata.pdf), in the planner's words (wingtip/registry_codes.py,
    /// REGISTRANT), lowercased: the kinds that are an organisation, 3
    /// Corporation, 5 Government, 7 LLC and 8 Non-citizen corporation.
    /// 1 Individual, 4 Co-owned and 9 Non-citizen co-owned are people, and a
    /// 2 Partnership is most often two people by name, so each of those is
    /// written as its kind and state.
    static let organisations: Set<String> = ["corporation", "government", "llc", "non-citizen corporation"]

    /// Whether the registry types this registrant as an organisation.
    static func isOrganisation(_ ownerType: String?) -> Bool {
        guard let kind = ownerType?.trimmingCharacters(in: .whitespaces).lowercased() else { return false }
        return organisations.contains(kind)
    }

    /// Whether the card names this registrant: the pilot's own airplane, or
    /// an organisation.
    static func named(ownerType: String?, own: Bool) -> Bool {
        own || isOrganisation(ownerType)
    }

    /// Whether `nNumber` is one of the pilot's airplanes, written with its
    /// "N" or without, in either case.
    static func own(_ nNumber: String?, among tails: some Sequence<String>) -> Bool {
        guard let wanted = bare(nNumber) else { return false }
        return tails.contains { bare($0) == wanted }
    }

    /// "Individual, WI": the kind and where, for a registrant not named;
    /// the country where it is outside the US.
    static func kindAndState(_ ownerType: String?, state: String?, country: String?) -> String {
        let kind = ownerType?.nonEmpty ?? "Private owner"
        let place = state?.nonEmpty ?? (country == "US" ? nil : country?.nonEmpty)
        return [kind, place].compactMap { $0 }.joined(separator: ", ")
    }

    /// The Owner row: the name where it is shown, else the kind and state;
    /// "Not in the record" where the owner asked the FAA to withhold it
    /// (49 U.S.C. 44114(b)).
    static func owner(_ record: AircraftRegistration, own: Bool) -> String {
        guard let name = record.owner?.nonEmpty else { return "Not in the record" }
        guard named(ownerType: record.ownerType, own: own) else {
            return kindAndState(record.ownerType, state: record.state, country: record.country)
        }
        return name
    }

    /// The Co-owners row: their names where the owner is named, else how
    /// many there are; nil with none.
    static func coOwners(_ record: AircraftRegistration, own: Bool) -> String? {
        if named(ownerType: record.ownerType, own: own), let names = record.coOwnerNames, !names.isEmpty {
            return names.joined(separator: ", ")
        }
        return record.coOwners.flatMap { $0 > 0 ? String($0) : nil }
    }

    /// The town row, only where the owner is named: a person's town is
    /// what their kind and state leave out.
    static func town(_ record: AircraftRegistration, own: Bool) -> String? {
        guard named(ownerType: record.ownerType, own: own) else { return nil }
        let place = record.state ?? (record.country != "US" ? record.country : nil)
        return [record.city, place].compactMap { $0 }.joined(separator: ", ").nonEmpty
    }

    /// A past registration's registrant: named only where it is an
    /// organisation (a past owner of the pilot's own airplane is someone
    /// else), else its kind and state.
    static func pastOwner(ownerType: String?, owner: String?, city: String?, state: String?) -> String? {
        guard let owner = owner?.nonEmpty else { return nil }
        guard isOrganisation(ownerType) else { return kindAndState(ownerType, state: state, country: nil) }
        return [owner, [city, state].compactMap { $0 }.joined(separator: ", ").nonEmpty].compactMap { $0 }.joined(separator: " · ")
    }

    /// Who reserved the N-number: the registry gives no kind for them, so
    /// they are named only on the pilot's own airplane, else their state.
    static func reservedBy(_ registrant: String?, city: String?, state: String?, own: Bool) -> String? {
        if own { return [registrant, [city, state].compactMap { $0 }.joined(separator: ", ").nonEmpty].compactMap { $0 }.joined(separator: " · ").nonEmpty }
        return state?.nonEmpty
    }

    private static func bare(_ tail: String?) -> String? {
        guard var t = tail?.trimmingCharacters(in: .whitespaces).uppercased(), !t.isEmpty else { return nil }
        if t.hasPrefix("N"), t.dropFirst().first?.isNumber == true { t.removeFirst() }
        return t
    }
}
