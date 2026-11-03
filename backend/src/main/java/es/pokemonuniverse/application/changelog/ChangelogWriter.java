package es.pokemonuniverse.application.changelog;

import es.pokemonuniverse.adapters.out.persistence.ChangelogEntity;

/**
 * Escrituras de novedades. La unicidad de {@code version} de la BD respalda la comprobación previa del servicio: una
 * violación ({@code 23505}, P2002) se lanza como {@link DuplicateVersionException}. Las lecturas siguen yendo al
 * repositorio (concesión de la etapa 1: el servicio usa las entidades de persistencia).
 */
public interface ChangelogWriter {

  ChangelogEntity insert(ChangelogEntity entry);

  ChangelogEntity update(ChangelogEntity entry);

  /** La BD rechazó la fila por la unicidad de {@code version}. */
  final class DuplicateVersionException extends RuntimeException {
    public DuplicateVersionException(Throwable cause) {
      super("Duplicate changelog version", cause);
    }
  }
}
