import { POKEDDLE_CLUE_KEYS, validateGameConfigReadiness, type PokeddleClueKey, type PokeddleRaceConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Chip, Toggle } from '../../ui';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

const groups: Array<{ title: string; keys: PokeddleClueKey[] }> = [
  { title: 'Básicas', keys: ['generation', 'dexNumber', 'types', 'typeCount'] },
  { title: 'Estadísticas', keys: ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed', 'baseStatTotal'] },
  { title: 'Físico', keys: ['height', 'weight'] },
  { title: 'Otras', keys: ['evolutionStage', 'legendaryStatus', 'color', 'abilities'] },
];
const labels: Record<PokeddleClueKey, string> = {
  generation: 'Generación', dexNumber: 'N.º Pokédex', types: 'Tipos', typeCount: 'Número de tipos', hp: 'PS', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Especial', specialDefense: 'Def. Especial', speed: 'Velocidad', baseStatTotal: 'Total de stats', height: 'Altura', weight: 'Peso', evolutionStage: 'Etapa evolutiva', legendaryStatus: 'Legendario / Mítico', color: 'Color oficial', abilities: 'Habilidades',
};

/**
 * Ajustes de Pokédle Race con los controles del catálogo: generaciones, los tiempos (`ConfigRange`: 10–60 s y 1–30
 * rondas, dentro del contrato) y qué pistas salen en los tableros (`Toggle` por pista en sus grupos, con la cuenta en un
 * `Chip`; al menos una).
 */
export function PokeddleRaceConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokeddleRaceConfig; const validation = validateGameConfigReadiness('pokeddle-race', value);
  const active = POKEDDLE_CLUE_KEYS.filter((key) => value.clues[key]).length;
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del pool" onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} hint="La ronda se cierra antes si todos han respondido." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Máximo de rondas" value={value.maxRounds} min={1} max={30} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 ronda' : `${rounds} rondas`)} onCommit={(maxRounds) => onChange({ ...value, maxRounds })} />
    </div>
    <div className={c.head}>
      <span className={c.label}>Pistas</span>
      <Chip tone={active === 0 ? 'bad' : 'ok'}>{active} activas</Chip>
    </div>
    <p className={s.help}>Las pistas desactivadas no se calculan ni aparecen en los tableros.</p>
    <div className={s.groups}>{groups.map((group) => <div key={group.title} className={c.group} role="group" aria-label={`Pistas: ${group.title}`}>
      <span className={c.label} aria-hidden="true">{group.title}</span>
      <div className={s.kinds}>{group.keys.map((key) => <Toggle key={key} label={labels[key]} checked={value.clues[key]} disabled={disabled} onChange={(on) => void onChange({ ...value, clues: { ...value.clues, [key]: on } })} />)}</div>
    </div>)}</div>
    {validation && <p className={s.note} role="alert">{validation}</p>}
  </fieldset>;
}
