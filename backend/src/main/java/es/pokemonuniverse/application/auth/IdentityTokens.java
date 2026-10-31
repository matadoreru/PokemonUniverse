package es.pokemonuniverse.application.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import es.pokemonuniverse.config.PuConfig;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import es.pokemonuniverse.domain.identity.UserRole;
import jakarta.inject.Singleton;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;

/** Emite y verifica el JWT HS256 de la cookie {@code pu_session}, idéntico al de {@code apps/server/src/auth/tokens.ts}. */
@Singleton
public class IdentityTokens {

  private static final Duration GUEST_TTL = Duration.ofDays(30);
  private static final Duration USER_TTL = Duration.ofDays(7);

  private final byte[] secret;

  public IdentityTokens(PuConfig config) {
    this.secret = config.auth().secret().getBytes(StandardCharsets.UTF_8);
  }

  public String sign(AuthUser user, Instant now) {
    var ttl = user.kind() == AuthUser.Kind.GUEST ? GUEST_TTL : USER_TTL;
    var claims = new JWTClaimsSet.Builder()
        .subject(user.id())
        .issueTime(Date.from(now))
        .expirationTime(Date.from(now.plus(ttl)))
        .claim("displayName", user.displayName())
        .claim("kind", user.kind().name())
        .claim("avatar", avatarClaim(user.avatar()));
    if (user.email() != null) claims.claim("email", user.email());
    if (user.role() != null) claims.claim("role", user.role().name());
    try {
      var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims.build());
      jwt.sign(new MACSigner(secret));
      return jwt.serialize();
    } catch (JOSEException e) {
      throw new IllegalStateException("Cannot sign session token", e);
    }
  }

  public AuthUser verify(String token) {
    try {
      var jwt = SignedJWT.parse(token);
      if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm()) || !jwt.verify(new MACVerifier(secret))) {
        throw new InvalidTokenException("Invalid signature");
      }
      var claims = jwt.getJWTClaimsSet();
      var exp = claims.getExpirationTime();
      if (exp != null && !exp.toInstant().isAfter(Instant.now())) {
        throw new InvalidTokenException("Token expired");
      }
      var id = claims.getSubject();
      var displayName = claims.getClaim("displayName");
      var kindName = claims.getClaim("kind");
      if (id == null || id.isEmpty() || !(displayName instanceof String name) || !(kindName instanceof String kindText)) {
        throw new InvalidTokenException("Missing required claims");
      }
      var kind = switch (kindText) {
        case "USER" -> AuthUser.Kind.USER;
        case "GUEST" -> AuthUser.Kind.GUEST;
        default -> throw new InvalidTokenException("Invalid kind");
      };
      var email = claims.getClaim("email") instanceof String e ? e : null;
      var role = kind == AuthUser.Kind.USER ? parseRole(claims.getClaim("role")) : null;
      return new AuthUser(id, name, kind, email, role, parseAvatar(claims.getClaim("avatar")));
    } catch (ParseException | JOSEException e) {
      throw new InvalidTokenException("Malformed token", e);
    }
  }

  private static UserRole parseRole(Object raw) {
    return "ADMIN".equals(raw) ? UserRole.ADMIN : UserRole.USER;
  }

  private static Map<String, Object> avatarClaim(AvatarRef avatar) {
    var map = new LinkedHashMap<String, Object>();
    switch (avatar) {
      case AvatarRef.Default d -> map.put("type", "DEFAULT");
      case AvatarRef.Preset p -> {
        map.put("type", "PRESET");
        map.put("value", p.value());
      }
      case AvatarRef.Custom c -> {
        map.put("type", "CUSTOM");
        map.put("value", c.value());
        map.put("version", c.version());
      }
    }
    return map;
  }

  /** Mismo criterio estricto que el esquema de Node: cualquier desviación cae a {@code DEFAULT}. */
  private static AvatarRef parseAvatar(Object raw) {
    var fallback = new AvatarRef.Default();
    if (!(raw instanceof Map<?, ?> map) || !(map.get("type") instanceof String type)) return fallback;
    var keys = map.keySet();
    switch (type) {
      case "DEFAULT":
        return fallback;
      case "PRESET":
        if (keys.size() == 2 && map.get("value") instanceof String v && AvatarRef.isValidPreset(v)) {
          return new AvatarRef.Preset(v);
        }
        return fallback;
      case "CUSTOM":
        if (keys.size() == 3
            && map.get("value") instanceof String v
            && AvatarRef.isValidCustomFile(v)
            && map.get("version") instanceof Number n
            && n.doubleValue() >= 0
            && n.doubleValue() == Math.floor(n.doubleValue())) {
          return new AvatarRef.Custom(v, n.longValue());
        }
        return fallback;
      default:
        return fallback;
    }
  }
}
