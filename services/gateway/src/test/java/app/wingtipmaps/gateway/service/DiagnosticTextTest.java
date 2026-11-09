package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Nothing of the pilot's survives into a kept report. */
class DiagnosticTextTest {

    @Test
    void anAddressLosesItsQueryWhereThePositionRides() {
        assertThat(DiagnosticText.scrub("GET /api/airports/nearest?lat=46.84&lon=-92.19 failed", 500))
                .isEqualTo("GET /api/airports/nearest failed");
    }

    @Test
    void anEmailAddressIsTakenOut() {
        assertThat(DiagnosticText.scrub("no pilot jane.doe+fly@example.com", 500)).isEqualTo("no pilot <email>");
    }

    @Test
    void aHomeFolderLosesItsOwnersNameAndAnInstallItsId() {
        assertThat(DiagnosticText.scrub(
                "/Users/jane/Library/x /var/mobile/Containers/Data/Application/0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0/tmp",
                500)).isEqualTo("/Users/~/Library/x /var/mobile/Containers/Data/Application/<id>/tmp");
    }

    @Test
    void oneLineCannotForgeASecondAndLongTextIsCut() {
        assertThat(DiagnosticText.oneLine("first\nclient error forged", 500)).isEqualTo("first client error forged");
        assertThat(DiagnosticText.scrub("x".repeat(50), 10)).hasSize(10);
        assertThat(DiagnosticText.indented("a\nb")).isEqualTo("    a\n    b");
    }
}
