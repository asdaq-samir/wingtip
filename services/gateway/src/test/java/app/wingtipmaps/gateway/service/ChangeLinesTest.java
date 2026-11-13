package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.dto.BriefingChangeDto;
import app.wingtipmaps.gateway.planner.model.PlannerWordsSources;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** The flight watch's lines: each change the planner found is a sentence of its own heading, citing it; the
 *  flight itself is a source but not a change; none found is no change. */
class ChangeLinesTest {

    @Test
    void eachChangeIsItsHeadingCitingIt() {
        ChangeLines.Changes answer = ChangeLines.lines(sources("""
                {"sources": [
                  {"id": "flight:route", "label": "The flight", "text": "From C81 to KDLH."},
                  {"id": "metar:KDLH", "label": "KDLH METAR, VFR to IFR", "text": "Was: KDLH ...\\nNow: KDLH ..."}
                ]}"""));
        assertThat(answer.changed()).isTrue();
        assertThat(answer.sentences()).extracting(BriefingChangeDto::text).containsExactly("KDLH METAR, VFR to IFR.");
        assertThat(answer.sentences().get(0).sources()).containsExactly("metar:KDLH");
        assertThat(answer.sources()).hasSize(2);
    }

    @Test
    void nothingFoundIsNoChange() {
        ChangeLines.Changes answer = ChangeLines.lines(sources("{\"sources\": []}"));
        assertThat(answer.changed()).isFalse();
        assertThat(answer.sentences()).isEmpty();
        assertThat(answer.sources()).isEmpty();
    }

    /** The planner's answer as the generated model reads it. */
    private static PlannerWordsSources sources(String json) {
        return JsonMapper.shared().readValue(json, PlannerWordsSources.class);
    }
}
