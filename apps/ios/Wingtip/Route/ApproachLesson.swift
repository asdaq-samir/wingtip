import Foundation

/// An approach picked on FPL's line, opened from its head row's menu
/// (TimelineProcedureRows, ApproachMenuItems): its brief or its dry run,
/// the two pages of one sheet (ApproachLessonSheet), as the web's Learn
/// This Approach opens Brief and Fly on one card (ApproachLesson).
struct ApproachLessonAsk: Identifiable, Equatable {
    enum Page: String, CaseIterable, Identifiable {
        case brief, dryRun
        var id: String { rawValue }
        var title: String { self == .brief ? "Brief" : "Dry Run" }
    }

    let pick: ProcedurePick
    var page: Page
    var id: String { "\(pick.ident):\(pick.id):\(pick.transition ?? "")" }
}

/// What the sheet shows of the approach, every word and figure the
/// engine's, from the FAA's coded procedure as the planner draws it (the
/// CIFP, /api/airport/{ident}/procedures/{id}) and the field's radio:
/// the brief an instructor has a student give before the approach
/// (approach_brief: FAA-H-8083-16B chapter 4, the plate's briefing strip
/// and plan view; what the coded data does not hold, the minimums above
/// all, is "See the plate"), and the dry run, the approach flown fix by
/// fix with a word at each (approach_coaching), at the ground speed the
/// pilot picks. A training aid: the plate is what is flown.
@MainActor @Observable
final class ApproachLesson {
    /// The ground speeds to fly the final at, kt: a discrete setting, so
    /// a segmented control (the app's iOS rules), as the web's lesson
    /// offers them, 90 to start, the pilot's to change.
    static let speeds: [Double] = [70, 90, 120]

    private(set) var brief: [EngineContract.ApproachBriefAnswerItem] = []
    private(set) var steps: [EngineContract.ApproachCoachingAnswerItem] = []
    private(set) var name: String?
    /// Why the approach could not be had or worked out, said on the sheet.
    private(set) var problem: String?
    private(set) var loading = false
    /// The dry run's step on the sheet, and its ground speed.
    var step = 0
    var gsKt: Double = 90 {
        didSet { coach() }
    }

    private var drawing: EngineContract.ProcedureDrawing?

    /// The approach drawn and its field's radio read, then briefed and
    /// coached by the engine; a field whose card cannot be had is briefed
    /// with no frequencies, never made up.
    func load(_ pick: ProcedurePick) async {
        loading = true
        defer { loading = false }
        do {
            let drawing = try await CoachApproaches.drawing(pick.ident, procedure: pick.id, transition: pick.transition)
            let frequencies = ((try? await Planner.place(pick.ident))?.frequencies ?? [])
                .map { EngineContract.FieldFrequency(type: $0.type, description: $0.description, frequencyMhz: $0.frequencyMhz) }
            self.drawing = drawing
            name = drawing.name
            brief = try Engine.approachBrief(drawing: drawing, frequencies: frequencies)
            problem = nil
            coach()
        } catch {
            problem = "The \(pick.name) couldn't be had: \(error.localizedDescription)"
        }
    }

    /// The dry run's steps at the ground speed picked, from the first again.
    private func coach() {
        guard let drawing else { return }
        do {
            steps = try Engine.approachCoaching(drawing: drawing, gsKt: gsKt)
            step = min(step, max(steps.count - 1, 0))
        } catch {
            steps = []
            problem = "The dry run couldn't be worked out: \(error.localizedDescription)"
        }
    }
}
