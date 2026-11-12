package es.pokemonuniverse;

/** Lo que solo cambia dentro de un binario de GraalVM native-image; en la JVM nada de esto se ejecuta. */
public final class NativeImage {

  /** GraalVM fija esta propiedad en el binario ({@code runtime}); en la JVM no existe. */
  public static final boolean RUNNING = System.getProperty("org.graalvm.nativeimage.imagecode") != null;

  private NativeImage() {}

  /**
   * Hibernate genera clases con ByteBuddy al arrancar, y un binario nativo no puede definir clases nuevas. Con este
   * ajuste Micronaut registra su proveedor de bytecode basado en las introspecciones de compilación
   * ({@code IntrospectedHibernateBytecodeProvider}). Las entidades no tienen asociaciones, así que no hacen falta
   * proxies {@code @GenerateProxy}. Una propiedad de sistema ya fijada ({@code -D…}) tiene prioridad.
   */
  static void configure() {
    if (System.getProperty("jpa.default.compile-time-hibernate-proxies") == null) {
      System.setProperty("jpa.default.compile-time-hibernate-proxies", "true");
    }
  }
}
