package app.wingtipmaps.gateway.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.security.ReviewSignIn;
import app.wingtipmaps.gateway.service.Mailer;
import app.wingtipmaps.gateway.service.PilotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The store reviewers' sign-in (ReviewSignIn): with it on, the review
 * account's fixed code signs that account in where a link's token goes,
 * using no link up; any other token is an ordinary link's, refused where
 * there is none. Off, or without a long code, it is nothing.
 */
@WebMvcTest(MagicLinkController.class)
@Import({Mailer.class, ReviewSignIn.class})
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(
        properties = {
            "app.public-base-url=https://planner.example.com",
            "app.review-sign-in.enabled=true",
            "app.review-sign-in.email=" + MagicLinkReviewTest.REVIEWER,
            "app.review-sign-in.code=" + MagicLinkReviewTest.CODE
        })
class MagicLinkReviewTest {

    static final String REVIEWER = "review@wingtipmaps.app";
    static final String CODE = "review-code-0123456789-abcdef";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private MagicLinkRepository magicLinks;

    @MockitoBean
    private PilotService pilots;

    @MockitoBean
    private JavaMailSender mailSender;

    private ResultActions signInWith(String token) throws Exception {
        return mockMvc.perform(post("/api/auth/magic-link/verify")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("token", token));
    }

    @Test
    void theReviewCodeSignsInTheReviewAccountAndNoOther() throws Exception {
        given(pilots.fromVerifiedEmail(REVIEWER)).willReturn(new Pilot(REVIEWER, "App Review", null));

        signInWith(CODE).andExpect(status().isFound());

        verify(pilots).fromVerifiedEmail(REVIEWER);
        // No link was looked for or used up.
        verify(magicLinks, never()).consumeIfUsable(anyString(), any());
    }

    @Test
    void anyOtherTokenIsAnOrdinaryLinksAndRefusedWithoutOne() throws Exception {
        given(magicLinks.consumeIfUsable(anyString(), any())).willReturn(0);

        signInWith(CODE + "x").andExpect(status().isBadRequest());
        signInWith(CODE.substring(1)).andExpect(status().isBadRequest());

        verify(pilots, never()).fromVerifiedEmail(anyString());
    }

    @Test
    void offItSignsNobodyIn() {
        ReviewSignIn off = new ReviewSignIn(false, REVIEWER, CODE);
        assertThat(off.accountFor(CODE)).isEmpty();
        assertThat(ReviewSignIn.OFF.accountFor("")).isEmpty();
    }

    @Test
    void onItRefusesToStartWithoutAnAccountOrWithAShortCode() {
        assertThatThrownBy(() -> new ReviewSignIn(true, "", CODE)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new ReviewSignIn(true, REVIEWER, "short-code"))
                .isInstanceOf(IllegalStateException.class);
        assertThat(new ReviewSignIn(true, REVIEWER, CODE).accountFor(CODE)).contains(REVIEWER);
    }
}
