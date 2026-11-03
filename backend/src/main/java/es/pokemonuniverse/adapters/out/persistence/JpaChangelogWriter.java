package es.pokemonuniverse.adapters.out.persistence;

import es.pokemonuniverse.application.changelog.ChangelogWriter;
import jakarta.inject.Singleton;

/**
 * {@link ChangelogWriter} sobre {@link ChangelogRepository}. Cada llamada del repositorio es su propia transacción y
 * confirma antes de volver, así que la violación de unicidad llega dentro del {@code try} (aquí no se abre otra
 * transacción, que movería el commit fuera de él).
 */
@Singleton
public class JpaChangelogWriter implements ChangelogWriter {

  private final ChangelogRepository repository;

  public JpaChangelogWriter(ChangelogRepository repository) {
    this.repository = repository;
  }

  @Override
  public ChangelogEntity insert(ChangelogEntity entry) {
    try {
      return repository.save(entry);
    } catch (RuntimeException e) {
      if (JpaCustomCategoryStore.isUniqueViolation(e)) throw new DuplicateVersionException(e);
      throw e;
    }
  }

  @Override
  public ChangelogEntity update(ChangelogEntity entry) {
    try {
      return repository.update(entry);
    } catch (RuntimeException e) {
      if (JpaCustomCategoryStore.isUniqueViolation(e)) throw new DuplicateVersionException(e);
      throw e;
    }
  }
}
