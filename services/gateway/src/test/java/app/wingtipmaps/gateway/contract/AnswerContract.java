package app.wingtipmaps.gateway.contract;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.GenericArrayType;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * What a client reads back, held to the operation's answer in the same
 * document: a Java type checked against the answer's schema, and a sample
 * answer with every field filled for a stub to send.
 */
public final class AnswerContract {

    private static final JsonNodeFactory NODES = JsonNodeFactory.instance;

    private final OpenApiContract document;

    public AnswerContract(OpenApiContract document) {
        this.document = document;
    }

    /**
     * What is wrong with reading the operation's answer into a Java type:
     * a record component the answer has no field for, a primitive the
     * answer may leave out or send null, a type that cannot hold the
     * value. Jackson would quietly read a missing field as null or 0, so
     * a field renamed in the planner shows only here.
     */
    public List<String> checkRead(Type type, JsonNode schema, String where) {
        List<String> problems = new ArrayList<>();
        schema = document.resolve(schema);
        boolean nullable = false;
        if (schema.has("anyOf")) {
            List<JsonNode> branches = new ArrayList<>();
            for (JsonNode branch : schema.get("anyOf")) {
                if ("null".equals(document.resolve(branch).path("type").asText())) {
                    nullable = true;
                } else {
                    branches.add(branch);
                }
            }
            if (branches.size() != 1) {
                problems.add(where + " is one of several types in the planner's answer, which this check does not read");
                return problems;
            }
            schema = document.resolve(branches.getFirst());
        }
        Class<?> raw = rawClass(type);
        if (nullable && raw.isPrimitive()) {
            problems.add(where + " may be null in the planner's answer, but is read into a " + raw.getName());
        }
        String t = schema.path("type").asText("");
        if (raw == String.class) {
            expect(t, Set.of("string"), where, type, problems);
        } else if (raw == LocalDate.class) {
            if (!"date".equals(schema.path("format").asText())) {
                problems.add(where + " is read as a LocalDate, but the planner's answer has it as " + describe(schema));
            }
        } else if (raw == Instant.class || raw == OffsetDateTime.class) {
            if (!"date-time".equals(schema.path("format").asText())) {
                problems.add(where + " is read as a " + raw.getSimpleName() + ", but the planner's answer has it as " + describe(schema));
            }
        } else if (Set.of(double.class, Double.class, float.class, Float.class).contains(raw)) {
            expect(t, Set.of("number", "integer"), where, type, problems);
        } else if (Set.of(int.class, Integer.class, long.class, Long.class).contains(raw)) {
            expect(t, Set.of("integer"), where, type, problems);
        } else if (raw == boolean.class || raw == Boolean.class) {
            expect(t, Set.of("boolean"), where, type, problems);
        } else if (List.class.isAssignableFrom(raw) || raw.isArray()) {
            if (expect(t, Set.of("array"), where, type, problems)) {
                problems.addAll(checkRead(elementOf(type), schema.path("items"), where + "[]"));
            }
        } else if (Map.class.isAssignableFrom(raw)) {
            JsonNode values = schema.path("additionalProperties");
            if (expect(t, Set.of("object"), where, type, problems) && values.isObject()) {
                problems.addAll(checkRead(((ParameterizedType) type).getActualTypeArguments()[1], values, where + "{}"));
            }
        } else if (raw.isRecord()) {
            if (expect(t, Set.of("object"), where, type, problems)) {
                problems.addAll(checkRecord(raw, schema, where));
            }
        } else {
            problems.add(where + " is read into a " + raw.getName() + ", which this check has no rule for");
        }
        return problems;
    }

    private List<String> checkRecord(Class<?> record, JsonNode schema, String where) {
        List<String> problems = new ArrayList<>();
        JsonNode properties = schema.path("properties");
        Set<String> required = new TreeSet<>();
        schema.path("required").forEach(r -> required.add(r.asText()));
        for (RecordComponent component : record.getRecordComponents()) {
            JsonProperty renamed = component.getAccessor().getAnnotation(JsonProperty.class);
            String name = renamed != null && !renamed.value().isEmpty() ? renamed.value() : component.getName();
            String at = where + "." + name;
            if (!properties.has(name)) {
                problems.add(at + " (" + record.getSimpleName() + ") is read, but the planner's answer has no such field "
                        + OpenApiContract.names(properties));
                continue;
            }
            if (component.getType().isPrimitive() && !required.contains(name)) {
                problems.add(at + " may be left out of the planner's answer, but is read into a " + component.getType().getName());
            }
            problems.addAll(checkRead(component.getGenericType(), properties.get(name), at));
        }
        return problems;
    }

    private static boolean expect(String actual, Set<String> wanted, String where, Type type, List<String> problems) {
        if (actual.isEmpty() || wanted.contains(actual)) {
            return true;
        }
        problems.add(where + " is read as " + type.getTypeName() + ", but the planner's answer has it as " + actual);
        return false;
    }

    private static Class<?> rawClass(Type type) {
        if (type instanceof Class<?> c) {
            return c;
        }
        if (type instanceof ParameterizedType p) {
            return (Class<?>) p.getRawType();
        }
        if (type instanceof GenericArrayType) {
            return Object[].class;
        }
        throw new IllegalArgumentException("no class for " + type);
    }

    private static Type elementOf(Type type) {
        if (type instanceof Class<?> c && c.isArray()) {
            return c.getComponentType();
        }
        if (type instanceof GenericArrayType g) {
            return g.getGenericComponentType();
        }
        return ((ParameterizedType) type).getActualTypeArguments()[0];
    }

    private static String describe(JsonNode schema) {
        return schema.path("type").asText("any") + (schema.has("format") ? " (" + schema.get("format").asText() + ")" : "");
    }

    /** A value of the schema with every field it may have, for a stub to
     *  answer with: the client's own reading of it is then exercised. */
    public JsonNode sample(JsonNode schema) {
        return sample(schema, 0);
    }

    private JsonNode sample(JsonNode schema, int depth) {
        schema = document.resolve(schema);
        if (depth > 12) {
            return NODES.nullNode();
        }
        if (schema.has("anyOf")) {
            for (JsonNode branch : schema.get("anyOf")) {
                if (!"null".equals(document.resolve(branch).path("type").asText())) {
                    return sample(branch, depth);
                }
            }
            return NODES.nullNode();
        }
        return switch (schema.path("type").asText("")) {
            case "object" -> {
                ObjectNode out = NODES.objectNode();
                schema.path("properties").fields().forEachRemaining(f -> out.set(f.getKey(), sample(f.getValue(), depth + 1)));
                if (schema.path("additionalProperties").isObject()) {
                    out.set("key", sample(schema.get("additionalProperties"), depth + 1));
                }
                yield out;
            }
            case "array" -> {
                ArrayNode out = NODES.arrayNode();
                out.add(sample(schema.path("items"), depth + 1));
                yield out;
            }
            case "string" -> schema.has("enum") ? schema.get("enum").get(0) : NODES.textNode(switch (schema.path("format").asText("")) {
                case "date" -> "2026-11-09";
                case "date-time" -> "2026-11-09T12:00:00Z";
                default -> "x";
            });
            case "number" -> NODES.numberNode(1.5);
            case "integer" -> NODES.numberNode(1);
            case "boolean" -> NODES.booleanNode(true);
            default -> NODES.objectNode();
        };
    }
}
