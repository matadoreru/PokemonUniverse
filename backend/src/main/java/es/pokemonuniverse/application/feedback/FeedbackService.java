package es.pokemonuniverse.application.feedback;

import es.pokemonuniverse.adapters.out.persistence.FeedbackEntity;
import es.pokemonuniverse.adapters.out.persistence.FeedbackRepository;
import es.pokemonuniverse.adapters.out.persistence.JpaFeedbackSearch;
import es.pokemonuniverse.application.admin.AdminPage;
import es.pokemonuniverse.application.errors.NotFoundException;
import es.pokemonuniverse.application.time.Clock;
import es.pokemonuniverse.domain.feedback.FeedbackStatus;
import es.pokemonuniverse.domain.feedback.FeedbackType;
import es.pokemonuniverse.application.errors.BadRequestException;
import es.pokemonuniverse.domain.game.GameManifest;
import es.pokemonuniverse.domain.game.GameRegistry;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.annotation.Nullable;
import jakarta.inject.Singleton;
import io.micronaut.serde.annotation.Serdeable;
import java.time.Instant;
import java.util.UUID;

@Singleton
public class FeedbackService {

  static final String NOT_FOUND = "Feedback no encontrado.";

  private final FeedbackRepository repository;
  private final JpaFeedbackSearch search;
  private final GameRegistry games;
  private final Clock clock;

  public FeedbackService(FeedbackRepository repository, JpaFeedbackSearch search, GameRegistry games, Clock clock) {
    this.repository = repository;
    this.search = search;
    this.games = games;
    this.clock = clock;
  }

  /** {@code FeedbackOverview}. */
  @Serdeable
  public record Overview(long newBugs, long newSuggestions, long reviewing, long resolved) {}

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

  /** {@code view()} de Node: {@code gameName} del registro, con el id si el juego ya no existe. */
  public Submitted view(FeedbackEntity feedback) {
    var gameId = feedback.getGameId();
    return new Submitted(feedback, gameId == null ? null : games.get(gameId).map(GameManifest::name).orElse(gameId));
  }

  /** Página de la lista de administración, por {@code createdAt} descendente. */
  public AdminPage<Submitted> list(JpaFeedbackSearch.Filters filters, long page) {
    var total = search.count(filters);
    long offset = (page - 1) * AdminPage.PAGE_SIZE;
    if (offset >= total) return new AdminPage<>(java.util.List.of(), page, total);
    return new AdminPage<>(search.list(filters, (int) offset, AdminPage.PAGE_SIZE).stream().map(this::view).toList(),
        page, total);
  }

  public Overview overview() {
    return new Overview(
        search.count(new JpaFeedbackSearch.Filters(null, FeedbackStatus.NEW, FeedbackType.BUG, "")),
        search.count(new JpaFeedbackSearch.Filters(null, FeedbackStatus.NEW, FeedbackType.SUGGESTION, "")),
        search.count(new JpaFeedbackSearch.Filters(null, FeedbackStatus.REVIEWING, null, "")),
        search.count(new JpaFeedbackSearch.Filters(null, FeedbackStatus.RESOLVED, null, "")));
  }

  public Submitted updateStatus(String id, FeedbackStatus status) {
    return view(search.updateStatus(id, status, Instant.ofEpochMilli(clock.now()))
        .orElseThrow(() -> new NotFoundException(NOT_FOUND)));
  }
}
