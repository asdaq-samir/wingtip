package app.wingtipmaps.gateway.config;

import app.wingtipmaps.gateway.domain.Pilot;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.util.Json;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.servers.Server;
import java.lang.annotation.Annotation;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.jspecify.annotations.Nullable;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.PropertyCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Makes the OpenAPI document say what Jackson actually sends, because
 * the front end's types are generated from it
 * (services/gateway/openapi.json, then {@code npm run types}).
 *
 * <p>Out of the box springdoc marks no field required and none nullable,
 * which generates a type where every field may be missing and none may
 * be null -- the opposite of this app, where Jackson writes every field
 * of every record, as null where there is nothing. So every property is
 * listed as required, and one declared {@code @Nullable} in its DTO
 * gains {@code null} as a type -- or, where it is another record, is
 * that record or null. A field that can be null and is not
 * annotated generates a type that says it cannot be: the annotation is
 * the contract.
 */
@Configuration
public class OpenApiConfig {

    static {
        // A handler's Pilot is the session's (CurrentPilot), never a
        // parameter the caller sends.
        SpringDocUtils.getConfig().addRequestWrapperToIgnore(Pilot.class);
    }

    @Bean
    PropertyCustomizer nullableWhereDeclared() {
        return (property, type) -> {
            if (declaredNullable(type.getCtxAnnotations())) {
                markNullable(property);
            }
            return property;
        };
    }

    /**
     * JSpecify's {@code @Nullable}, which Spring Boot 4 asks for, is a
     * type-use annotation: it sits on the field's or record component's
     * type, not on the member, so Jackson never hands it to the
     * PropertyCustomizer above. So each class is read here once swagger
     * has made its schema, and a property whose member or type says
     * {@code @Nullable} gains {@code null} the same way.
     */
    @Bean
    ModelConverter nullableTypeUse() {
        return (type, context, chain) -> {
            Schema<?> resolved = chain.hasNext() ? chain.next().resolve(type, context, chain) : null;
            if (resolved == null || type.getType() == null) {
                return resolved;
            }
            Class<?> owner = Json.mapper().constructType(type.getType()).getRawClass();
            Schema<?> model = resolved;
            if (resolved.get$ref() != null && context.getDefinedModels() != null) {
                String ref = resolved.get$ref();
                model = context.getDefinedModels().get(ref.substring(ref.lastIndexOf('/') + 1));
            }
            if (model == null || model.getProperties() == null) {
                return resolved;
            }
            for (Declared member : members(owner)) {
                Schema<?> property = model.getProperties().get(member.name());
                if (property != null && member.nullable()) {
                    markNullable(property);
                }
            }
            return resolved;
        };
    }

    @Bean
    OpenApiCustomizer everyFieldPresent() {
        return openApi -> {
            // The same document wherever it is served from: the page is
            // always on the gateway's own origin.
            openApi.setServers(List.of(new Server().url("/")));
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            openApi.getComponents().getSchemas().values().forEach(raw -> {
                // swagger-models hands its schemas over raw; typed here so
                // the calls below are checked.
                Schema<?> schema = raw;
                if (schema.getProperties() != null && !schema.getProperties().isEmpty()) {
                    schema.setRequired(
                            new ArrayList<>(new TreeSet<>(schema.getProperties().keySet())));
                }
            });
        };
    }

    /** A record's components, else the class's own fields: what Jackson
     *  writes, by the names it writes them under, each with the
     *  annotations on it and on its type. */
    private static List<Declared> members(Class<?> owner) {
        if (owner.isRecord()) {
            return Arrays.stream(owner.getRecordComponents())
                    .map(c -> new Declared(
                            c.getName(),
                            c.getAnnotations(),
                            c.getAnnotatedType().getAnnotations()))
                    .toList();
        }
        if (owner.isPrimitive() || owner.isArray() || owner.getName().startsWith("java.")) {
            return List.of();
        }
        return Arrays.stream(owner.getDeclaredFields())
                .filter(f -> !Modifier.isStatic(f.getModifiers()))
                .map(f -> new Declared(
                        f.getName(), f.getAnnotations(), f.getAnnotatedType().getAnnotations()))
                .toList();
    }

    /** A member's name, and the annotations on it and on its type. */
    private record Declared(String name, Annotation[] onMember, Annotation[] onType) {
        /** {@code @Nullable} on the member or on its type (JSpecify's place). */
        boolean nullable() {
            return declaredNullable(onMember) || declaredNullable(onType);
        }
    }

    /** The property, or null: another record as the reference or null
     *  (OpenAPI 3.1 reads nothing beside a $ref), a value as its type or
     *  null. Twice is the same as once. */
    private static void markNullable(Schema<?> property) {
        if (property.get$ref() != null) {
            Schema<?> record = new Schema<>().$ref(property.get$ref());
            property.set$ref(null);
            property.addAnyOfItem(record);
            property.addAnyOfItem(new Schema<>().types(Set.of("null")));
        } else if (property.getAnyOf() != null) {
            return;
        } else if (property.getTypes() != null && !property.getTypes().isEmpty()) {
            property.addType("null");
        } else {
            property.setNullable(true);
        }
    }

    /** Any annotation named {@code Nullable} -- JSpecify's, Spring's,
     *  Jakarta's or JSR-305's all mean the same thing here. */
    private static boolean declaredNullable(Annotation @Nullable [] annotations) {
        return annotations != null
                && Arrays.stream(annotations)
                        .anyMatch(a -> a.annotationType().getSimpleName().equals("Nullable"));
    }
}
