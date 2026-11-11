import type { PokemonPaletteGuessConfig, PokemonPaletteHintKind } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { PublicAttemptsToggle } from '../../room/guess-kit/PublicAttemptsToggle';
import { Segmented, Toggle } from '../../ui';
import c from '../ConfigPanel.module.css';

const SIZE_LABEL = 'Máximo de colores visibles';
const HINT_KINDS_LABEL = 'Qué pistas salen';
const SIZES = [5, 6, 7, 8] as const;
const hintOptions: Array<{ id: PokemonPaletteHintKind; label: string }> = [
  { id: 'GENERATION', label: 'Generación' }, { id: 'TYPE', label: 'Tipos' }, { id: 'TYPE_COUNT', label: 'Nº de tipos' },
  { id: 'EVOLUTION', label: 'Etapa evolutiva' }, { id: 'CATEGORY', label: 'Legendario / Mítico' },
];

/**
 * Ajustes de Adivina por la Paleta con los controles del catálogo: generaciones, cuántos colores se ven (`Segmented`),
 * las pistas adicionales con sus tipos (`Toggle`) y los tiempos (`ConfigRange`, en los límites del contrato: 10–60 s y
 * 1–20 rondas).
 */
export function PokemonPaletteGuessConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonPaletteGuessConfig;
  const update = (next: Partial<PokemonPaletteGuessConfig>) => void onChange({ ...value, ...next });
  const toggleHint = (hint: PokemonPaletteHintKind, on: boolean) => update({ hintKinds: on ? [...value.hintKinds.filter((kind) => kind !== hint), hint] : value.hintKinds.filter((kind) => kind !== hint) });
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Solo entrarán Pokémon cuya paleta haya sido persistida por DataSync." onChange={(generations) => update({ generations })} />
    <Segmented<number> label={SIZE_LABEL} showLabel hint="Se mostrarán todos los colores dominantes disponibles hasta este máximo; nunca se descartará un Pokémon por tener menos." value={value.paletteSize} options={SIZES.map((size) => ({ value: size, label: String(size), disabled }))} onChange={(paletteSize) => update({ paletteSize })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="Cuanto antes aciertes, más puntos; tras un fallo hay una breve espera." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
    <Toggle label="Pistas adicionales" hint={value.hintsEnabled ? 'Visibles públicamente desde el inicio.' : 'Solo se mostrará la paleta.'} checked={value.hintsEnabled} disabled={disabled} onChange={(hintsEnabled) => update({ hintsEnabled })} />
    {value.hintsEnabled && <div className={c.group} role="group" aria-label={HINT_KINDS_LABEL}>
      <span className={c.label} aria-hidden="true">{HINT_KINDS_LABEL}</span>
      <div className={c.kinds}>{hintOptions.map((hint) => <Toggle key={hint.id} label={hint.label} checked={value.hintKinds.includes(hint.id)} disabled={disabled} onChange={(on) => toggleHint(hint.id, on)} />)}</div>
    </div>}
    <PublicAttemptsToggle checked={value.publicAttempts} disabled={disabled} onChange={(publicAttempts) => void onChange({ ...value, publicAttempts })} />
  </fieldset>;
}
