package es.pokemonuniverse.adapters.in.rest.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import es.pokemonuniverse.application.errors.InvalidInputException;
import io.micronaut.serde.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * {@code pageQuery} de {@code admin/routes.ts} ({@code z.coerce.number().int().min(1).default(1)} y
 * {@code z.string().trim().max(80).default('')}) más los filtros de cada ruta. Las incidencias esperadas se obtuvieron
 * de Zod 4 con {@code npx tsx -e} sobre los mismos esquemas; un parámetro repetido es un array, como con {@code qs}.
 */
class AdminQueryParamsTest {

  private static final List<String> ROOM_STATUSES = List.of("ACTIVE", "CLOSED", "INTERRUPTED");

  private static Map<String, List<String>> query(Object... pairs) {
    var map = new LinkedHashMap<String, List<String>>();
    for (int i = 0; i < pairs.length; i += 2) {
      var value = pairs[i + 1];
      @SuppressWarnings("unchecked")
      var values = value instanceof List<?> list ? (List<String>) list : List.of((String) value);
      map.put((String) pairs[i], values);
    }
    return map;
  }

  private static String issuesOf(Map<String, List<String>> params) throws Exception {
    var e = assertThrows(InvalidInputException.class, () -> {
      var q = AdminQueryParams.of(params);
      q.page();
      q.search();
      q.enumValue("status", ROOM_STATUSES);
      q.text("gameId", 64);
      q.done();
    });
    return ObjectMapper.getDefault().writeValueAsString(e.issues());
  }

  private static long page(String raw) {
    var q = AdminQueryParams.of(query("page", raw));
    long page = q.page();
    q.done();
    return page;
  }

  @Test
  void defaultsAndCoercion() {
    var q = AdminQueryParams.of(Map.of());
    assertEquals(1, q.page());
    assertEquals("", q.search());
    assertNull(q.enumValue("status", ROOM_STATUSES));
    assertNull(q.text("gameId", 64));
    q.done();
    assertEquals(12, page(" 12 "));
    assertEquals(16, page("0x10"));
    assertEquals(1000, page("1e3"));
    assertEquals(5, page("5."));
    assertEquals(9_007_199_254_740_991L, page("9007199254740991"));
    var multi = AdminQueryParams.of(query("page", List.of("3")));
    assertEquals(3, multi.page());
    var trimmed = AdminQueryParams.of(query("search", "  Ash  ", "gameId", "   ", "status", "CLOSED"));
    assertEquals("Ash", trimmed.search());
    assertEquals("CLOSED", trimmed.enumValue("status", ROOM_STATUSES));
    assertEquals("", trimmed.text("gameId", 64));
    trimmed.done();
  }

  @Test
  void pageIssuesMatchZod() throws Exception {
    assertEquals("[{\"origin\":\"number\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"page\"],"
        + "\"message\":\"Too small: expected number to be >=1\"}]", issuesOf(query("page", "0")));
    assertEquals(issuesOf(query("page", "0")), issuesOf(query("page", "")));
    assertEquals(issuesOf(query("page", "0")), issuesOf(query("page", "-0")));
    assertEquals(issuesOf(query("page", "0")), issuesOf(query("page", List.of())));
    assertEquals("[{\"expected\":\"int\",\"format\":\"safeint\",\"code\":\"invalid_type\",\"path\":[\"page\"],"
        + "\"message\":\"Invalid input: expected int, received number\"}]", issuesOf(query("page", "0.5")));
    assertEquals("[{\"expected\":\"number\",\"code\":\"invalid_type\",\"received\":\"NaN\",\"path\":[\"page\"],"
        + "\"message\":\"Invalid input: expected number, received NaN\"}]", issuesOf(query("page", "abc")));
    assertEquals(issuesOf(query("page", "abc")), issuesOf(query("page", List.of("1", "2"))));
    assertEquals("[{\"expected\":\"number\",\"code\":\"invalid_type\",\"received\":\"-Infinity\",\"path\":[\"page\"],"
        + "\"message\":\"Invalid input: expected number, received -Infinity\"}]", issuesOf(query("page", "-Infinity")));
    assertEquals("[{\"code\":\"too_big\",\"maximum\":9007199254740991,\"note\":\"Integers must be within the safe "
        + "integer range.\",\"origin\":\"int\",\"inclusive\":true,\"path\":[\"page\"],\"message\":\"Too big: expected "
        + "int to be <=9007199254740991\"}]", issuesOf(query("page", "1e300")));
    assertEquals("[{\"code\":\"too_small\",\"minimum\":-9007199254740991,\"note\":\"Integers must be within the safe "
        + "integer range.\",\"origin\":\"int\",\"inclusive\":true,\"path\":[\"page\"],\"message\":\"Too small: "
        + "expected int to be >=-9007199254740991\"},{\"origin\":\"number\",\"code\":\"too_small\",\"minimum\":1,"
        + "\"inclusive\":true,\"path\":[\"page\"],\"message\":\"Too small: expected number to be >=1\"}]",
        issuesOf(query("page", "-1e300")));
  }

  @Test
  void otherFieldIssuesInShapeOrder() throws Exception {
    var tooLong = "x".repeat(81);
    assertEquals("[{\"origin\":\"number\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"page\"],"
        + "\"message\":\"Too small: expected number to be >=1\"},{\"origin\":\"string\",\"code\":\"too_big\","
        + "\"maximum\":80,\"inclusive\":true,\"path\":[\"search\"],\"message\":\"Too big: expected string to have <=80 "
        + "characters\"},{\"code\":\"invalid_value\",\"values\":[\"ACTIVE\",\"CLOSED\",\"INTERRUPTED\"],\"path\":"
        + "[\"status\"],\"message\":\"Invalid option: expected one of \\\"ACTIVE\\\"|\\\"CLOSED\\\"|\\\"INTERRUPTED\\\"\"},"
        + "{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":64,\"inclusive\":true,\"path\":[\"gameId\"],"
        + "\"message\":\"Too big: expected string to have <=64 characters\"}]",
        issuesOf(query("gameId", "g".repeat(65), "status", "X", "search", tooLong, "page", "0")));
    assertEquals("[{\"expected\":\"string\",\"code\":\"invalid_type\",\"path\":[\"search\"],\"message\":\"Invalid "
        + "input: expected string, received array\"}]", issuesOf(query("search", List.of("a", "b"))));
    assertEquals("[{\"code\":\"invalid_value\",\"values\":[\"ACTIVE\",\"CLOSED\",\"INTERRUPTED\"],\"path\":"
        + "[\"status\"],\"message\":\"Invalid option: expected one of \\\"ACTIVE\\\"|\\\"CLOSED\\\"|\\\"INTERRUPTED\\\"\"}]",
        issuesOf(query("status", "")));
    // 80 caracteres tras recortar: válido.
    var q = AdminQueryParams.of(query("search", "  " + "y".repeat(80) + "  "));
    assertEquals(80, q.search().length());
    q.done();
  }
}
