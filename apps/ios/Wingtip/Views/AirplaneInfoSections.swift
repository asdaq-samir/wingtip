import SwiftUI

/// The airplane card's Info tab (the owner's P1, 2026-11-14; the web's
/// AirplaneInfo and AirplaneHistory): its public record in the planner's
/// order -- Registration, Airplane, Engine, Airworthiness -- then where it
/// is usually based, its safety and ownership history and the documents
/// filed, each group saying in place where it has nothing. The registrant
/// is named only on the pilot's own airplane or where it is an
/// organisation; anyone else is their kind and state (RegistryNames, App
/// Review 5.1.1(viii)); the town, never the street. An owner who asked the
/// FAA to withhold their name (49 U.S.C. 44114(b)) is not in the record,
/// and its row says so. `record` is the registry's, at once; `details` the
/// rest, nil while asked; `own` whether it is one of the pilot's;
/// `history` whether its base and its safety and ownership history are
/// offered (Extra.airplaneHistory: another's only with Other Airplanes on).
struct AirplaneInfoSections: View {
    let record: AircraftRegistration?
    let details: APIAirplaneDetails?
    let detailsFailed: Bool
    let own: Bool
    let history: Bool

    var body: some View {
        if let full = details?.registration ?? record {
            registration(full)
            airplane(full)
            engine(full)
            airworthiness(full)
        } else {
            Section { Text("The FAA's registry has no record of this N-number.").foregroundStyle(.secondary) }
        }
        if history { AirplaneHistorySections(details: details, failed: detailsFailed, own: own) }
    }

    private func registration(_ full: AircraftRegistration) -> some View {
        Section("Registration") {
            let named = RegistryNames.named(ownerType: full.ownerType, own: own)
            fact("Owner", RegistryNames.owner(full, own: own))
            // Not named, the Owner row is already the kind and state.
            if named { fact("Owner type", full.ownerType) }
            fact("Town", RegistryNames.town(full, own: own))
            fact("Co-owners", RegistryNames.coOwners(full, own: own))
            fact("Status", full.status)
            fact("Issued", Self.day(full.certificateIssued))
            fact("Expires", Self.day(full.expires))
            fact("Last action", Self.day(full.lastAction))
            fact("FAA region", full.region)
            if full.fractional == true { fact("Fractional ownership", "Yes") }
        }
    }

    private func airplane(_ full: AircraftRegistration) -> some View {
        let ref = details?.model
        return Section("Airplane") {
            fact("Type", [full.manufacturer, full.model].compactMap { $0 }.joined(separator: " ").nonEmpty)
            fact("Year", full.year.map(String.init))
            fact("Category", ref?.category ?? full.aircraftType)
            fact("Builder certification", ref?.builderCertification)
            fact("Seats", (ref?.seats ?? full.seats).map(String.init))
            fact("Engines", (ref?.engines ?? full.engines).map(String.init))
            fact("Weight class", ref?.weightClass)
            // The FAA reference record's average cruise in statute miles an
            // hour (ACFTREF, ardata.pdf): a reference, never one to plan
            // with, and said so.
            fact("FAA reference cruise", ref?.cruiseMph.map { "\($0) mph, not for planning" })
            fact("Kit", full.kit)
            fact("Serial", full.serial)
            fact("Mode S address", full.modeSHex?.uppercased())
            fact("Mode S (octal)", full.modeSOctal)
        }
    }

    @ViewBuilder private func engine(_ full: AircraftRegistration) -> some View {
        let engine = details?.engine
        let hp = engine?.horsepower ?? full.horsepower
        let thrust = engine?.thrustLb ?? full.thrustLb
        let power = hp.map { "\($0.formatted(.number.locale(Format.locale))) hp" } ?? thrust.map { "\($0.formatted(.number.locale(Format.locale))) lb thrust" }
        if full.engine != nil || engine != nil || power != nil {
            Section("Engine") {
                fact("Model", [engine?.manufacturer, engine?.model].compactMap { $0 }.joined(separator: " ").nonEmpty ?? full.engine)
                fact("Type", engine?.engineType ?? full.engineType)
                fact(hp != nil ? "Horsepower" : "Thrust", power)
            }
        }
    }

    private func airworthiness(_ full: AircraftRegistration) -> some View {
        Section("Airworthiness") {
            fact("Class and operations", full.airworthiness ?? "Not in the record")
            fact("Issued", Self.day(full.airworthinessDate))
            fact("Type certificate data sheet", details?.model?.tcDataSheet)
            fact("Holder", details?.model?.tcHolder)
        }
    }

