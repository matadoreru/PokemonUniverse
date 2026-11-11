import { cx } from './cx';
import s from './UnownGlyph.module.css';

/**
 * Trazos propios de los 26 glifos, inspirados en los Unown: rodean el ojo central (que es igual en todos) con uno a tres
 * trazos gruesos (púas, arcos, ganchos, puntos) que los hacen parecer bichitos y no letras, para que una palabra
 * cifrada nunca se lea como otra palabra. Todos dejan libre un círculo de radio 9 alrededor del ojo.
 */
const GLYPH_PATHS: readonly string[] = [
  /* antenas */ 'M19 14 L14 5 M29 14 L34 5 M24 38 V44',
  /* media luna y pie */ 'M12 30 A13 13 0 0 1 30 12 M36 34 L42 40',
  /* tres púas abajo */ 'M14 36 L10 43 M24 38 V45 M34 36 L38 43',
  /* gancho a la derecha */ 'M36 14 Q44 24 36 34 L30 40 M10 24 H5',
  /* corona */ 'M10 20 A15 15 0 0 1 38 20 M24 4 V8',
  /* cola en espiral */ 'M24 38 Q24 44 30 44 Q36 44 36 38 M12 12 L16 16',
  /* alas */ 'M14 24 Q6 14 10 6 M34 24 Q42 34 38 42',
  /* anillo roto */ 'M10 20 A14.5 14.5 0 0 1 20 10 M28 38 A14.5 14.5 0 0 0 38 28',
  /* cuernos */ 'M16 16 Q8 8 14 4 M32 16 Q40 8 34 4 M18 40 H30',
  /* rayo */ 'M24 34 L15 38 L30 41 L21 46 M38 10 L43 5',
  /* soles */ 'M24 4 V9 M39 24 H44 M24 39 V44 M8 8 L13 13',
  /* media luna y púa */ 'M18 10 A15 15 0 0 0 18 38 M36 24 H44',
  /* rombo */ 'M14 10 L24 4 L34 10 M14 38 L24 44 L34 38',
  /* cola rizada */ 'M15 33 Q6 42 12 44 Q18 46 18 40 M34 12 L38 8',
  /* patas */ 'M14 24 H8 V32 M34 24 H40 V16',
  /* cuenco y antena */ 'M10 28 A14.5 14.5 0 0 0 38 28 M24 14 V4 L30 8',
  /* remolino */ 'M10 14 Q16 6 24 9 M38 34 Q32 42 24 39',
  /* rayos */ 'M24 13 V4 M16 15 L10 8 M32 15 L38 8',
  /* garra */ 'M33 16 L42 12 M34 24 H44 M33 32 L42 36',
  /* pico */ 'M14 30 L6 38 L16 40 M32 12 Q38 6 42 10',
  /* halo */ 'M14 8 Q24 2 34 8 M8 37 L13 42 M40 37 L35 42',
  /* ola */ 'M6 38 Q15 31 24 38 T42 38 M24 4 V9',
  /* brazos */ 'M14 16 V8 H20 M34 32 V40 H28',
  /* paréntesis */ 'M11 10 Q3 24 11 38 M37 10 Q45 24 37 38 M24 40 V45',
  /* lazo */ 'M20 14 Q12 2 24 4 Q36 2 28 14 M24 38 L20 44',
  /* ganchos */ 'M17 36 Q12 44 18 44 M31 36 Q36 44 30 44 M8 22 L4 18',
];

export type UnownGlyphSize = 'sm' | 'md' | 'lg';
/** Dónde va la letra descubierta: debajo del glifo (leyenda) o en su lugar (mensaje). */
export type UnownGlyphReveal = 'below' | 'replace';

export interface UnownGlyphProps {
  /** Índice del glifo (0–25); fuera de rango no se dibuja nada. */
  glyph: number;
  /** Letra ya descubierta: da la etiqueta «letra X» y se muestra según `reveal`. Sin ella, el glifo está oculto. */
  letter?: string;
  /**
   * `below` (por defecto): el glifo con la letra debajo. `replace`: la letra grande en una loseta del mismo tamaño que
   * el glifo, que desaparece (así un mensaje medio traducido se lee como texto).
   */
  reveal?: UnownGlyphReveal;
  size?: UnownGlyphSize;
  className?: string;
}

/** Glifo Unown: un ojo central con trazos gruesos alrededor, en `currentColor` para que valga en los dos temas. */
export function UnownGlyph({ glyph, letter, reveal = 'below', size = 'md', className }: UnownGlyphProps) {
  if (!Number.isInteger(glyph) || glyph < 0 || glyph >= GLYPH_PATHS.length) return null;
  const known = letter !== undefined && letter !== '';
  if (known && reveal === 'replace') {
    return (
      <span className={cx(s.glyph, s[size], className)} data-size={size} data-reveal="replace">
        <span className={s.tile} role="img" aria-label={`letra ${letter}`}>
          {letter}
        </span>
      </span>
    );
  }
  return (
    <span className={cx(s.glyph, s[size], className)} data-size={size}>
      <svg className={s.svg} viewBox="0 0 48 48" role="img" aria-label={known ? `letra ${letter}` : 'glifo oculto'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPH_PATHS[glyph]} strokeWidth={4.5} />
        <circle cx={24} cy={24} r={7} strokeWidth={3} />
        <circle cx={24} cy={24} r={3} fill="currentColor" stroke="none" />
      </svg>
      {known && (
        <span className={s.letter} aria-hidden="true">
          {letter}
        </span>
      )}
    </span>
  );
}
