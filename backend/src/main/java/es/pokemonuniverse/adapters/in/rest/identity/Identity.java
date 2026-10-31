package es.pokemonuniverse.adapters.in.rest.identity;

import io.micronaut.core.bind.annotation.Bindable;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Inyecta la identidad de la petición. Solo se admite {@code Optional<AuthUser>}; el controlador decide si exige sesión. */
@Bindable
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.PARAMETER})
public @interface Identity {}
