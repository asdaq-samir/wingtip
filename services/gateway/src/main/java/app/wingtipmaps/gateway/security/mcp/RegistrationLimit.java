package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.controller.SlidingWindowLimiter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Open registration (RFC 7591), held back: so many a client address an hour
 * (app.mcp.registrations-per-client-per-hour, 10), and a body no bigger than
 * a client's metadata ever is, counted on the bytes read, so a chunked body
 * is held to it too. Each registration is a row; with neither, a script
 * could fill the database (the security audit's M3, 2026-11-10). Claude and
 * ChatGPT register once a connection, from their own servers' addresses.
 */
final class RegistrationLimit extends OncePerRequestFilter {

    /** A client's metadata is a few hundred bytes; RFC 7591 fields this
     *  server reads are the name, the callbacks and the scope. */
    static final int BODY_LIMIT = 16 * 1024;

    private final int perHour;
    private final SlidingWindowLimiter recent = new SlidingWindowLimiter(Duration.ofHours(1));

    RegistrationLimit(int perHour) {
        this.perHour = perHour;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && "/oauth2/register".equals(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!recent.allow("client:" + SlidingWindowLimiter.clientOf(request), perHour, Instant.now())) {
            response.setHeader("Retry-After", "3600");
            refuse(response, 429, "too many clients registered from this address; try again in an hour");
            return;
        }
        byte[] body = request.getInputStream().readNBytes(BODY_LIMIT + 1);
        if (body.length > BODY_LIMIT) {
            refuse(response, 413, "a client registration is at most " + (BODY_LIMIT / 1024) + " KB");
            return;
        }
        chain.doFilter(new ReadBody(request, body), response);
    }

    private static void refuse(HttpServletResponse response, int status, String description) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter()
                .write("{\"error\":\"invalid_client_metadata\",\"error_description\":\"" + description + "\"}");
    }

    /** The request with the body already read, for Spring's endpoint to read again. */
    private static final class ReadBody extends HttpServletRequestWrapper {

        private final byte[] body;

        ReadBody(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream bytes = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return bytes.read();
                }

                @Override
                public int read(byte[] b, int off, int len) {
                    return bytes.read(b, off, len);
                }

                @Override
                public boolean isFinished() {
                    return bytes.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("read synchronously");
                }
            };
        }
    }
}
