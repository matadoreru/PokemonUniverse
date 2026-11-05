package es.pokemonuniverse.application.auth;

import es.pokemonuniverse.adapters.out.persistence.PasswordResetTokenEntity;
import es.pokemonuniverse.adapters.out.persistence.PasswordResetTokenRepository;
import es.pokemonuniverse.adapters.out.persistence.UserEntity;
import es.pokemonuniverse.adapters.out.persistence.UserRepository;
import es.pokemonuniverse.application.errors.InvalidResetLinkException;
import es.pokemonuniverse.application.mail.MailMessage;
import es.pokemonuniverse.application.mail.MailSender;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.scheduling.TaskExecutors;
import io.micronaut.transaction.TransactionOperations;
import jakarta.inject.Named;
import jakarta.inject.Singleton;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.regex.Pattern;
import org.hibernate.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Recuperar la contraseña con un enlace de un solo uso enviado por correo. El token (32 bytes aleatorios en base64url)
 * solo viaja en el enlace; en la BD se guarda su SHA-256.
 */
@Singleton
public class PasswordResetService {

  private static final Logger LOG = LoggerFactory.getLogger(PasswordResetService.class);
  private static final Duration TTL = Duration.ofMinutes(30);
  private static final Duration MIN_INTERVAL = Duration.ofSeconds(60);
  private static final Pattern TOKEN_FORMAT = Pattern.compile("^[A-Za-z0-9_-]{43}$");

  private final AccountLookup accounts;
  private final PasswordResetTokenRepository tokens;
  private final UserRepository users;
  private final PasswordHasher hasher;
  private final MailSender mail;
  private final PuConfig config;
  private final Clock clock;
  private final ExecutorService executor;
  private final TransactionOperations<Session> transactions;
  private final EntityManager entityManager;
  private final SecureRandom random = new SecureRandom();

  public PasswordResetService(AccountLookup accounts, PasswordResetTokenRepository tokens, UserRepository users,
      PasswordHasher hasher, MailSender mail, PuConfig config, Clock clock,
      @Named(TaskExecutors.BLOCKING) ExecutorService executor, TransactionOperations<Session> transactions,
      EntityManager entityManager) {
    this.accounts = accounts;
    this.tokens = tokens;
    this.users = users;
    this.hasher = hasher;
    this.mail = mail;
    this.config = config;
    this.clock = clock;
    this.executor = executor;
    this.transactions = transactions;
    this.entityManager = entityManager;
  }

  /**
   * Encarga todo el trabajo (buscar la cuenta, crear el token y enviar el correo) al ejecutor y vuelve enseguida: la
   * respuesta tarda lo mismo exista o no la cuenta, y nunca falla por ella. Sin cuenta, o si la cuenta pidió un enlace
   * hace menos de 60 s, no hace nada.
   */
  public void requestReset(String identifier) {
    executor.execute(() -> {
      try {
        issue(identifier).ifPresent(this::deliver);
      } catch (RuntimeException e) {
        LOG.error("No se pudo preparar el enlace de recuperación de contraseña", e);
      }
    });
  }

  /** Crea el token en su propia transacción (confirmada antes de enviar) y devuelve el correo que hay que mandar. */
  private Optional<MailMessage> issue(String identifier) {
    return transactions.executeWrite(status -> {
      var found = accounts.find(identifier);
      if (found.isEmpty()) return Optional.<MailMessage>empty();
      // Bloquear la fila del usuario serializa dos peticiones a la vez para la misma cuenta: solo una pasa el límite.
      var user = entityManager.find(UserEntity.class, found.get().getId(), LockModeType.PESSIMISTIC_WRITE);
      var now = now();
      var latest = tokens.findLatestCreatedAt(user.getId());
      if (latest.isPresent() && latest.get().plus(MIN_INTERVAL).isAfter(now)) return Optional.<MailMessage>empty();
      tokens.invalidateUnused(user.getId(), now);
      var token = newToken();
      tokens.save(PasswordResetTokenEntity.create(UUID.randomUUID().toString(), user.getId(), sha256Hex(token),
          now.plus(TTL), now));
      return Optional.of(PasswordResetMail.build(user.getEmail(), user.getUsername(), config.webOrigin(), token));
    });
  }

  /** El cliente ya tiene su respuesta: un fallo de envío solo se registra. */
  private void deliver(MailMessage message) {
    try {
      mail.send(message);
    } catch (RuntimeException e) {
      LOG.error("No se pudo enviar el correo de recuperación de contraseña", e);
    }
  }

  /**
   * Gasta el token y pone la contraseña nueva en la misma transacción. La fila del token se bloquea al leerla, así que
   * de dos envíos a la vez con el mismo token el segundo espera y ya lo ve usado.
   */
  @Transactional
  public AuthUser reset(String token, String password) {
    if (token == null) throw new InvalidResetLinkException();
    var trimmed = token.trim();
    if (!TOKEN_FORMAT.matcher(trimmed).matches()) throw new InvalidResetLinkException();
    var now = now();
    var row = tokens.findByTokenHashForUpdate(sha256Hex(trimmed))
        .filter(t -> t.getUsedAt() == null && t.getExpiresAt().isAfter(now))
        .orElseThrow(InvalidResetLinkException::new);
    var user = users.findById(row.getUserId()).orElseThrow(InvalidResetLinkException::new);
    row.markUsed(now);
    user.changePassword(hasher.hash(password), now);
    tokens.update(row);
    users.update(user);
    return UserIdentityMapper.identityFromUser(user);
  }

  /** Las columnas son {@code timestamp(3)}: se trunca a milisegundos para comparar lo mismo que se guarda. */
  private Instant now() {
    return clock.instant().truncatedTo(ChronoUnit.MILLIS);
  }

  private String newToken() {
    var bytes = new byte[32];
    random.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static String sha256Hex(String token) {
    try {
      var digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
      return HexFormat.of().formatHex(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 no disponible", e);
    }
  }
}
