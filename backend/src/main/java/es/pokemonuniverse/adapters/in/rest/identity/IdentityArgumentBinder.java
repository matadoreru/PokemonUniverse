package es.pokemonuniverse.adapters.in.rest.identity;

import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.core.convert.ArgumentConversionContext;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.bind.binders.AnnotatedRequestArgumentBinder;
import jakarta.inject.Singleton;
import java.util.Optional;

/** Resuelve {@code @Identity Optional<AuthUser>} a partir del atributo que fija {@link IdentityFilter}. */
@Singleton
public class IdentityArgumentBinder implements AnnotatedRequestArgumentBinder<Identity, Object> {

  @Override
  public Class<Identity> getAnnotationType() {
    return Identity.class;
  }

  @Override
  public BindingResult<Object> bind(ArgumentConversionContext<Object> context, HttpRequest<?> source) {
    Optional<AuthUser> user = source.getAttribute(IdentityFilter.ATTRIBUTE, AuthUser.class);
    return () -> Optional.of(user);
  }
}
