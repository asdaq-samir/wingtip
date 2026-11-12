package app.wingtipmaps.gateway.security;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.service.PilotService;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * A handler's {@link Pilot} parameter: the pilot the session belongs to,
 * or a 401 when it belongs to none -- Spring MVC's own argument
 * resolving, in place of a lambda around every pilot-scoped endpoint. It
 * registers itself, so a {@code @WebMvcTest} slice has it as the app does;
 * the pilots are asked for only when a handler takes one, so a slice of a
 * controller that takes none needs no PilotService. The parameter is left
 * out of the OpenAPI document (OpenApiConfig).
 */
@Component
public class CurrentPilot implements HandlerMethodArgumentResolver, WebMvcConfigurer {

    private final ObjectProvider<PilotService> pilots;

    public CurrentPilot(ObjectProvider<PilotService> pilots) {
        this.pilots = pilots;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(this);
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType() == Pilot.class;
    }

    @Override
    public Pilot resolveArgument(
            MethodParameter parameter,
            @Nullable ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            @Nullable WebDataBinderFactory binderFactory) {
        return pilots.getObject()
                .current(SecurityContextHolder.getContext().getAuthentication())
                .orElseThrow(() -> new ErrorResponseException(HttpStatus.UNAUTHORIZED));
    }
}
