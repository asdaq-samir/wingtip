import SwiftUI

/// The airplane card's Info tab (the owner's P1, 2026-11-14; the web's
/// AirplaneInfo and AirplaneHistory): its public record in the planner's
/// order -- Registration, Airplane, Engine, Airworthiness -- then where it
/// is usually based, its safety and ownership history and the documents
/// filed, each group saying in place where it has nothing. The FAA aircraft
/// registry is public data, so its owner is shown for every airplane as
/// the FAA publishes it: name, kind, town and state, co-owners (the owner,
/// 2026-11-14: "For owner info though, it's public info"); the town, never
/// the street. An owner who asked the FAA to withhold their name (49
/// U.S.C. 44114(b)) is not in the record, and its row says so. `record` is
/// the registry's, at once; `details` the rest, nil while asked.
struct AirplaneInfoSections: View {
    let record: AircraftRegistration?
    let details: APIAirplaneDetails?
    let detailsFailed: Bool

    var body: some View {
        if let full = details?.registration ?? record {
            registration(full)
            airplane(full)
            engine(full)
            airworthiness(full)
        } else {
            Section { Text("The FAA's registry has no record of this N-number.").foregroundStyle(.secondary) }
        }
        AirplaneHistorySections(details: details, failed: detailsFailed)
    }

    private func registration(_ full: AircraftRegistration) -> some View {
        Section("Registration") {
            fact("Owner", full.owner ?? "Not in the record")
            fact("Owner type", full.ownerType)
            fact("Town", Self.town(full.city, full.state ?? (full.country != "US" ? full.country : nil)))
            fact("Co-owners", full.coOwnerNames.flatMap { $0.isEmpty ? nil : $0.joined(separator: ", ") } ?? full.coOwners.flatMap { $0 > 0 ? String($0) : nil })
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
        let power = hp.map { "\($0.formatted()) hp" } ?? thrust.map { "\($0.formatted()) lb thrust" }
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

    var body: some View {
        if let details {
            if details.based?.field != nil || details.basedPending == true {
                Section("Usually based at") {
                    if let based = details.based, let field = based.field {
                        CardRow(title: [field.ident, field.name].compactMap { $0 }.joined(separator: " · "),
                                detail: based.count.flatMap { count in based.ends.map { "\(count) of \($0) takeoffs and landings" } })
                    } else {
                        Text("Looking…").foregroundStyle(.secondary)
                    }
                }
            }
            Section("Safety history") {
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
            Section("Ownership history") {
                let past = (details.pastRegistrations ?? []).sorted { ($0.sameAirframe == true ? 1 : 0) > ($1.sameAirframe == true ? 1 : 0) }
                if past.isEmpty { Text("No past registrations.").foregroundStyle(.secondary) }
                ForEach(Array(past.enumerated()), id: \.offset) { _, p in
                    CardRow(title: [p.nNumber, p.sameAirframe == true ? "This airframe" : "Another airplane", p.status].compactMap { $0 }.joined(separator: " · "),
                            detail: [[p.manufacturer, p.model].compactMap { $0 }.joined(separator: " ").nonEmpty, p.year.map(String.init), p.owner,
                                     AirplaneInfoSections.town(p.city, p.state), p.cancelDate.flatMap { AirplaneInfoSections.day($0).map { "canceled \($0)" } },
                                     p.exportCountry.map { "exported to \($0)" }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
            }
            Section("Documents filed") {
                let documents = details.documents ?? []
                if documents.isEmpty, details.reservation == nil { Text("None filed in the last month.").foregroundStyle(.secondary) }
                ForEach(Array(documents.enumerated()), id: \.offset) { _, d in
                    CardRow(title: d.kind ?? "Document",
                            detail: [d.received.flatMap { AirplaneInfoSections.day($0).map { "received \($0)" } },
                                     d.entered.flatMap { AirplaneInfoSections.day($0).map { "entered \($0)" } }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
                if let r = details.reservation {
                    CardRow(title: "N-number reserved",
                            detail: [r.registrant, AirplaneInfoSections.town(r.city, r.state), AirplaneInfoSections.day(r.reserved), r.kind,
                                     r.changeTo.map { "changing to \($0)" }].compactMap { $0 }.joined(separator: " · ").nonEmpty)
                }
            }
        } else {
            Section("History") {
                Text(failed ? "Its history couldn't be fetched. Try again in a moment." : "Fetching its history…")
                    .foregroundStyle(failed ? AnyShapeStyle(WingtipInk.problem) : AnyShapeStyle(.secondary))
            }
        }
    }
}
