import Foundation
import Observation

/// The ATC copilot (the web's features/atc): with the pilot's leave, the
/// radio listened to on and on while flying (ClearanceListener); each call
/// to us read by the engine into its items (atc_call), and our readback
/// after it checked against it (readback_check, AIM 4-4-7 b). Nothing is
/// set until a tap; the call's banner (RadioCallBanner) shows the card.
@MainActor
@Observable
final class AtcCopilot {
    /// Off until the pilot turns it on: Setup's Alerts (the web's ATC).
    enum Mode: String, CaseIterable, Identifiable, Sendable {
        case off, flying
        var id: String { rawValue }
        var label: String { self == .off ? "Off" : "While Flying" }
    }

    /// A call to us and what became of it.
    struct Card: Equatable {
        let id: Int
        let text: String
        let at: Date
        let items: [AtcItem]
        var readback: (said: String, check: EngineContract.ReadbackCheckAnswer)?
        /// Read Back was tapped: the next transmission heard is it.
        var awaiting = false

        static func == (a: Card, b: Card) -> Bool {
            a.id == b.id && a.items == b.items && a.awaiting == b.awaiting && a.readback?.said == b.readback?.said
        }
    }

    static let modeKey = "atcListen"
    var mode: Mode = Mode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .off {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey) }
    }

    /// The cards, newest first, as many as are kept.
    private(set) var cards: [Card] = []
    private(set) var problem: String?
    @ObservationIgnored private var read: [Int: String] = [:]
    @ObservationIgnored private var started = false
    /// The cards whose readback VoiceOver has said.
    @ObservationIgnored private var announced: Set<Int> = []

    static let kept = 4
    /// How long after a call our own transmission is still its readback, s.
    static let readbackWindowS: TimeInterval = 60

    func card(for id: Int) -> Card? { cards.first { $0.id == id } }

    /// Listening starts as the flight does and stops with it, where the
    /// copilot started it; the radio's own listening is the pilot's.
    func follow(flying: Bool, tail: String?) async {
        let listener = ClearanceListener.shared
        // Only where speech stays on the iPhone (ClearanceListener.canListen).
        let auto = mode == .flying && flying && tail != nil && listener.canListen
        if auto, !started, !listener.listening {
            started = true
            await listener.start(words: [])
        } else if !auto, started {
            started = false
            if listener.listening { listener.stop() }
        }
    }

    /// Each settled transmission into the cards, once.
    func observe(_ heard: [ClearanceListener.Transmission], tail: String?) {
        guard mode != .off else { return }
        for t in heard where t.final && read[t.id] != t.text {
            read[t.id] = t.text
            do { cards = try Self.heardInto(cards, id: t.id, text: t.text, at: t.at, tail: tail) } catch {
                problem = "Couldn't read that call: \(error.localizedDescription)"
            }
        }
        announceReadbacks()
    }

    /// Each readback's check said by VoiceOver once, as its card shows it:
    /// a pilot's eyes are outside when the readback is made.
    private func announceReadbacks() {
        for card in cards where card.readback != nil && !announced.contains(card.id) {
            announced.insert(card.id)
            if let check = card.readback?.check { Announce.alert(Self.readbackLines(check).joined(separator: ". ")) }
        }
    }

    /// The cards after one settled transmission (the web's heardInto): a
    /// call to us makes a card; our own after it, or the next after Read
    /// Back, is that card's readback, checked.
    static func heardInto(_ cards: [Card], id: Int, text: String, at: Date, tail: String?) throws -> [Card] {
        let latest = cards.first
        let open = latest.flatMap { $0.readback == nil && at.timeIntervalSince($0.at) <= readbackWindowS ? $0 : nil }
        let answer = try Engine.atcCall(text: text, tail: tail, prior: open.map { .init(text: $0.text, agoS: at.timeIntervalSince($0.at)) })
        if answer.who == "to_us" {
            return Array(([Card(id: id, text: text, at: at, items: answer.items)] + cards).prefix(kept))
        }
        if var open, answer.who == "from_us" || open.awaiting {
            open.readback = (text, try Engine.readbackCheck(cleared: open.text, said: text, tail: tail))
            open.awaiting = false
            return [open] + cards.dropFirst()
        }
        return cards
    }

    /// Read Back tapped: listening already, the next transmission is it;
    /// else the microphone listens once, from this tap.
    func readBack(_ id: Int, tail: String?) async {
        guard let i = cards.firstIndex(where: { $0.id == id }) else { return }
        cards[i].awaiting = true
        cards[i].readback = nil
        announced.remove(id)
        let listener = ClearanceListener.shared
        guard !listener.listening else { return }
        guard let said = await listener.hearOnce(), !said.isEmpty, let j = cards.firstIndex(where: { $0.id == id }) else {
            if let j = cards.firstIndex(where: { $0.id == id }) { cards[j].awaiting = false }
            return
        }
        do {
            cards[j].readback = (said, try Engine.readbackCheck(cleared: cards[j].text, said: said, tail: tail))
        } catch {
            problem = "Couldn't check the readback: \(error.localizedDescription)"
        }
        cards[j].awaiting = false
        announceReadbacks()
    }

    /// A readback's lines: complete, else each item missed or said
    /// differently, those AIM 4-4-7 b asks be read back first.
    static func readbackLines(_ check: EngineContract.ReadbackCheckAnswer) -> [String] {
        guard !check.items.isEmpty else { return ["Readback complete"] }
        let capital = { (s: String) in s.prefix(1).uppercased() + s.dropFirst() }
        return check.items.sorted { $0.required && !$1.required }.map { i in
            i.said.map { "\(capital(i.item)): \($0) said, \(i.cleared) given" } ?? "\(capital(i.item)) \(i.cleared) not read back"
        }
    }
}
