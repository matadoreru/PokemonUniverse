package es.pokemonuniverse.config;

import com.luciad.imageio.webp.WebPImageReaderSpi;
import io.micronaut.context.annotation.Context;
import javax.imageio.spi.IIORegistry;
import javax.imageio.spi.ImageReaderSpi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code webp-imageio} registra por SPI un lector WebP nativo (libwebp vía JNI) para toda la aplicación. La libwebp solo
 * debe codificar avatares: al arrancar el contexto (bean {@link Context}, antes de servir peticiones, también en los
 * tests) se retira su lector del registro de ImageIO, de modo que cualquier {@code ImageIO.read} de WebP (proxy de
 * assets, artworks, avatares) usa siempre el lector Java puro de TwelveMonkeys, sin depender del orden del registro.
 * El escritor se instancia directamente en {@code AvatarImageProcessor}, así que no se toca.
 */
@Context
public class ImageIoReaders {

  private static final Logger LOG = LoggerFactory.getLogger(ImageIoReaders.class);

  public ImageIoReaders() {
    deregisterNativeWebpReader();
  }

  static void deregisterNativeWebpReader() {
    var registry = IIORegistry.getDefaultInstance();
    var spi = registry.getServiceProviderByClass(WebPImageReaderSpi.class);
    if (spi != null && registry.deregisterServiceProvider(spi, ImageReaderSpi.class)) {
      LOG.debug("Lector WebP nativo de webp-imageio retirado de ImageIO");
    }
  }
}