    /// One fact, left out where the record has none.
    @ViewBuilder private func fact(_ title: String, _ value: String?) -> some View {
        if let value, !value.isEmpty { LabeledContent(title, value: value) }
    }

    /// "Duluth, MN"; nil with neither.
    static func town(_ city: String?, _ state: String?) -> String? {
        [city, state].compactMap { $0 }.joined(separator: ", ").nonEmpty
    }

    /// An ISO date of the FAA's or the NTSB's as the app writes a day.
    static func day(_ iso: String?) -> String? {
        guard let iso, let date = try? Date.ISO8601FormatStyle().year().month().day().parse(iso) else { return iso }
        return Format.day(date)
    }
}

/// Info past the record: where it is usually based, by its own flights
/// (the engine's usual_base); its safety history, the NTSB's cases, each
/// its report and docket; its ownership history, this airframe's past
/// registrations first, then other airplanes that held the N-number (the
/// FAA's DEREG); the documents filed and any reservation of the N-number.
struct AirplaneHistorySections: View {
    let details: APIAirplaneDetails?
    let failed: Bool
    let own: Bool

    var body: some View {
        if let details {
            if details.based?.field != nil || details.basedPending == true {
                Section("Usually Based At") {
                    if let based = details.based, let field = based.field {
                        CardRow(title: [field.ident, field.name].compactMap { $0 }.joined(separator: " · "),
                                detail: based.count.flatMap { count in based.ends.map { "\(count) of \($0) takeoffs and landings" } })
                    } else {
                        Text("Looking…").foregroundStyle(.secondary)
                    }
                }
            }
            Section("Safety History") {
                let cases = details.ntsb ?? []
                if cases.isEmpty { Text("No NTSB accident or incident on record since 2008.").foregroundStyle(.secondary) }
                ForEach(cases, id: \.evId) { c in
                    if let url = URL(string: c.carolUrl) {
                        Link(destination: url) {
                            CardRow(title: [AirplaneInfoSections.day(c.date), c.kind, c.ntsbNo].compactMap { $0 }.joined(separator: " · "),
                                    detail: [AirplaneInfoSections.town(c.city, c.state), c.phase, c.damage, c.highestInjury].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                        }
                    }
                    if let docket = c.docketUrl.flatMap(URL.init(string:)) {
                        Link("Docket \(c.ntsbNo ?? "")".trimmingCharacters(in: .whitespaces), destination: docket)
                    }
                }
            }
            Section("Ownership History") {
                let past = (details.pastRegistrations ?? []).sorted { ($0.sameAirframe == true ? 1 : 0) > ($1.sameAirframe == true ? 1 : 0) }
                if past.isEmpty { Text("No past registrations.").foregroundStyle(.secondary) }
                ForEach(Array(past.enumerated()), id: \.offset) { _, p in
                    CardRow(title: [p.nNumber, p.sameAirframe == true ? "This airframe" : "Another airplane", p.status].compactMap { $0 }.joined(separator: " · "),
                            detail: [[p.manufacturer, p.model].compactMap { $0 }.joined(separator: " ").nonEmpty, p.year.map(String.init),
                                     RegistryNames.pastOwner(ownerType: p.ownerType, owner: p.owner, city: p.city, state: p.state), p.cancelDate.flatMap { AirplaneInfoSections.day($0).map { "canceled \($0)" } },
                                     p.exportCountry.map { "exported to \($0)" }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
            }
            Section("Documents Filed") {
                let documents = details.documents ?? []
                if documents.isEmpty, details.reservation == nil { Text("None filed in the last month.").foregroundStyle(.secondary) }
                ForEach(Array(documents.enumerated()), id: \.offset) { _, d in
                    CardRow(title: d.kind ?? "Document",
                            detail: [d.received.flatMap { AirplaneInfoSections.day($0).map { "received \($0)" } },
                                     d.entered.flatMap { AirplaneInfoSections.day($0).map { "entered \($0)" } }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
                if let r = details.reservation {
                    CardRow(title: "N-Number Reserved",
                            detail: [RegistryNames.reservedBy(r.registrant, city: r.city, state: r.state, own: own), AirplaneInfoSections.day(r.reserved), r.kind,
                                     r.changeTo.map { "changing to \($0)" }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
            }
        } else {
            Section("History") {
                Text(failed ? Wording.historyNotFetched : String(localized: "Fetching its history…"))
                    .foregroundStyle(failed ? AnyShapeStyle(WingtipInk.problem) : AnyShapeStyle(.secondary))
            }
        }
    }
}
