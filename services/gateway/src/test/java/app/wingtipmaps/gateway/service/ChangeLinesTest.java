package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.assistant.model.AssistantChangesWords;
import app.wingtipmaps.gateway.assistant.model.AssistantSentence;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import org.junit.jupiter.api.Test;

/** The flight watch's lines while the Claude features are off: each change
 *  the planner found is a sentence of its own heading, citing it; the
 *  flight itself is a source but not a change; none found is no change. */
class ChangeLinesTest {

    @Test
    void eachChangeIsItsHeadingCitingIt() {
        AssistantChangesWords answer = ChangeLines.lines(sources("""
                {"sources": [
                  {"id": "flight:route", "label": "The flight", "text": "From C81 to KDLH."},
                  {"id": "metar:KDLH", "label": "KDLH METAR, VFR to IFR", "text": "Was: KDLH ...\\nNow: KDLH ..."}
                ]}"""));
        assertThat(answer.getChanged()).isTrue();
        assertThat(answer.getSentences())
                .extracting(AssistantSentence::getText)
                .containsExactly("KDLH METAR, VFR to IFR.");
        assertThat(answer.getSentences().get(0).getSources()).containsExactly("metar:KDLH");
        assertThat(answer.getSources()).hasSize(2);
        assertThat(answer.getModel()).isEqualTo(ChangeLines.WRITER);
    }

    @Test
    void nothingFoundIsNoChange() {
        AssistantChangesWords answer = ChangeLines.lines(sources("{\"sources\": []}"));
        assertThat(answer.getChanged()).isFalse();
        assertThat(answer.getSentences()).isEmpty();
        assertThat(answer.getSources()).isEmpty();
    }

    /** The planner's answer as the generated model reads it. */
    private static PlannerWordsSources sources(String json) {
        return PlannerClient.DATES.readValue(json, PlannerWordsSources.class);
    }
}
