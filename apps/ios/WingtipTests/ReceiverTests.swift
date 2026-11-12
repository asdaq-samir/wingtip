import Foundation
import Testing
@testable import Wingtip

/// The cockpit receiver's GDL 90 read on the phone as the engine reads it,
/// against the shared fixture (apps/web/src/lib/fixtures/gdl90.json): the
/// datagrams through the engine's bridge and the generated types, the
/// traffic merged into the planner's TrafficAircraft, a field's FIS-B
/// reports, and the NEXRAD as the map's overlays.
private final class FixtureBundle {}

private struct Gdl90: Decodable {
    struct Datagram: Decodable { let at: Double; let hex: String }
    struct Reports: Decodable { let ident: String; let metar: String; let taf: String }
    struct Traffic: Decodable { let ownFt: Double }
    let datagrams: [Datagram]
    let reports: Reports
    let traffic: Traffic
}

private func fixture() throws -> Gdl90 {
    let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "gdl90", withExtension: "json"))
    return try Planner.snakeCase.decode(Gdl90.self, from: Data(contentsOf: url))
}

private func bytes(_ hex: String) -> Data {
    var out = Data()
    var at = hex.startIndex
    while at < hex.endIndex {
        let next = hex.index(at, offsetBy: 2)
        out.append(UInt8(hex[at..<next], radix: 16)!)
        at = next
    }
    return out
}

/// The picture after the fixture's datagrams.
private func picture(_ f: Gdl90) throws -> EngineContract.ReceiverPicture {
    var picture: EngineContract.ReceiverPicture?
    for d in f.datagrams {
        picture = try Engine.receiverRead(data: bytes(d.hex).base64EncodedString(), at: d.at, picture: picture)
    }
    return try #require(picture)
}

@MainActor
struct ReceiverTests {
    @Test func theStreamReadsIntoTheReceiverOwnShipAndTraffic() throws {
        let p = try picture(fixture())
        #expect(p.receiver.name == "Sentry")
        #expect(p.receiver.gps && p.receiver.msl)
        #expect(p.receiver.badFrames == 1)
        #expect(p.ownship?.callsign == "N12345")
        #expect(p.ownship?.geometricFt == 3200)
        #expect(p.targets.map(\.hex) == ["ab4549"])
        #expect(p.targets.first?.pressureFt == 5000)
        #expect(p.texts.count == 3)
        #expect(p.nexrad.count == 1)
    }

    @Test func aFieldsReportsOverFisB() throws {
        let f = try fixture()
        let answer = try Engine.receiverReports(picture: picture(f), ident: f.reports.ident)
        #expect(answer.metar?.text == f.reports.metar)
        #expect(answer.taf?.text == f.reports.taf)
    }

    @Test func theReceiversTrafficComesFirstAsTheMapDrawsIt() throws {
        let f = try fixture()
        let p = try picture(f)
        let internet = [TrafficAircraft(altitudeFt: 4500, callsign: "UAL1", hex: "c0ffee", lat: 42, lon: -88, seenS: 3),
                        TrafficAircraft(altitudeFt: 5100, callsign: "N825V", hex: "ab4549", lat: 44.9, lon: -123, seenS: 4)]
        let heard: [EngineContract.HeardPlane] = try Engine.recoded(internet, encoder: Planner.snakeEncoder)
        let merged = try Engine.receiverTraffic(picture: p, internet: heard, ownFt: f.traffic.ownFt, at: f.datagrams[1].at)
        let planes: [TrafficAircraft] = try Engine.recoded(merged)
        #expect(planes.map(\.hex) == ["ab4549", "c0ffee"])
        // 5,000 ft pressure altitude, own ship 3,200 ft by GPS at 3,000 ft
        // pressure altitude: 5,200 ft on own ship's scale.
        #expect(planes[0].altitudeFt == 5200)
        #expect(planes[0].pressureAltitude == false)
        #expect(planes[0].callsign == "N825V")
    }

    @Test func theNexradBecomesOneOverlayALevel() throws {
        let nexrad = try Engine.receiverNexrad(picture: picture(fixture()))
        let overlays = NexradMapLayer.overlays(nexrad)
        #expect(overlays.map(\.level) == [3, 5])
        #expect(NexradMapLayer.overlays(nil).isEmpty)
    }
}
