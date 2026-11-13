import Foundation
import OpenAPIRuntime
import SwiftUI
import Testing
import UIKit
@testable import Wingtip

private final class DocumentsFixtureBundle {}

/// The reader's answers for the shared pages
/// (apps/web/src/lib/fixtures/documentAnswers.json), each as the bytes
/// OnDeviceDocumentReader.answer writes.
private func answer(_ key: String) throws -> DocumentAnswer {
    let url = try #require(Bundle(for: DocumentsFixtureBundle.self).url(forResource: "documentAnswers", withExtension: "json"))
    let all = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    let one = try #require(all[key])
    return try DocumentAnswer(data: JSONSerialization.data(withJSONObject: one))
}

private func member(_ value: OpenAPIValueContainer?, _ key: String) -> OpenAPIValueContainer? {
    guard let object = value?.value as? [String: (any Sendable)?], let member = object[key] else { return nil }
    return try? OpenAPIValueContainer(unvalidatedValue: member)
}

private func list(_ value: OpenAPIValueContainer?) -> [OpenAPIValueContainer]? {
    (value?.value as? [(any Sendable)?])?.compactMap { try? OpenAPIValueContainer(unvalidatedValue: $0) }
}

private func count(_ value: OpenAPIValueContainer?) -> Int? { list(value)?.count }

/// A member there and null, not one left out.
private func isNull(_ value: OpenAPIValueContainer?) -> Bool { value != nil && value?.value == nil }

/// "Add from a Photo" on the phone (Wingtip/Documents): the reader's
/// answers decoded, the photo made small, the read cut to what the pilot confirmed and
/// checked again by the engine, the logbook rows that can be logged, and
/// the flags' inks. No network.
@MainActor
struct DocumentsTests {
    @Test func everyAnswerIsDecodedAsTheReaderSendsIt() throws {
        let handbook = try answer("handbook")
        #expect(handbook.read.kind == "poh-performance")
        let check = try #require(handbook.read.handbookCheck)
        #expect(check.items.map(\.key).prefix(3) == ["cruise.0", "cruise.1", "cruise.2"])
        #expect(check.profile.cruiseTasKt == 113)
        #expect(check.profile.usableFuelGal == 53)
        // The JSON keeps what the generated model drops: the distance over
        // 50 ft the engine checks against the ground roll.
        let takeoff = member(handbook.handbook, "takeoff")
        guard let rows = list(takeoff) else { Issue.record("no takeoff rows"); return }
        #expect(member(rows.first, "over_obstacle")?.number == 1510)

        let misread = try #require(try answer("misread").read.handbookCheck)
        #expect(misread.items.contains { $0.flags.contains { $0.level == "wrong" } })

        let logbook = try #require(try answer("logbook").read.logbookCheck)
        #expect(logbook.rows.count == 3)
        #expect(logbook.rows[0].entry.flownOn == "2026-10-03")

        let wrong = try #require(try answer("logbookWrong").read.logbookCheck)
        #expect(wrong.rows[1].entry.flownOn == nil)
        #expect(!wrong.flags.isEmpty)

        let note = try #require(try answer("clearance").read.clearance)
        #expect(note.said.hasPrefix("Cleared to KDLH"))
        #expect(note.written.contains("SQ 4521"))
    }

    @Test func theReadIsCutToTheConfirmedItems() throws {
        let read = try #require(try answer("handbook").handbook)
        let cut = HandbookReview.confirmedOnly(read, keys: ["cruise.2", "fuel", "takeoff.1"])
        #expect(count(member(cut, "cruise")) == 1)
        guard let cruise = list(member(cut, "cruise")) else { Issue.record("no cruise rows"); return }
        #expect(member(cruise.first, "tas")?.number == 113)
        #expect(count(member(cut, "takeoff")) == 1)
        #expect(count(member(cut, "landing")) == 0)
        #expect(count(member(cut, "envelope")) == 0)
        #expect(isNull(member(cut, "climb")))
        #expect(isNull(member(cut, "glide")))
        #expect(isNull(member(cut, "empty")))
        #expect(isNull(member(cut, "max_takeoff_weight")))
        #expect(!isNull(member(cut, "fuel")))

        // The engine's answer for what is left: the form's figures from the
        // one cruise row and the fuel, and nothing of the climb.
        let check = try HandbookReview.check(cut)
        #expect(check.profile.cruiseTasKt == 113)
        #expect(check.profile.usableFuelGal == 53)
        #expect(check.profile.climbFuelBurnGph == nil)
        let saved = HandbookReview.gateway(check.handbook)
        #expect(saved.cruise.count == 1)
        #expect(saved.envelope.isEmpty)
        #expect(saved.climbSpeedKias == nil)
    }

