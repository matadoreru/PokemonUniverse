package es.pokemonuniverse.adapters.in.rest.friends;

import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.registeredUserId;
import static es.pokemonuniverse.adapters.in.rest.UserContentRequests.validId;

import es.pokemonuniverse.adapters.in.rest.ApiError;
import es.pokemonuniverse.adapters.in.rest.identity.Identity;
import es.pokemonuniverse.application.friends.FriendService;
import es.pokemonuniverse.application.friends.SendResult;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Body;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Delete;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Post;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.scheduling.annotation.ExecuteOn;
import io.micronaut.serde.annotation.Serdeable;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.util.Optional;

/** Amigos y solicitudes de la cuenta registrada; un invitado o una petición sin sesión reciben 401. */
@Tag(name = "friends")
@Controller("/api/friends")
@ExecuteOn(TaskExecutors.BLOCKING)
public class FriendsController {

  private final FriendService friends;
  private final Validator validator;

  public FriendsController(FriendService friends, Validator validator) {
    this.friends = friends;
    this.validator = validator;
  }

  @Operation(summary = "Amigos y solicitudes pendientes")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = FriendsResponse.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Get
  public FriendsResponse list(@Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    return FriendsResponse.of(friends.overview(registeredUserId(current)));
  }

  @Operation(summary = "Enviar una solicitud de amistad por nombre de usuario")
  @ApiResponse(responseCode = "200", description = "Había una solicitud cruzada: ya sois amigos", content = @Content(schema = @Schema(implementation = FriendBody.class)))
  @ApiResponse(responseCode = "201", description = "Solicitud creada", content = @Content(schema = @Schema(implementation = RequestBody.class)))
  @ApiResponse(responseCode = "400", description = "Datos inválidos o solicitud imposible", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/requests")
  public HttpResponse<?> send(@Body SendFriendRequest body, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    var request = body.normalized();
    var violations = validator.validate(request);
    if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
    return switch (friends.sendRequest(userId, request.username())) {
      case SendResult.Requested requested ->
          HttpResponse.created(new RequestBody(FriendRequestResponse.outgoing(requested.request())));
      case SendResult.BecameFriends became -> HttpResponse.ok(new FriendBody(FriendResponse.of(became.friend())));
    };
  }

  @Operation(summary = "Aceptar una solicitud recibida")
  @ApiResponse(responseCode = "200", description = "OK", content = @Content(schema = @Schema(implementation = FriendBody.class)))
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "La solicitud no existe o no es tuya", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Post("/requests/{id}/accept")
  public FriendBody accept(String id, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    return new FriendBody(FriendResponse.of(friends.accept(userId, validId(id))));
  }

  @Operation(summary = "Rechazar una solicitud recibida o cancelar una enviada")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "La solicitud no existe o no es tuya", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/requests/{id}")
  public HttpResponse<Void> decline(String id, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var userId = registeredUserId(current);
    friends.decline(userId, validId(id));
    return HttpResponse.noContent();
  }

  @Operation(summary = "Quitar a un amigo")
  @ApiResponse(responseCode = "204", description = "Sin contenido")
  @ApiResponse(responseCode = "401", description = "Cuenta registrada requerida", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @ApiResponse(responseCode = "404", description = "No sois amigos", content = @Content(schema = @Schema(implementation = ApiError.class)))
  @Delete("/{userId}")
  public HttpResponse<Void> remove(String userId, @Parameter(hidden = true) @Identity Optional<AuthUser> current) {
    var me = registeredUserId(current);
    friends.remove(me, validId(userId));
    return HttpResponse.noContent();
  }

  @Serdeable
  public record RequestBody(FriendRequestResponse request) {}

  @Serdeable
  public record FriendBody(FriendResponse friend) {}
}
