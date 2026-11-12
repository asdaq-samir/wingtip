import Foundation
import UniformTypeIdentifiers

extension UTType {
    /// A Wingtip flight file (.wingtip), the type the app exports
    /// (project.yml's UTExportedTypeDeclarations): JSON, so it conforms to
    /// public.json, and Files, AirDrop and Mail hand it to the app.
    static let wingtipFlight = UTType(exportedAs: "app.wingtipmaps.flight", conformingTo: .json)
}

/// A flight saved as a file: the plan as the shared flight's plain link
/// carries it (SharedPlan, `?open=shared`: route, stops, altitude,
/// departure time, airplane type, rules), so a file and a link open the
/// same Shared Flight preview, and the nav log and its totals where the
/// plan had them worked out. Opened from Files, AirDrop or Mail it is
/// previewed, never planned until the pilot taps Use This Plan (the
/// owner, 2026-11-09). Nothing in it leaves the phone but by the pilot's
/// own hand: it is written where they save or send it.
struct FlightFile: Codable, Equatable, Sendable {
    /// What a reader checks before anything else, and the shape's version.
    static let kind = "app.wingtipmaps.flight"
    var format = FlightFile.kind
    var version = 1
    /// The plan, as the shared link writes it (SharedPlan.link).
    var link: URL
    /// The nav log as the gateway saves a flight's (FlightCheckpointDto's
    /// members), and its totals; empty and nil where the plan had none.
    var navLog: [GWFlightCheckpointDto] = []
    var totals: Totals?

    struct Totals: Codable, Equatable, Sendable {
        var distanceNm: Double?
        var eteMin: Double?
        var fuelGal: Double?
    }

    /// The plan the link carries; nil for a file whose link is not a
    /// shared flight's.
    var plan: SharedPlan? {
        guard let query = Links.query(of: link), case .plan(let plan)? = SharedFlightLink.of(query) else { return nil }
        return plan
    }

    /// The file's bytes: JSON, keys sorted, so the same plan is the same file.
    func data() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }

    /// A file's bytes read back; nil for anything that is not a Wingtip
    /// flight with a plan in it.
    static func read(_ data: Data) -> FlightFile? {
        guard let file = try? JSONDecoder().decode(FlightFile.self, from: data), file.format == kind, file.plan != nil else { return nil }
        return file
    }

    /// A file at a URL handed over by Files, AirDrop or Mail, read inside
    /// its security scope.
    static func read(at url: URL) -> FlightFile? {
        let reading = url.startAccessingSecurityScopedResource()
        defer { if reading { url.stopAccessingSecurityScopedResource() } }
        return (try? Data(contentsOf: url)).flatMap(read)
    }
}

extension FlightFile {
    /// The plan on the page as a file: its link (the N-number only where
    /// asked, as Share Link's toggle), and the nav log once it is worked
    /// out (Plan.saved, the legs as the gateway saves a flight's).
    @MainActor
    static func of(_ plan: Plan, includeTail: Bool) -> FlightFile {
        let saved = plan.saved()
        let log = saved?.checkpoints.map {
            GWFlightCheckpointDto(alongTrackNm: $0.alongTrackNm, altitudeFt: $0.altitudeFt, category: $0.category, eteMin: $0.eteMin,
                                  fuelGal: $0.fuelGal, groundspeedKt: $0.groundspeedKt, lat: $0.lat, legDistanceNm: $0.legDistanceNm,
                                  lon: $0.lon, magneticHeadingDeg: $0.magneticHeadingDeg, name: $0.name, sequenceNo: $0.sequenceNo,
                                  trueCourseDeg: $0.trueCourseDeg)
        }
        let totals = plan.totals.map { Totals(distanceNm: $0.distanceNm, eteMin: $0.eteMin, fuelGal: $0.fuelGal) }
        return FlightFile(link: RouteShare.link(plan, includeTail: includeTail), navLog: log ?? [], totals: totals)
    }

    /// "C81-KDLH.wingtip", from the route.
    @MainActor
    static func name(_ plan: Plan) -> String { RouteShare.fileName(plan) + ".wingtip" }
}

/// A file made on the phone to save or send: the flight file or the
/// kneeboard's PDF, with its type and name (ShareMenu's Save as File).
struct SavedFile: Sendable {
    let data: Data
    let type: UTType
    /// The name with its extension: "C81-KDLH.wingtip".
    let name: String

    /// The file written to the temporary folder, for the share sheet's
    /// Save to Files, AirDrop and Mail where iOS 27's exporter is not
    /// there (iOS 18 to 26; SaveFileLink).
    func temporaryURL() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: name)
        try data.write(to: url, options: .atomic)
        return url
    }
}
