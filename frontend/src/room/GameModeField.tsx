import { CLASSIC_MODE_LABEL, gameModeCatalog } from '@pokemon-universe/shared/public';
import { Segmented } from '../ui';
import s from './GameModeField.module.css';

const MODE_LABEL = 'Modo';

interface Props {
  gameId: string;
  /** El `mode` de la configuración; ausente (configuración anterior a los modos) es `CLASSIC`. */
  value: string | undefined;
  onChange(mode: string): void;
  disabled: boolean;
}

/**
 * Selector «Modo» de los ajustes de un juego con modos (`Segmented` con «Clásico» y el modo nuevo) y, debajo, la línea
 * que explica las reglas del modo elegido. Sin catálogo de modos para `gameId` no pinta nada.
 */
export function GameModeField({ gameId, value, onChange, disabled }: Props) {
  const catalog = gameModeCatalog(gameId);
  if (!catalog) return null;
  const mode = value !== undefined && catalog.modes.includes(value) ? value : 'CLASSIC';
  const options = catalog.modes.map((option) => ({ value: option, label: catalog.labels[option] ?? CLASSIC_MODE_LABEL, disabled }));
  const text = catalog.texts[mode];
  return <div className={s.field}>
    <span className={s.label} aria-hidden="true">{MODE_LABEL}</span>
    <Segmented<string> label={MODE_LABEL} value={mode} options={options} onChange={onChange} />
    {text && <p className={s.text}>{text}</p>}
  </div>;
}
