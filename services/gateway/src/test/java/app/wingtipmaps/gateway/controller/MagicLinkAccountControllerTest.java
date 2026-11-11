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
        given(magicLinks.findByTokenHash(MagicLinkController.hash("good")))
                .willReturn(Optional.of(link(Instant.now().plus(Duration.ofMinutes(10)), null)));
        ask("good", "203.0.113.1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("a•••@icloud.com"));
        verify(magicLinks, never()).consumeIfUsable(anyString(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void aUsedExpiredOrUnknownLinkAnswersNothingAlike() throws Exception {
        given(magicLinks.findByTokenHash(MagicLinkController.hash("used")))
                .willReturn(Optional.of(link(Instant.now().plus(Duration.ofMinutes(10)), Instant.now())));
        given(magicLinks.findByTokenHash(MagicLinkController.hash("old")))
                .willReturn(Optional.of(link(Instant.now().minusSeconds(1), null)));
        for (String token : new String[] {"used", "old", "unknown"}) {
            ask(token, "203.0.113.2")
                    .andExpect(status().isNotFound())
                    .andExpect(content().string(""));
        }
    }

    @Test
    void anAddressAsksSoManyTimesAnHour() throws Exception {
        for (int i = 0; i < 5; i++) {
            ask("unknown", "203.0.113.3").andExpect(status().isNotFound());
        }
        ask("unknown", "203.0.113.3").andExpect(status().isTooManyRequests());
        ask("unknown", "203.0.113.4").andExpect(status().isNotFound());
    }

    @Test
    void theMaskKeepsTheFirstLetterAndTheDomain() {
        assertThat(MagicLinkAccountController.masked("alice@icloud.com")).isEqualTo("a•••@icloud.com");
        assertThat(MagicLinkAccountController.masked("a@b.example")).isEqualTo("a•••@b.example");
        assertThat(MagicLinkAccountController.masked("nobody")).isEqualTo("•••");
    }
}
