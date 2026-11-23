package app.wingtipmaps.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Who Tomcat says is asking, through a real connector, as application.yml
 * sets its RemoteIpValve (round 4's reuse audit, M2; security review, M1
 * and L13). From loopback, the proxy where GATEWAY_TRUSTED_PROXIES is
 * unset: the last X-Forwarded-For hop is the caller, https and the
 * forwarded host are believed, and the port is https's own, never the
 * header's. RemoteIpLanTest has a caller that is no proxy.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "app.internal.port=0")
@Import(RemoteIpEcho.class)
@Testcontainers
class RemoteIpTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    @LocalServerPort
    int port;

    @Test
    void aTrustedProxysHeadersAreBelieved_butNotItsPort() throws Exception {
        assertThat(RemoteIpEcho.ask(port)).isEqualTo("203.0.113.9 true attacker.example 443");
    }
}
