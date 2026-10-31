package es.pokemonuniverse.adapters.in.rest.identity;

import es.pokemonuniverse.domain.identity.AuthUser;
import io.micronaut.context.annotation.Requires;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import jakarta.inject.Inject;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Requires(env = "test")
@Controller("/test-identity")
class TestIdentityController {

  @Inject SessionCookies cookies;

  @Get
  Map<String, Object> whoAmI(@Identity Optional<AuthUser> user) {
    var map = new HashMap<String, Object>();
    map.put("id", user.map(AuthUser::id).orElse(null));
    return map;
  }

  @Get("/bare")
  String bare(@Identity AuthUser user) {
    return "should not be reached";
  }

  @Get("/user")
  Optional<AuthUser> user(@Identity Optional<AuthUser> user) {
    return user;
  }

  @Get("/login")
  io.micronaut.http.MutableHttpResponse<String> login() {
    var res = HttpResponse.ok("ok");
    cookies.establish(res, "abc");
    return res;
  }

  @Get("/logout")
  io.micronaut.http.MutableHttpResponse<String> logout() {
    var res = HttpResponse.ok("ok");
    cookies.clear(res);
    return res;
  }
}
