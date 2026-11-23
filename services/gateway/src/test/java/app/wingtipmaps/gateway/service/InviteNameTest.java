package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.Pilot;
import org.junit.jupiter.api.Test;

/** The student's name as an instructor's invite mails it: a name's
 *  letters and nothing to make a link of (round 4's security review, L4). */
class InviteNameTest {

    private static String mailed(String fullName) {
        Pilot student = new Pilot("student@example.com", "Display Name", "sub-1");
        student.setFullName(fullName);
        return InstructorService.mailedName(student);
    }

    @Test
    void aNameIsMailedAsItIs() {
        assertThat(mailed("Amelia Mary Earhart")).isEqualTo("Amelia Mary Earhart");
        assertThat(mailed("Zoë O’Brien-Søndergaard")).isEqualTo("Zoë O’Brien-Søndergaard");
    }

    @Test
    void aLinkInTheNameIsNoLinkOnceMailed() {
        assertThat(mailed("Claim your prize at https://evil.example/x"))
                .isEqualTo("Claim your prize at httpsevilexamplex")
                .doesNotContain(".")
                .doesNotContain(":");
        assertThat(mailed("https://")).isEqualTo("https");
        assertThat(mailed("./:")).isEqualTo("A Wingtip Maps pilot");
        assertThat(mailed("a".repeat(120))).hasSize(60);
    }
}
