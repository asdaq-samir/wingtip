package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.Pilot;
import org.junit.jupiter.api.Test;

/** The record kept beside 61.109's experience; the experience itself is
 *  the engine's (pilot_experience, held to apps/web/src/lib/fixtures/currency.json). */
class TrainingServiceTest {

    private final Pilot pilot = new Pilot("student@example.com", "A. Student", "sub-1");

    @Test
    void theKnowledgeTestCodesComeBackAsGiven() {
        pilot.setKnowledgeTestCodes("PA.I.E.K1 PA.I.D.K2");
        assertThat(TrainingService.codesOf(pilot)).containsExactly("PA.I.E.K1", "PA.I.D.K2");
        pilot.setKnowledgeTestCodes(null);
        assertThat(TrainingService.codesOf(pilot)).isEmpty();
    }
}
