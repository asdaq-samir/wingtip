import Foundation
import Testing
import UniformTypeIdentifiers
@testable import Wingtip

/// A flight saved as a Wingtip flight file (FlightFile): written and read
/// back as the same plan, opened into the Shared Flight preview with its
/// nav log and never planned by itself, and anything else refused.
@MainActor
struct FlightFileTests {
    private let host = URL(string: "https://wingtipmaps.app")!

    private var file: FlightFile {
        let plan = SharedPlan(dep: "KMSN", dest: "KOSH", stops: ["KJVL"], altitudeFt: 4500, type: "C172", rules: .vfr)
        let leg = GWFlightCheckpointDto(alongTrackNm: 31.2, altitudeFt: 4500, category: "town", eteMin: 14, fuelGal: 2.1, groundspeedKt: 112,
                                        lat: 42.6, lon: -89.0, magneticHeadingDeg: 128, name: "JVL", sequenceNo: 1, trueCourseDeg: 126)
        return FlightFile(link: plan.link(includeTail: false, host: host), navLog: [leg],
                          totals: .init(distanceNm: 31.2, eteMin: 14, fuelGal: 2.1))
    }

    @Test func aFileReadsBackAsTheSamePlan() throws {
        let read = try #require(FlightFile.read(try file.data()))
        #expect(read == file)
        #expect(read.plan == SharedPlan(dep: "KMSN", dest: "KOSH", stops: ["KJVL"], altitudeFt: 4500, type: "C172", rules: .vfr))
    }

    @Test func theTypeIsTheAppsOwnJSON() {
        #expect(UTType.wingtipFlight.identifier == "app.wingtipmaps.flight")
        #expect(UTType.wingtipFlight.conforms(to: .json))
    }

    @Test func anotherJSONIsNotAFlight() {
        #expect(FlightFile.read(Data(#"{"format":"something.else","version":1,"link":"https://wingtipmaps.app/app/plan?open=shared&dep=KMSN&dest=KOSH"}"#.utf8)) == nil)
        #expect(FlightFile.read(Data(#"{"format":"app.wingtipmaps.flight","version":1,"link":"https://wingtipmaps.app/app/plan?place=KMSN"}"#.utf8)) == nil)
        #expect(FlightFile.read(Data("not json".utf8)) == nil)
    }

    @Test func aFileOpenedIsAPreview_notARoutePlanned() throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "KMSN-KOSH.wingtip")
        try file.data().write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(Links.command(for: url) == .sharedFlight(.file(file)))
    }

    @Test func thePreviewShowsTheFilesNavLog_andNotNowLeavesThePlan() {
        let model = SharedFlightModel()
        model.open(.file(file))
        #expect(model.showing)
        #expect(model.plan?.route == "KMSN → KJVL → KOSH")
        #expect(model.navLog.map(\.name) == ["JVL"])
        #expect(model.totals?.distanceNm == 31.2)
        model.notNow()
        #expect(!model.showing && model.plan == nil)
    }

    /// Save as File hands the system's exporter the file's own bytes.
    @Test @MainActor func aSavedFileIsExportedAsItsBytes() async throws {
        let saved = SavedFile(data: Data("x".utf8), type: .wingtipFlight, name: "KMSN-KOSH.wingtip")
        #expect(try await ExportedFile(saved).snapshot(contentType: .wingtipFlight) == Data("x".utf8))
        #expect(ExportedFile.writableContentTypes.contains(.wingtipFlight))
    }
}
