import Foundation
import Observation

/// An airport card's live reports, its one model: the field's D-ATIS read
/// by the engine (read_datis), each runway's RVR judged against the
/// pilot's visibility minimum (rvr_check), and the Command Center's
/// programs at it -- asked again while the card is open, as the web's
/// queries refetch (lib/liveReports): RVR each minute, as it is made
/// (AIM 7-1-13), the programs every five. A report the planner has none
/// of shows nothing; one that fails leaves the card as it was.
@MainActor
@Observable
final class AirportLive {
    /// One D-ATIS broadcast: its title, the engine's reading, the words as sent.
    struct Broadcast: Identifiable, Equatable {
        let id: String
        let title: String
        let reading: Atis?
        let text: String
    }

    private(set) var ident: String?
    private(set) var broadcasts: [Broadcast] = []
    private(set) var rvr: [LiveWords.RvrRow] = []
    private(set) var programs: [String] = []
    /// What the engine refused of a report, said under it.
    private(set) var problem: String?

    /// How often the reports are asked again while the card is open, s.
    static let rvrEveryS: Double = 60
    static let flowEveryS: Double = 300

    /// The reports for a field, asked again until the task is cancelled
    /// (the card closed or another field opened).
    func watch(_ ident: String, minimumSm: Double?) async {
        if self.ident != ident {
            self.ident = ident
            broadcasts = []
            rvr = []
            programs = []
            problem = nil
        }
        async let datis: Void = loadDatis(ident)
        var flowAt = Date.distantPast
        while !Task.isCancelled {
            await loadRvr(ident, minimumSm: minimumSm)
            if Date().timeIntervalSince(flowAt) >= Self.flowEveryS {
                flowAt = Date()
                await loadFlow(ident)
            }
            try? await Task.sleep(for: .seconds(Self.rvrEveryS))
        }
        await datis
    }

    func loadDatis(_ ident: String) async {
        guard let answer = try? await Planner.liveAtis(ident), self.ident == ident else { return }
        broadcasts = Self.broadcasts(answer)
    }

    func loadRvr(_ ident: String, minimumSm: Double?) async {
        guard let answer = try? await Planner.liveRvr(ident), self.ident == ident else { return }
        do {
            rvr = try LiveWords.rvrRows(answer.runways, minimumSm: minimumSm)
        } catch {
            problem = "The runway visual range couldn't be judged: \(error.localizedDescription)"
        }
    }

    func loadFlow(_ ident: String) async {
        guard let answer = try? await Planner.liveFlow([ident]), self.ident == ident else { return }
        programs = LiveWords.programLines(answer)
    }

    /// Each broadcast read by the engine; one it cannot read keeps its
    /// words as sent with no figures.
    static func broadcasts(_ answer: AirportDatis) -> [Broadcast] {
        answer.broadcasts.map { b in
            Broadcast(id: b.which ?? "both", title: LiveWords.datisTitle(which: b.which, letter: b.letter),
                      reading: try? LiveWords.reading(b.text), text: b.text)
        }
    }
}
