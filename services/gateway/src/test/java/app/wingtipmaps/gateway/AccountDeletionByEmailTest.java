package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.MagicLink;
import app.wingtipmaps.gateway.domain.Pilot;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * Deleting an account without the app (Google Play's account-deletion
 * requirement; DeleteAccountController): asked for by address on a web
 * page, confirmed from an emailed link, and deleting exactly what Setup's
 * Delete Account does -- every table counted, as AccountDeletionTest
 * counts them.
 */
class AccountDeletionByEmailTest extends AccountTestBase {

    @MockitoBean
    private JavaMailSender mail;

    @BeforeEach
    void noMailYet() {
        clearInvocations(mail);
    }

    private void ask(String email) throws Exception {
        mockMvc.perform(post("/delete-account")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("email", email))
                .andExpect(status().isSeeOther())
                .andExpect(header().string("Location", "/delete-account?sent=1"));
    }

    /** The token in the link the last email carried. */
    private String emailedToken() {
        ArgumentCaptor<SimpleMailMessage> sent = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(sent.capture());
        String text = sent.getValue().getText();
        assertThat(text).contains("/delete-account/confirm?token=");
        return text.substring(text.indexOf("token=") + "token=".length()).trim();
    }

    @Test
    void thePageAsksForTheAddressWithoutSigningIn() throws Exception {
        mockMvc.perform(get("/delete-account"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Delete your Wingtip Maps account")))
                .andExpect(content().string(containsString("name=\"email\"")));
    }

    @Test
    void theEmailedLinkDeletesEverythingThatWasTheirsAndNothingOfAnyoneElses() throws Exception {
        Pilot leaving = pilotWithEverything();
        Pilot staying = pilotWithEverything();
        List<Integer> before = rowsOf(staying);

        ask(leaving.getEmail());
        String token = emailedToken();
        // Opening the link (or a mail scanner fetching it) deletes nothing.
        mockMvc.perform(get("/delete-account/confirm").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString(leaving.getEmail())))
                .andExpect(content().string(containsString("Delete Account")));
        assertThat(rowsOf(leaving)).allMatch(rows -> rows > 0);

        mockMvc.perform(post("/delete-account/confirm")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Your account is deleted")));

        assertThat(rowsOf(leaving)).containsOnly(0);
        assertThat(rowsOf(staying)).isEqualTo(before);
        assertThat(plannerAsked).containsExactly("DELETE /api/checkpoint-notes/mine pilot=" + leaving.getId());
    }

    @Test
    void anUnknownAddressIsAnsweredTheSameAndEmailedNothing() throws Exception {
        ask("nobody-" + System.nanoTime() + "@example.com");
        verify(mail, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void aDeletionLinkCannotSignInAndASignInLinkCannotDelete() throws Exception {
        Pilot pilot = pilotWithEverything();
        ask(pilot.getEmail());
        String token = emailedToken();
        // As a sign-in link: refused.
        mockMvc.perform(post("/api/auth/magic-link/verify")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", token))
                .andExpect(status().isBadRequest());
        // A good sign-in link for the same address cannot delete either.
        String signIn = "sign-in-" + System.nanoTime();
        magicLinks.save(
                new MagicLink(pilot.getEmail(), sha256(signIn), Instant.now().plusSeconds(600)));
        mockMvc.perform(post("/delete-account/confirm")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("token", signIn))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("expired or was used")));
        assertThat(rowsOf(pilot)).allMatch(rows -> rows > 0);
    }

    private static String sha256(String token) throws Exception {
        return HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void aLinkWorksOnce() throws Exception {
        Pilot pilot = pilotWithEverything();
        ask(pilot.getEmail());
        String token = emailedToken();
        for (String expected : new String[] {"Your account is deleted", "expired or was used"}) {
            mockMvc.perform(post("/delete-account/confirm")
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                            .param("token", token))
                    .andExpect(content().string(containsString(expected)));
        }
    }

    @Test
    void withoutTheFormsTokenNothingIsAsked() throws Exception {
        mockMvc.perform(post("/delete-account")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("email", "pilot@example.com"))
                .andExpect(status().isForbidden());
    }
}
