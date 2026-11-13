import Foundation
import Testing
@testable import Wingtip

/// Ask's stream folded into the conversation, as AskView shows it
/// (Assistant.swift).
struct AssistantTests {
    static let source = AssistantSource(id: "metar:KMSN", label: "KMSN METAR 1852Z", text: "KMSN 031852Z 27012KT 10SM CLR 18/07 A3012")
    static let stream: [AssistantLine] = [
        .origin("On this iPhone"),
        .text("KMSN is "),
        .text("VFR: wind 270 at 12, "),
        .text("visibility 10, clear below 12,000."),
        .sources([source]),
        .done,
    ]

    @Test func theStreamBecomesOneAnswerWithItsSources() {
        var conversation = AssistantConversation()
        conversation.ask("What's the weather at KMSN?")
        #expect(conversation.answering && conversation.turns.count == 2)
        for line in Self.stream { conversation.take(line) }
        #expect(!conversation.answering)
        let answer = conversation.turns[1]
        #expect(answer.role == .assistant)
        #expect(answer.origin == "On this iPhone")
        #expect(answer.content == "KMSN is VFR: wind 270 at 12, visibility 10, clear below 12,000.")
        #expect(answer.sources.map(\.id) == ["metar:KMSN"])
        #expect(answer.problem == nil)
    }

    @Test func anErrorLineIsSaidUnderTheAnswer() {
        var conversation = AssistantConversation()
        conversation.ask("Brief me")
        conversation.take(.text("Winds aloft "))
        conversation.take(.error("The winds aloft could not be had."))
        #expect(!conversation.answering)
        #expect(conversation.turns.last?.content == "Winds aloft ")
        #expect(conversation.turns.last?.problem == "The winds aloft could not be had.")
    }

    @Test func aRetractWithdrawsWhatCameBeforeIt() {
        var conversation = AssistantConversation()
        conversation.ask("glide?")
        conversation.take(.text("About 6 nm."))
        conversation.take(.sources([Self.source]))
        conversation.take(.retract)
        #expect(conversation.turns.last?.content == "" && conversation.turns.last?.sources == [])
    }
}
