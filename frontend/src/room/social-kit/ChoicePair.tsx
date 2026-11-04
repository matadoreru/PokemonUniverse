import { useEffect, useRef, type ReactNode } from 'react';
import { cx, Panel, TextCard } from '../../ui';
import { bindChoiceShortcuts } from './presentation';
import s from './ChoicePair.module.css';

/** Una de las dos opciones enfrentadas. */
export interface ChoiceOption<T extends string> {
  id: T;
  /** Lo corto de arriba («Opción A»). */
  name: string;
  /** El texto de la opción (hasta 180 caracteres): se parte en líneas, nunca se recorta. */
  text: ReactNode;
  /** Nombre accesible del botón («Opción A: Vivir con Gengar»). */
  ariaLabel: string;
}

export interface ChoicePairProps<T extends string> {
  /** Línea pequeña de arriba y nombre del grupo («El dilema · Tu decisión»). */
  kicker: string;
  /** Ayuda bajo las cartas (se oculta en el móvil y en escritorio bajo). */
  help?: ReactNode;
  /** Las dos opciones, en orden: la primera con el atajo `1` y la segunda con el `2`. */
  options: readonly [ChoiceOption<T>, ChoiceOption<T>];
  /** La elegida (controlada) o `null`. */
  value: T | null;
  onChange(id: T): void;
  /** Sin poder elegir (enviando, bloqueada, quien observa): las opciones quedan fijas, sin botones ni atajos. */
  disabled?: boolean;
  /** Atajos `1`–`2` en la pantalla (por defecto sí). Nunca mientras se escribe en un campo. */
  shortcuts?: boolean;
  /** Texto entre las dos cartas (por defecto «VS»). */
  versus?: string;
  /** Chip o nota junto al kicker (p. ej. «Tu elección: A»). */
  aside?: ReactNode;
  className?: string | undefined;
}

/**
 * Papeleta de dos opciones enfrentadas (Would You Rather), como escena de arriba: un `Panel` crema con el kicker y dos
 * `TextCard` grandes con «VS» en medio. Son conmutadores con `aria-pressed` y atajos `1` y `2` (con su insignia y
 * `aria-keyshortcuts`). En escritorio llena el alto libre (las cartas crecen y el texto se centra); en el móvil van una
 * encima de otra. La confirmación (y una segunda pregunta, como la predicción) va en la placa de abajo.
 *
 * Los atajos escuchan en `window` solo mientras se puede elegir, e ignoran modificadores, teclas mantenidas y lo que se
 * escribe en un campo (`choiceFromKey`). Sin región viva propia.
 */
export function ChoicePair<T extends string>({ kicker, help, options, value, onChange, disabled = false, shortcuts = true, versus = 'VS', aside, className }: ChoicePairProps<T>) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [first, second] = options;
  const idsKey = `${first.id}|${second.id}`;

  useEffect(() => {
    if (disabled || !shortcuts) return undefined;
    return bindChoiceShortcuts(window, idsKey.split('|') as T[], (id) => onChangeRef.current(id));
  }, [disabled, shortcuts, idsKey]);

  const card = (option: ChoiceOption<T>, index: number) => <li className={s.option} data-choice-option={option.id}>
    {disabled
      ? <TextCard name={option.name} text={option.text} size="lg" selected={value === option.id} />
      : <TextCard name={option.name} text={option.text} size="lg" selected={value === option.id} ariaLabel={option.ariaLabel}
        {...(shortcuts ? { shortcut: String(index + 1) } : {})} onSelect={() => onChange(option.id)} />}
  </li>;

  return <Panel variant="cream" as="section" aria-label={kicker} className={cx(s.panel, className)} bodyClassName={cx(s.body)}>
    <div className={s.head}>
      <span className={s.kicker}>{kicker}</span>
      {aside}
    </div>
    <ul className={s.options} aria-label="Las dos opciones" data-testid="choice-options">
      {card(first, 0)}
      <li className={s.versus} aria-hidden="true"><span className="ol">{versus}</span></li>
      {card(second, 1)}
    </ul>
    {help && <p className={s.help}>{help}</p>}
  </Panel>;
}