    @Test func anEditedFigureIsCheckedAgainOnThePhone() throws {
        let read = try #require(try answer("handbook").handbook)
        let edited = HandbookReview.setting(read, path: "cruise.2.tas", to: 115)
        let check = try HandbookReview.check(edited)
        let tas = check.items.first { $0.key == "cruise.2" }?.figures.first { $0.path == "cruise.2.tas" }
        #expect(tas?.value == 115)
        #expect(HandbookReview.setting(read, path: "cruise.9.tas", to: 1) == read)
        #expect(member(HandbookReview.setting(read, path: "max_takeoff_weight", to: 2550), "max_takeoff_weight")?.number == 2550)
    }

    @Test func theFormTakesOnlyTheProfilesFiguresToATenth() {
        var form = AircraftForm()
        form.climbFuelBurnGph = "12"
        HandbookReview.fill(&form, from: HandbookProfile(cruiseTasKt: 112.96, fuelBurnGph: 8.5, cruisePowerPct: 65,
                                                         cruiseFrom: "cruise.2", climbFuelBurnGph: nil, usableFuelGal: nil))
        #expect(form.cruiseTasKt == "113.0")
        #expect(form.fuelBurnGph == "8.5")
        #expect(form.cruisePowerPct == "65")
        #expect(form.climbFuelBurnGph == "12")
        #expect(form.usableFuelGal == "")
    }

    @Test func aSecondPageAddsToTheFirst() throws {
        let check = try #require(try answer("handbook").read.handbookCheck)
        let performance = HandbookReview.gateway(check.handbook)
        var balance = performance
        balance.cruise = []
        balance.emptyWeightLb = 1700
        balance.climbSpeedKias = nil
        let both = HandbookReview.merged(performance, balance)
        #expect(both.cruise == performance.cruise)
        #expect(both.emptyWeightLb == 1700)
        #expect(both.climbSpeedKias == performance.climbSpeedKias)
    }

    @Test func thePhotoIsMadeSmallEnough() throws {
        let big = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 1000), format: {
            let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f
        }()).image { ctx in
            UIColor.white.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 3000, height: 1000))
        }
        let jpeg = try #require(DocumentReader.jpeg(big))
        let back = try #require(UIImage(data: jpeg))
        #expect(back.size.width == 2000 && back.size.height == 667)

        // A small photo is never made larger.
        let small = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 20)).image { _ in }
        let smallBack = try #require(DocumentReader.jpeg(small).flatMap(UIImage.init(data:)))
        #expect(max(smallBack.size.width, smallBack.size.height) <= 40 * small.scale)
    }

    @Test func aLogbookRowWithNoDateCannotBeConfirmed() throws {
        let model = LogbookPhotoModel()
        model.take(try answer("logbookWrong"))
        #expect(!LogbookPhotoModel.canConfirm(model.rows[1]))
        model.setConfirmed(1, true)
        #expect(!model.isConfirmed(1))
        #expect(LogbookPhotoModel.request(model.rows[1].entry) == nil)
        model.setConfirmed(0, true)
        #expect(model.toLog == [0])
    }

    @Test func onlyTheConfirmedFlightsAreLoggedAndNoneTwice() async throws {
        let model = LogbookPhotoModel()
        model.take(try answer("logbook"))
        model.setConfirmed(0, true)
        model.setConfirmed(2, true)
        var sent: [LogbookEntryRequest] = []
        var refuse = true
        // The first try is refused at the second row; the second logs only it.
        let first = await model.logConfirmed { e in
            if e.route == "KANE KFCM KANE", refuse { refuse = false; throw Planner.Failure(status: 500, detail: "Down") }
            sent.append(e)
        }
        #expect(!first)
        #expect(model.problem?.contains("Flight 3") == true)
        let second = await model.logConfirmed { sent.append($0) }
        #expect(second)
        #expect(sent.map(\.route) == ["KANE KSTC", "KANE KFCM KANE"])
        #expect(sent[0].flownOn == "2026-10-03" && sent[0].dayLandings == 1 && sent[0].totalHours == 1.4)
        #expect(model.toLog.isEmpty)
    }

    @Test func flagsAreInkedByLevel() {
        #expect(FlagTone(level: "wrong") == .wrong)
        #expect(FlagTone(level: "check") == .check)
        #expect(FlagTone(level: "wrong").color == WingtipInk.problem)
        #expect(FlagTone(level: "check").color == WingtipInk.caution)
    }

    @Test func theReadersRefusalsAreSaidInItsWords() {
        #expect(DocumentReader.words(for: Planner.Failure(status: 503, detail: "The reader declined this page.")) == "The reader declined this page.")
        #expect(DocumentReader.words(for: Planner.Failure(status: 502, detail: nil)) == "The figures read could not be checked.")
        #expect(DocumentReader.words(for: Planner.Failure(status: 413, detail: nil)) == "That photo is too large to send.")
    }
}
