package es.pokemonuniverse.adapters.in.rest.admin;

import es.pokemonuniverse.application.admin.AdminPage;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/** {@code PaginatedAdminResponse<T>}: {@code {items, page, pageSize: 20, total, totalPages}}. */
@Serdeable
public record PaginatedResponse<T>(List<T> items, long page, int pageSize, long total, long totalPages) {

  static <T> PaginatedResponse<T> of(AdminPage<T> page) {
    return new PaginatedResponse<>(page.items(), page.page(), AdminPage.PAGE_SIZE, page.total(), page.totalPages());
  }

}
