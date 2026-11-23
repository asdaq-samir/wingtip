import CoreLocation
import Foundation
import WatchConnectivity

/// The phone's end of the watch (WingtipWatch, the owner's ask of
/// 2026-11-03): the airplane's checklist and the pilot's fix handed over
/// as the application context, which WatchConnectivity keeps and delivers
/// when the watch wakes, and the watch's questions answered as messages.
/// The watch links no engine, so the nearest airports it asks for are
/// fetched here from the planner, or with no signal from the phone's
/// cycle packs (Planner.nearestOrPacks), without weather. The messages are the structs
/// in Shared/WatchMessages.swift.
@MainActor
final class WatchLink: NSObject, WCSessionDelegate {
    /// The airplane's checklist as last read, with the text it was read
    /// from, so the engine reads it again only when the text changes.
    private var checklistText: String?
    /// The checklist as the watch's own type, read once per text.
    private var watchChecklist: WatchChecklist?
    /// The last context sent, its time of sending left out, so an
    /// unchanged one is not sent again.
    private var sentContext: WatchContext?
    /// When the fix in `sentContext` was taken into it.
    private var fixSentAt = Date.distantPast

    /// The watch reads the phone's fix only to ask for the fields nearest
    /// it, where its own location does not come (NearestView): a move of
    /// about a mile, or five minutes, is a new answer worth waking it for.
    /// Each second's fix made every context new, and one was sent every 5 s.
    static let fixMoveNm = 1.0
    static let fixEveryS: TimeInterval = 5 * 60

    override init() { super.init() }

    /// Whether this build carries the watch app, in the app's Watch folder.
    /// It is parked and left out of the iPhone's build (project.yml; the
    /// feature review, 2026-11-21), and without it no session is
    /// activated, nothing is sent and nothing is answered.
    nonisolated static var bundled: Bool {
        FileManager.default.fileExists(atPath: Bundle.main.bundleURL.appending(path: "Watch").path(percentEncoded: false))
    }

    /// Activated, then kept up: every few seconds the picked airplane's
    /// checklist (kept on this phone) and the fix are sent,
    /// where the phone has a paired watch with the app on it. Returns
    /// only when the task that runs it is cancelled.
    func run(plan: Plan, ownShip: OwnShip) async {
        guard WCSession.isSupported(), Self.bundled else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        await Repeating.every(5) { [weak self] in await self?.sync(plan: plan, ownShip: ownShip) }
    }

    private func sync(plan: Plan, ownShip: OwnShip) async {
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        // The airplane's normal checklist as kept on this phone
        // (LocalChecklists), by its N-number, else its type.
        let text = LocalChecklists.text(for: LocalChecklists.airplane(of: plan), .normal)
        if text != checklistText {
            checklistText = text
            // One the engine cannot read is not sent; the phone's own
            // checklist screen says why (ChecklistModel.problem). Re-read
            // as the watch's own type, from the same JSON: one shape, two
            // compiled copies.
            let checklist = text.isEmpty ? nil : try? ChecklistText.parse(text)
            watchChecklist = checklist.flatMap { c -> WatchChecklist? in
                guard let data = try? JSONEncoder().encode(c) else { return nil }
                return try? JSONDecoder().decode(WatchChecklist.self, from: data)
            }
        }
        let now = Date()
        let fresh = ownShip.fix.map {
            WatchFix(lat: $0.coordinate.latitude, lon: $0.coordinate.longitude, altitudeFt: $0.altitudeFt,
                     trackDeg: $0.trackDeg, groundspeedKt: $0.groundspeedKt, at: $0.at)
        }
        let fix = Self.fixToSend(fresh, sent: sentContext?.fix, sentAt: fixSentAt, now: now)
        // Compared without the time of sending, which is always new.
        let same = WatchContext(tail: plan.tail, checklist: watchChecklist, fix: fix, sentAt: .distantPast)
        guard same != sentContext else { return }
        var context = same
        context.sentAt = now
        guard let data = try? WatchCoding.encoder.encode(context) else { return }
        do {
            try session.updateApplicationContext([WatchMessageKey.context: data])
            if fix != sentContext?.fix { fixSentAt = now }
            sentContext = same
        } catch {
            // Sent again next tick; a watch out of reach is not a problem
            // the pilot can act on.
        }
    }

    /// The fix to send: the last one sent until the airplane has moved
    /// `fixMoveNm` from it (the engine's distance_nm) or `fixEveryS` has
    /// passed; none once own ship has none.
    static func fixToSend(_ fresh: WatchFix?, sent: WatchFix?, sentAt: Date, now: Date) -> WatchFix? {
        guard let fresh, let sent, now.timeIntervalSince(sentAt) < fixEveryS,
              let moved = try? Flight.distanceNm(CLLocationCoordinate2D(latitude: sent.lat, longitude: sent.lon),
                                                 CLLocationCoordinate2D(latitude: fresh.lat, longitude: fresh.lon)),
              moved < fixMoveNm else { return fresh }
        return sent
    }

    /// The watch's question answered from the planner. The handler is
    /// called on whichever queue WatchConnectivity holds, so the answer is
    /// handed back from a detached task rather than the main actor.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        guard let data = message[WatchMessageKey.nearest] as? Data,
              let request = try? WatchCoding.decoder.decode(NearestRequest.self, from: data) else {
            replyHandler([:])
            return
        }
        // WatchConnectivity's reply handler may be called once from any
        // thread (Apple's documentation of session(_:didReceiveMessage:
        // replyHandler:)); the task below is its only caller, so handing
        // it over is safe though the SDK does not mark it Sendable.
        nonisolated(unsafe) let reply = replyHandler
        Task {
            let nearest = await WatchLink.nearest(request)
            let answer = (try? WatchCoding.encoder.encode(nearest)) ?? Data()
            reply([WatchMessageKey.nearest: answer])
        }
    }

    nonisolated static func nearest(_ request: NearestRequest) async -> NearestReply {
        do {
            // With no planner, the phone's packs (PackFields), without weather.
            let fields = try await Planner.nearestOrPacks(lat: request.lat, lon: request.lon, limit: request.limit).fields
            let airports = fields.map {
                WatchAirport(ident: $0.ident, name: $0.name, lat: $0.lat, lon: $0.lon,
                             distanceNm: $0.distanceNm, bearingDeg: $0.bearingDeg, flightCategory: $0.flightCategory)
            }
            return NearestReply(airports: airports, problem: nil)
        } catch {
            return NearestReply(airports: [], problem: Problems.say(Wording.plannerNotReached, error))
        }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: (any Error)?) {}

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// A watch swapped for another: the session is activated again for
    /// the new one, as Apple asks.
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
