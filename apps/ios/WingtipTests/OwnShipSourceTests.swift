import Foundation
import Testing
@testable import Wingtip

/// Own ship from each supported receiver as the phone asks the engine
/// (`receiver_position`), against the shared fixture
/// (apps/web/src/lib/fixtures/gdl90-receivers.json): the source and the
/// fix through the generated types, then OwnShip taking the receiver's
/// fix and letting it go.
private final class FixtureBundle {}

private struct Receivers: Decodable {
    struct Expect: Decodable { let source: String; let receiver: String; let altitudeFt: Double?; let ellipsoidFt: Double? }
    struct Sample: Decodable { let receiver: String; let hex: String; let expect: Expect }
    let at: Double
    let receivers: [Sample]
}

private func fixture() throws -> Receivers {
    let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "gdl90-receivers", withExtension: "json"))
    return try Planner.snakeCase.decode(Receivers.self, from: Data(contentsOf: url))
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

private func read(_ sample: Receivers.Sample, at: Double) throws -> EngineContract.ReceiverPicture {
    try Engine.receiverRead(data: bytes(sample.hex).base64EncodedString(), at: at, picture: nil)
}

@MainActor
struct OwnShipSourceTests {
    @Test func eachReceiverIsWeighedAsTheEngineSays() throws {
        let f = try fixture()
        let now = Date(timeIntervalSince1970: f.at)
        for sample in f.receivers {
            let picture = try read(sample, at: f.at)
            let weighed = try #require(OwnShipSource.weigh(own: picture.ownship, receiver: picture.receiver, device: nil, was: .device, now: now))
            #expect(weighed.source.rawValue == sample.expect.source, "\(sample.receiver)")
            #expect(weighed.receiver == sample.expect.receiver, "\(sample.receiver)")
            if weighed.source == .receiver {
                // MSL heights are own ship's; above the ellipsoid none, as
                // iOS has no geoid to put them on.
                #expect(weighed.fix?.altitudeFt == sample.expect.altitudeFt, "\(sample.receiver)")
                #expect(weighed.fix?.coordinate.latitude ?? 0 > 41.9)
            } else {
                #expect(weighed.fix == nil)
            }
        }
    }

    @Test func ownShipTakesTheReceiversFixAndLetsItGo() throws {
        let f = try fixture()
        let sentry = try #require(f.receivers.first { $0.receiver == "sentry" })
        let picture = try read(sentry, at: Date().timeIntervalSince1970)
        let ownShip = OwnShip()
        // A Wi-Fi iPad: no fix of its own, so the Sentry's.
        ownShip.fromReceiver(picture.ownship, picture.receiver)
        #expect(ownShip.weighed?.source == .receiver)
        #expect(ownShip.fix?.altitudeFt == 3200)
        // The receiver turned off: no position at all, never the old one.
        ownShip.fromReceiver(nil, nil)
        #expect(ownShip.weighed == nil)
        #expect(ownShip.fix == nil)
    }

    @Test func theWordsSayWhosePositionItIs() {
        let using = OwnShipSource.Weighed(source: .receiver, receiver: "good", fix: nil)
        #expect(OwnShipSource.words(using, name: "Stratux") == "Your position from Stratux")
        let weak = OwnShipSource.Weighed(source: .device, receiver: "weak", fix: nil)
        #expect(OwnShipSource.words(weak, name: "Sentry") == "Sentry's GPS too weak to show")
        #expect(OwnShipSource.words(OwnShipSource.Weighed(source: .device, receiver: "stale", fix: nil), name: "Sentry") == nil)
    }
}
