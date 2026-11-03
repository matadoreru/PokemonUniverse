package es.pokemonuniverse.application.admin;

import java.util.List;

/** Página pedida y total sin paginar; el adaptador REST le añade {@code pageSize} y {@code totalPages}. */
public record AdminPage<T>(List<T> items, long page, long total) {

  /** {@code ADMIN_PAGE_SIZE} de {@code shared/admin.ts}. */
  public static final int PAGE_SIZE = 20;

  /** {@code Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))}. */
  public long totalPages() {
    return Math.max(1, (total + PAGE_SIZE - 1) / PAGE_SIZE);
  }
}
