package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.MagicLink;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Whose account a link signs in to: masked, for a usable link alone,
 *  nothing spent, and so many asks an hour. */
@WebMvcTest(MagicLinkAccountController.class)
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(properties = "app.magic-link.account-per-client-per-hour=5")
class MagicLinkAccountControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private MagicLinkRepository magicLinks;

    /** Tokens of the shape the controller makes: 43 base64url characters. */
    private static final String GOOD = "g".repeat(43);

    private static final String USED = "u".repeat(43);
    private static final String OLD = "o".repeat(43);
    private static final String UNKNOWN = "n".repeat(43);

    private ResultActions ask(String token, String from) throws Exception {
        return mvc.perform(post("/api/auth/magic-link/account")
                .with(request -> {
                    request.setRemoteAddr(from);
                    return request;
                })
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("token", token));
    }

    private static MagicLink link(Instant expires, Instant consumed) {
        MagicLink link = new MagicLink("alice@icloud.com", "h", expires);
        ReflectionTestUtils.setField(link, "consumedAt", consumed);
        return link;
    }

    @Test
    void aUsableLinkNamesItsAccountMaskedAndIsNotSpent() throws Exception {
        given(magicLinks.findByTokenHash(MagicLinkController.hash(GOOD)))
                .willReturn(Optional.of(link(Instant.now().plus(Duration.ofMinutes(10)), null)));
        ask(GOOD, "203.0.113.1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("a•••@icloud.com"));
        verify(magicLinks, never()).consumeIfUsable(anyString(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void aUsedExpiredOrUnknownLinkAnswersNothingAlike() throws Exception {
        given(magicLinks.findByTokenHash(MagicLinkController.hash(USED)))
                .willReturn(Optional.of(link(Instant.now().plus(Duration.ofMinutes(10)), Instant.now())));
        given(magicLinks.findByTokenHash(MagicLinkController.hash(OLD)))
                .willReturn(Optional.of(link(Instant.now().minusSeconds(1), null)));
        for (String token : new String[] {USED, OLD, UNKNOWN}) {
            ask(token, "203.0.113.2")
                    .andExpect(status().isNotFound())
                    .andExpect(content().string(""));
        }
    }

    @Test
    void aTokenOfAnyOtherShapeIsNoLinksWhateverRowItsHashMatches() throws Exception {
        // A deletion link's row is hashed over "delete-account:" and its
        // token (DeleteAccountController): sent whole, it is not a sign-in link.
        String deletion = DeleteAccountController.PURPOSE + GOOD;
        given(magicLinks.findByTokenHash(MagicLinkController.hash(deletion)))
                .willReturn(Optional.of(link(Instant.now().plus(Duration.ofMinutes(10)), null)));
        ask(deletion, "203.0.113.5").andExpect(status().isNotFound());
    }

    @Test
    void anAddressAsksSoManyTimesAnHour() throws Exception {
        for (int i = 0; i < 5; i++) {
            ask(UNKNOWN, "203.0.113.3").andExpect(status().isNotFound());
        }
        ask(UNKNOWN, "203.0.113.3").andExpect(status().isTooManyRequests());
        ask(UNKNOWN, "203.0.113.4").andExpect(status().isNotFound());
    }

    @Test
    void theMaskKeepsTheFirstLetterAndTheDomain() {
        assertThat(MagicLinkAccountController.masked("alice@icloud.com")).isEqualTo("a•••@icloud.com");
        assertThat(MagicLinkAccountController.masked("a@b.example")).isEqualTo("a•••@b.example");
        assertThat(MagicLinkAccountController.masked("nobody")).isEqualTo("•••");
    }
}
