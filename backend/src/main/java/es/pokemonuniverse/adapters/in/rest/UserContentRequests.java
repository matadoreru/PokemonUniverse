package es.pokemonuniverse.adapters.in.rest;

import es.pokemonuniverse.application.errors.InvalidInputException;
import es.pokemonuniverse.application.errors.UnauthorizedException;
import es.pokemonuniverse.application.validation.ZodIssues;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import io.micronaut.json.tree.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Piezas comunes de los routers de contenido personal de Node (categorías y dilemas): {@code requireUser}, el cuerpo
 * ausente de Express y el {@code idSchema} de {@code :id}.
 */
public final class UserContentRequests {

  private static final int MAX_ID_LENGTH = 128;

  private UserContentRequests() {}

  /** 401 sin sesión o con sesión de invitado; el id de la cuenta registrada si no. */
  public static String registeredUserId(Optional<AuthUser> current) {
    return current.filter(user -> user.kind() == AuthUser.Kind.USER)
        .orElseThrow(() -> new UnauthorizedException(UnauthorizedException.REGISTERED_REQUIRED))
        .id();
  }

  /** Sin cuerpo, Express deja {@code req.body = {}}: Zod valida un objeto vacío, no {@code undefined}. */
  public static JsonNode orEmpty(@Nullable JsonNode body) {
    return body == null ? JsonNode.createObjectNode(Map.of()) : body;
  }

  /** {@code z.string().min(1).max(128)} del router; un segmento vacío no llega a la ruta. */
  public static String validId(String id) {
    if (id.length() > MAX_ID_LENGTH) {
      var issues = new ZodIssues();
      issues.tooBig("string", MAX_ID_LENGTH, List.of(), "Too big: expected string to have <=128 characters");
      throw new InvalidInputException(issues);
    }
    return id;
  }
}
