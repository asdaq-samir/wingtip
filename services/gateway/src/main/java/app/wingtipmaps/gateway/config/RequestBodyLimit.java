package app.wingtipmaps.gateway.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Serial;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The largest request body the gateway reads, on every route.
 *
 * <p>Tomcat bounds a form's body (maxPostSize) and Spring a multipart one,
 * but nothing bounded a JSON body: Jackson reads all of it into objects
 * before a controller's own limits ({@code @Size}, DiagnosticsController's
 * cuts) can look. Several JSON routes take a body from anyone -- a device's
 * faults, a page's speed, the sign-in requests -- so one caller sending a
 * gigabyte of faults to /api/diagnostics could take the gateway's heap
 * and every pilot's session with it (the security review of 2026-11-21).
 *
 * <p>10 MB, Spring's own multipart request limit: past anything the apps
 * send, the largest being a 5,000-entry logbook import (about 6 MB) and a
 * device's 20 faults of 64,000 characters. A body declared larger is a 413
 * before anything reads it; a chunked one is counted as it is read, and
 * reading past the limit fails, which the controller answers as an
 * unreadable body. Routes that hold themselves to less still do
 * (PlannerProxyController, McpProxyController, RegistrationLimit).
 */
@Component
public class RequestBodyLimit extends OncePerRequestFilter implements Ordered {

    static final long LIMIT = 10L * 1024 * 1024;

    private final long limit;

    public RequestBodyLimit() {
        this(LIMIT);
    }

    RequestBodyLimit(long limit) {
        this.limit = limit;
    }

    /** Just after the internal port's check (InternalPortConfig), ahead of
     *  everything that could read a body. */
    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > limit) {
            response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            return;
        }
        chain.doFilter(new Bounded(request, limit), response);
    }

    /** A body read past the limit. */
    static final class TooLarge extends IOException {
        @Serial
        private static final long serialVersionUID = 1L;

        TooLarge(long limit) {
            super("a request body is at most " + limit / 1024 / 1024 + " MB");
        }
    }

    /** The request, its body counted as it is read. */
    static final class Bounded extends HttpServletRequestWrapper {

        private final long limit;
        private ServletInputStream counted;

        Bounded(HttpServletRequest request, long limit) {
            super(request);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (counted == null) {
                counted = new Counted(super.getInputStream(), limit);
            }
            return counted;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }

    private static final class Counted extends ServletInputStream {

        private final ServletInputStream in;
        private final long limit;
        private long read;

        Counted(ServletInputStream in, long limit) {
            this.in = in;
            this.limit = limit;
        }

        private int counted(int n) throws TooLarge {
            if (n > 0) {
                read += n;
                if (read > limit) {
                    throw new TooLarge(limit);
                }
            }
            return n;
        }

        @Override
        public int read() throws IOException {
            int b = in.read();
            if (b >= 0) {
                counted(1);
            }
            return b;
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            return counted(in.read(b, off, len));
        }

        @Override
        public boolean isFinished() {
            return in.isFinished();
        }

        @Override
        public boolean isReady() {
            return in.isReady();
        }

        @Override
        public void setReadListener(ReadListener listener) {
            in.setReadListener(listener);
        }
    }
}
