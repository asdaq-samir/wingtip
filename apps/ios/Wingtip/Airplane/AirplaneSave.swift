import Foundation
import OpenAPIRuntime

/// Where an airplane's figures were kept.
enum FiguresKept: Equatable, Sendable {
    /// With the pilot's airplane on the gateway.
    case account
    /// On this device, with why where the pilot is signed in.
    case device(String?)
}

extension Airplanes {
    /// The ICAO's designator for a type that has none (ICAO Doc 8643; AIM
    /// Appendix 4, item 9 "ZZZZ"): a record's type where neither the book
    /// nor the FAA's registry gives one.
    static let noDesignator = "ZZZZ"

    /// The pilot's figures for an airplane kept where they belong: signed in
    /// with an N-number, on its record -- the figures `added` alone by
    /// PUT /api/aircraft/{id}/figures (an inline ask's one figure), else
    /// the whole airplane; with no record yet, a new one for the N-number
    /// starting from its type's book figures, the pilot's over them. Signed
    /// out, or with no cruise speed and burn for a new record (the two the
    /// gateway requires), on this device. Thrown where the gateway refuses,
    /// with its words.
    func save(_ figures: Figures, tail: String?, aircraft: String, type: String?, signedIn: Bool,
              added: Set<OwnFigure> = []) async throws -> (Figures, FiguresKept) {
        let name = OwnFigureStore.name(tail: tail, aircraft: aircraft)
        guard signedIn, let tail = tail?.uppercased() else {
            OwnFigureStore.save(figures, for: name)
            return (figures, .device(nil))
        }
        if let record = record(tail) {
            let onlyAdded = !added.isEmpty && added.isSubset(of: OwnFigure.recordFigures) && added.allSatisfy { figures[$0] != nil }
            var given = Figures()
            for figure in added { given[figure] = figures[figure] }
            let saved = onlyAdded
                ? try await Gateway.addFigures(record.id, given.gateway)
                : try await Gateway.updateAircraft(record.id, Self.request(record, figures))
            took(saved)
            return (Figures(saved), .account)
        }
        // A new record starts from the type's book (the owner, 2026-11-09:
        // "starting from the matched stock profile's figures").
        let start = Self.answer(book: books[aircraft], handbook: nil, own: figures).map(Figures.init) ?? figures
        guard let request = Self.request(tail: tail, type: type ?? Self.designator(books[aircraft]), start) else {
            OwnFigureStore.save(figures, for: name)
            return (figures, .device("Kept on this iPhone until \(tail) has its cruise speed and fuel burn, which your account needs to keep it."))
        }
        let saved = try await Gateway.addAircraft(request)
        took(saved)
        OwnFigureStore.forget(name)
        return (Figures(saved), .account)
    }

    /// The type designator in a stock profile, where it has one.
    static func designator(_ book: [String: OpenAPIValueContainer]?) -> String? {
        book?["designator"]?.value as? String
    }

    /// The whole airplane as PUT /api/aircraft/{id} takes it: its record
    /// with these figures, a cruise speed or burn not given left as kept.
    static func request(_ record: OwnAircraftRecord, _ f: Figures) -> AircraftRequest {
        AircraftRequest(climbFuelBurnGph: f.climbFuelBurnGph, climbTasKt: f.climbTasKt, colour: record.colour, cruisePowerPct: f.cruisePowerPct,
                        cruiseTasKt: f.cruiseTasKt ?? record.cruiseTasKt, equipment: record.equipment, figures: f.gateway,
                        fuelBurnGph: f.fuelBurnGph ?? record.fuelBurnGph, surveillance: record.surveillance, tailNumber: record.tailNumber,
                        typeDesignator: record.typeDesignator, usableFuelGal: f.usableFuelGal)
    }

    /// A new airplane for an N-number (POST /api/aircraft); nil without the
    /// cruise speed and burn the gateway requires.
    static func request(tail: String, type: String?, _ f: Figures) -> AircraftRequest? {
        guard let cruise = f.cruiseTasKt, let burn = f.fuelBurnGph else { return nil }
        // The gateway's type is at most 16 characters (AircraftRequest).
        let designator = String((type?.trimmingCharacters(in: .whitespaces).uppercased()).flatMap { $0.isEmpty ? nil : $0 }?.prefix(16) ?? Substring(noDesignator))
        return AircraftRequest(climbFuelBurnGph: f.climbFuelBurnGph, climbTasKt: f.climbTasKt, colour: nil, cruisePowerPct: f.cruisePowerPct,
                               cruiseTasKt: cruise, equipment: nil, figures: f.gateway, fuelBurnGph: burn, surveillance: nil,
                               tailNumber: tail, typeDesignator: designator, usableFuelGal: f.usableFuelGal)
    }
}

extension Gateway {
    /// The figures given added to the airplane's own, the rest as they
    /// were (PUT /api/aircraft/{id}/figures): an inline ask's Save.
    static func addFigures(_ id: Int, _ figures: GWOwnFigures) async throws -> OwnAircraftRecord {
        try await call { try await $0.figures(path: .init(id: id), body: .json(figures)).ok.body.json }
    }
}
