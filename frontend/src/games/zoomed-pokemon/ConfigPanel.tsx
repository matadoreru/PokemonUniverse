import type { ZoomedPokemonConfig, ZoomedPokemonHintKind, ZoomedPokemonImageMode } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Segmented, Toggle } from '../../ui';
import { roundsLabel, secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';

const IMAGE_LABEL = 'Imagen';
const HINT_KINDS_LABEL = 'Qué pistas salen';
const modes: Array<{ value: ZoomedPokemonImageMode; label: string; description: string }> = [
  { value: 'MIXED', label: 'Mixto', description: 'Alterna artworks y sprites, con fallback seguro.' },
  { value: 'SPRITE', label: 'Sprites', description: 'Usa el sprite del catálogo actual.' },
  { value: 'ARTWORK', label: 'Artworks', description: 'Solo PNG locales válidos.' },
];
const hintOptions: Array<{ id: ZoomedPokemonHintKind; label: string }> = [
  { id: 'GENERATION', label: 'Generación' }, { id: 'TYPE', label: 'Tipo' }, { id: 'TYPE_COUNT', label: 'Nº de tipos' },
  { id: 'EVOLUTION', label: 'Etapa evolutiva' }, { id: 'CATEGORY', label: 'Legendario / Mítico' },
];

/**
 * Ajustes de Zoomed Pokémon con los controles del catálogo: generaciones, de dónde sale la imagen (`Segmented`), las
 * formas y las pistas adicionales con sus tipos (`Toggle`) y los tiempos (`ConfigRange`, en los límites del contrato:
 * 15–60 s y 1–20 rondas).
 */
export function ZoomedPokemonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ZoomedPokemonConfig;
  const update = (next: Partial<ZoomedPokemonConfig>) => void onChange({ ...value, ...next });
  const toggleHint = (hint: ZoomedPokemonHintKind, on: boolean) => update({ hintKinds: on ? [...value.hintKinds.filter((item) => item !== hint), hint] : value.hintKinds.filter((item) => item !== hint) });
  const mode = modes.find((option) => option.value === value.imageMode) ?? modes[0]!;
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GenerationSelector selected={value.generations} onChange={(generations) => update({ generations })} />
    <Segmented<ZoomedPokemonImageMode> label={IMAGE_LABEL} showLabel hint={`${mode.description}${value.imageMode === 'ARTWORK' ? ' El servidor validará que exista al menos un artwork para estas generaciones al empezar.' : ''}`} value={value.imageMode} options={modes.map((option) => ({ value: option.value, label: option.label, disabled }))} onChange={(imageMode) => update({ imageMode })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={15} max={60} step={5} disabled={disabled} formatValue={secondsLabel} hint="La cámara se aleja cada cuarto de ronda: cuanto antes aciertes, más bonificación." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <div className={c.pair}>
      <Toggle label="Formas y variantes" hint="Regionales, Mega y Gigamax cuando el catálogo tiene su clave e imagen propias." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => update({ includeForms })} />
      <Toggle label="Pistas adicionales" hint={value.hintsEnabled ? 'Visibles desde el primer segundo.' : 'Solo se muestra el recorte.'} checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => update({ hintsEnabled })} />
    </div>
    {value.hintsEnabled && <div className={c.group} role="group" aria-label={HINT_KINDS_LABEL}>
      <span className={c.label} aria-hidden="true">{HINT_KINDS_LABEL}</span>
      <div className={c.kinds}>{hintOptions.map((hint) => <Toggle key={hint.id} label={hint.label} checked={value.hintKinds.includes(hint.id)} disabled={disabled} onChange={(on) => toggleHint(hint.id, on)} />)}</div>
    </div>}
    <p className={c.note}>Nunca se usa la altura ni el peso como pista.</p>
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
