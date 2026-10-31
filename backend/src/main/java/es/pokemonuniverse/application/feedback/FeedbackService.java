package es.pokemonuniverse.application.feedback;

import es.pokemonuniverse.adapters.out.persistence.FeedbackEntity;
import es.pokemonuniverse.adapters.out.persistence.FeedbackRepository;
import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.util.UUID;

@Singleton
public class FeedbackService {

  private final FeedbackRepository repository;
  private final GameRegistry games;

  public FeedbackService(FeedbackRepository repository, GameRegistry games) {
    this.repository = repository;
    this.games = games;
  }

  public record Submitted(FeedbackEntity feedback, @Nullable String gameName) {}

  public Submitted submit(AuthUser author, SubmitFeedbackCommand command) {
    String gameName = null;
    if (command.gameId() != null) {
      gameName = games.get(command.gameId())
          .map(GameManifest::name)
          .orElseThrow(() -> new BadRequestException("El minijuego seleccionado no existe."));
    }
    var registered = author.kind() == AuthUser.Kind.USER;
    var saved = repository.save(FeedbackEntity.create(UUID.randomUUID().toString(), command.reference(),
        command.gameId(), command.roomCode(), command.type(), command.description(),
        registered ? author.id() : null, author.displayName(), author.kind().name(), Instant.now()));
    return new Submitted(saved, gameName);
  }
}
