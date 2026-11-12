import Observation
import OpenAPIRuntime
import UIKit

/// The airplane form's "Add from a Photo": the page asked for, read, and
/// each of the engine's items confirmed by the pilot before any figure
/// reaches the form. Nothing is saved here; the form saves on its own Save.
@MainActor
@Observable
final class HandbookPhotoModel {
    let reader = DocumentReadModel()
    var kind: DocumentKind = .pohPerformance
    /// The read as the reader sent it, with the pilot's edits written in.
    private(set) var page: OpenAPIValueContainer?
    /// The engine's check of `page`: the reader's at first, the phone's own
    /// once a figure is edited.
    private(set) var check: ASHandbookCheck?
    /// The items the pilot confirmed against the page, by key ("cruise.2").
    private(set) var confirmed: Set<String> = []
    /// What the engine could not check, said in the review.
    var problem: String?
    var reviewing = false

    var notes: DocumentRead? { reader.answer?.read }
    var canUse: Bool { !confirmed.isEmpty && check != nil }

    func read(_ image: UIImage) {
        reader.read(kind, image: image) { [weak self] answer in self?.take(answer) }
    }

    /// An answer come back: its items to review, none confirmed.
    func take(_ answer: DocumentAnswer) {
        page = answer.handbook
        check = answer.read.handbookCheck
        confirmed = []
        problem = nil
        reviewing = true
    }

    func isConfirmed(_ key: String) -> Bool { confirmed.contains(key) }

    func setConfirmed(_ key: String, _ on: Bool) {
        if on { confirmed.insert(key) } else { confirmed.remove(key) }
    }

    /// A figure the pilot corrected against the page, in the page's unit,
    /// and the engine's check asked again on the phone. An item edited is
    /// left as the pilot confirmed it or not.
    func edit(_ path: String, to value: Double) {
        guard let page else { return }
        let edited = HandbookReview.setting(page, path: path, to: value)
        do {
            check = try HandbookReview.check(edited)
            self.page = edited
            problem = nil
        } catch {
            problem = "The figures couldn't be checked: \(error.localizedDescription)"
        }
    }

    /// The engine's answer for the confirmed items alone: its profile for
    /// the form, its figures to save with the airplane.
    func confirmedCheck() throws -> ASHandbookCheck {
        guard let page else { throw Engine.Refused(message: "No page was read.") }
        return try HandbookReview.check(HandbookReview.confirmedOnly(page, keys: confirmed))
    }

    func close() {
        reviewing = false
        reader.cancel()
    }
}
