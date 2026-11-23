import Foundation
import WingtipEngine

/// A receiver's picture held by the engine between reads (the engine's
/// ReceiverSession, engine/bindings/ffi): each second only the bytes heard
/// go over, and only the receiver, own ship, its traffic and a revision of
/// the FIS-B texts and NEXRAD come back (`receiver_delta`), so the
/// hundreds of kB of FIS-B the picture keeps never cross. The traffic
/// merged, a field's reports and the NEXRAD are asked of it when the
/// screens want them. Sendable: the session's own lock guards the
/// picture, and the class holds nothing else; the generated class is the
/// handle, and the engine lets the picture go with the last reference.
final nonisolated class HeldPicture: Sendable {
    private let session = ReceiverSession()

    /// The bytes heard read into the picture at `now`.
    func read(_ bytes: Data, at now: Date) throws -> EngineContract.ReceiverDeltaAnswer {
        try Engine.held("receiver_delta") { try session.read(data: bytes, at: now.timeIntervalSince1970) }
    }

    /// The traffic to draw, the receiver's airplanes first and then the
    /// internet's it does not hear (`receiver_traffic`).
    func traffic(_ internet: [EngineContract.HeardPlane], ownFt: Double?, at now: Date) throws -> [EngineContract.HeardPlane] {
        let heard = try String(decoding: Engine.encoder.encode(internet), as: UTF8.self)
        return try Engine.held("receiver_traffic") { try session.traffic(internet: heard, ownFt: ownFt, at: now.timeIntervalSince1970) }
    }

    /// A field's METAR and TAF as FIS-B sent them (`receiver_reports`).
    func reports(_ ident: String) throws -> EngineContract.ReceiverReportsAnswer {
        try Engine.held("receiver_reports") { try session.reports(ident: ident) }
    }

    /// The NEXRAD as rectangles of each level (`receiver_nexrad`).
    func nexrad() throws -> EngineContract.ReceiverNexradAnswer {
        try Engine.held("receiver_nexrad") { try session.nexrad() }
    }
}
