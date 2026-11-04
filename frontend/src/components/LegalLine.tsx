import { cx } from '../ui';
import tone from '../styles/tones.module.css';

/** Línea legal del pie de Inicio y Acceso. */
export function LegalLine() {
  return (
    <p className={cx('mx-auto max-w-[80ch] text-center text-13 font-bold', tone.textSky2)}>
      Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company. Todos los nombres de productos son marcas registradas de sus respectivos dueños.
    </p>
  );
}
