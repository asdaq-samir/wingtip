import Foundation
import Observation

/// An airplane's profile by its N-number (AirplaneProfileView): its
/// registration and type from the FAA's registry, and every figure with
/// where it comes from -- the type's book, its photographed handbook page,
/// or the pilot (the engine's airplane_figures) -- each the pilot's to
/// change. The first change makes the pilot's own record of the N-number,
/// from its type's book figures; theirs then stand over the book's for
/// that N-number alone, each with Reset to Book Figure. Signed out, kept on
/// this device and offered to the account at sign-in (the owner,
/// 2026-11-09).
@MainActor
@Observable
final class AirplaneProfileModel {
    let tail: String
    private(set) var registration: AircraftRegistration?
    /// The planner's stock profile for its registered type; nil for a type
    /// it has none for, flown on the pilot's figures alone.
    private(set) var stock: String?
    private(set) var loaded = false
    /// The pilot's own figures for it, as kept.
    private(set) var own = Figures()
    /// The figures as typed, before each is saved.
    var drafts: [OwnFigure: String] = [:]
    private(set) var saving = false
    private(set) var problem: String?
    /// Where the last change went, said under the figures.
    private(set) var kept: FiguresKept?
    private let airplanes: Airplanes

    init(tail: String, airplanes: Airplanes = .shared) {
        self.tail = tail.uppercased()
        self.airplanes = airplanes
    }

    /// The registry, the books and the pilot's record, asked together.
    func load(signedIn: Bool) async {
        async let books: Void = airplanes.loadBooks()
        async let records: Void = airplanes.loadRecords(signedIn: signedIn)
        registration = try? await Planner.registered(tail)
        _ = await (books, records)
        stock = registration.flatMap { try? Registered.profile(manufacturer: $0.manufacturer, model: $0.model, year: $0.year) }
        own = airplanes.record(tail).map(Figures.init) ?? OwnFigureStore.load(tail)
        refigure()
        loaded = true
    }

    /// Its type in words, from the registry: "Piper PA-28-140, 1968".
    var typeLine: String? {
        guard let r = registration else { return nil }
        let name = [r.manufacturer, r.model].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: " ")
        return [name.isEmpty ? nil : name, r.year.map(String.init)].compactMap { $0 }.joined(separator: ", ").nonEmpty
    }

    /// The profile the planner flies it on, as named to the planner.
    var aircraft: String { stock ?? Plan.ownAirplane }

    /// Every figure, its value, its source and the book's (the engine's
    /// airplane_figures), worked out again as the figures change.
    private(set) var figures: [EngineContract.AirplaneFiguresAnswerFiguresItem] = []

    private func refigure() {
        let book = stock.flatMap { airplanes.books[$0] }
        let handbook = Airplanes.handbook(airplanes.record(tail)?.handbook)
        figures = Airplanes.answer(book: book, handbook: handbook, own: own)?.figures ?? []
    }

    /// The figure's row, for its source and book figure.
    func item(_ figure: OwnFigure) -> EngineContract.AirplaneFiguresAnswerFiguresItem? {
        figures.first { $0.key == figure.rawValue }
    }

    /// The text a field shows: the draft while typed, else the figure.
    func text(_ figure: OwnFigure) -> String {
        drafts[figure] ?? item(figure)?.value.map(Format.tenths) ?? ""
    }

    /// A typed figure saved as the pilot's own: an empty field is the
    /// book's figure again; a figure not a number above zero is said, and
    /// nothing saved.
    func commit(_ figure: OwnFigure, plan: Plan, signedIn: Bool) async {
        guard let typed = drafts[figure] else { return }
        let trimmed = typed.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return await reset(figure, plan: plan, signedIn: signedIn) }
        guard let value = AskFigureModel.number(trimmed) else {
            problem = "\(figure.label) must be a number above zero."
            return
        }
        drafts[figure] = nil
        guard value != item(figure)?.value else { return }
        var next = own
        next[figure] = value
        await save(next, plan: plan, signedIn: signedIn)
    }

    /// Every typed figure saved in one go (a photo's read, confirmed).
    func commitDrafts(plan: Plan, signedIn: Bool) async {
        var next = own
        for (figure, typed) in drafts {
            guard let value = AskFigureModel.number(typed) else {
                problem = "\(figure.label) must be a number above zero."
                return
            }
            next[figure] = value
        }
        drafts = [:]
        guard next != own else { return }
        await save(next, plan: plan, signedIn: signedIn)
    }

    /// The type's book figure back in place of the pilot's: theirs is set to
    /// the book's, which airplane_figures reads as the book's.
    func reset(_ figure: OwnFigure, plan: Plan, signedIn: Bool) async {
        drafts[figure] = nil
        var next = own
        next[figure] = item(figure)?.book
        await save(next, plan: plan, signedIn: signedIn)
    }

    /// Whether the figure is the pilot's over a book figure to go back to.
    func resettable(_ figure: OwnFigure) -> Bool {
        guard let item = item(figure) else { return false }
        return item.source == "pilot" && item.book != nil
    }

    private func save(_ next: Figures, plan: Plan, signedIn: Bool) async {
        saving = true
        defer { saving = false }
        do {
            let (saved, kept) = try await airplanes.save(next, tail: tail, aircraft: aircraft, type: nil, signedIn: signedIn)
            own = saved
            refigure()
            self.kept = kept
            problem = nil
            plan.took(saved, for: tail)
        } catch {
            problem = "The figures couldn't be saved: \(error.localizedDescription)"
        }
    }

    /// What the page says of where the figures are kept.
    func keptWords(signedIn: Bool) -> String? {
        if case .device(let why)? = kept, let why { return why }
        return signedIn ? nil : "Kept on this iPhone; offered to your account when you sign in."
    }
}
