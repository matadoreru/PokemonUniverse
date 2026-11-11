package es.pokemonuniverse.application.avatar;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import es.pokemonuniverse.adapters.out.storage.AvatarImageProcessor;
import es.pokemonuniverse.adapters.out.storage.FilesystemAvatarStorage;
import es.pokemonuniverse.application.auth.AuthService;
import es.pokemonuniverse.domain.identity.AuthUser;
import es.pokemonuniverse.domain.identity.AvatarRef;
import java.awt.Color;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AvatarUploadsTest {

  @TempDir Path dir;

  private AvatarService avatars() {
    return new AvatarService(new AvatarImageProcessor(), new FilesystemAvatarStorage(dir));
  }

  private long files() throws IOException {
    try (Stream<Path> list = Files.list(dir)) {
      return list.count();
    }
  }

  @Test
  void failedAssignmentRemovesTheNewFile() throws IOException {
    var failure = new IllegalStateException("No User found");
    var assignment = new AvatarAssignment(null, null) {
      @Override
      public AuthUser apply(String userId, AvatarRef avatar) {
        throw failure;
      }
    };
    var uploads = new AvatarUploads(avatars(), assignment, null);

    var error = assertThrows(IllegalStateException.class,
        () -> uploads.uploadForUser("user_1", TestImages.png(64, 64, Color.BLUE), "image/png"));

    assertSame(failure, error);
    assertEquals(0, files());
  }

  @Test
  void failedGuestResponseRemovesTheNewFile() throws IOException {
    var failure = new IllegalStateException("Cannot sign session token");
    var uploads = new AvatarUploads(avatars(), null, new AuthService(null, null, null, null, null));

    var error = assertThrows(IllegalStateException.class, () -> uploads.uploadForGuest("Ana",
        TestImages.png(64, 64, Color.BLUE), "image/png", guest -> {
          throw failure;
        }));

    assertSame(failure, error);
    assertEquals(0, files());
  }

  @Test
  void successfulAssignmentKeepsTheFile() throws IOException {
    var assignment = new AvatarAssignment(null, null) {
      @Override
      public AuthUser apply(String userId, AvatarRef avatar) {
        return new AuthUser(userId, "Ana", AuthUser.Kind.USER, null, null, avatar);
      }
    };
    var uploads = new AvatarUploads(avatars(), assignment, null);

    var user = uploads.uploadForUser("user_1", TestImages.png(64, 64, Color.BLUE), "image/png");

    var file = ((AvatarRef.Custom) user.avatar()).value();
    assertTrue(Files.exists(dir.resolve(file)));
    assertEquals(1, files());
  }
}
