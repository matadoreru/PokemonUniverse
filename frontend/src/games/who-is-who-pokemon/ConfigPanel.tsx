import type { WhoIsWhoPokemonConfig } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const turnTimes = [20, 30, 40, 60, 90] as const;
const roundCounts = [5, 10, 15, 20, 25] as const;

/**
 * Ajustes de Quién es Quién con los controles del catálogo: generaciones (el selector heredado, F9), cómo se elige el
 * secreto (`Segmented`), cartas del tablero (`ConfigRange` de 5 a 50, lo que admite el motor), tiempo por turno y rondas
 * máximas (`Segmented` con los valores de antes), el plazo para elegir el secreto (`ConfigRange`, 0 = sin límite) y las
 * formas regionales (`Toggle`).
 */
export function WhoIsWhoPokemonConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as WhoIsWhoPokemonConfig;
  const selection = value.selectionSeconds ?? 30;
  return <fieldset disabled={disabled} className={s.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones del tablero" description="El pool se mezcla en el servidor antes de repartir los secretos." onChange={(generations) => void onChange({ ...value, generations })} />
    <Segmented label="Pokémon secreto" showLabel hint={value.secretSelection === 'RANDOM' ? 'El servidor asigna uno a cada equipo.' : 'Cada equipo elige en secreto una carta del tablero.'} value={value.secretSelection} options={[{ value: 'RANDOM', label: 'Aleatorio', disabled }, { value: 'PLAYER_CHOICE', label: 'Por el equipo', disabled }]}
      onChange={(secretSelection) => void onChange({ ...value, secretSelection })} />
    <div className={s.pair}>
      <ConfigRange label="Pokémon en el tablero" value={value.boardSize} min={5} max={50} disabled={disabled} formatValue={(size) => `${size} Pokémon`} hint="Rango permitido: 5–50 Pokémon." onCommit={(boardSize) => onChange({ ...value, boardSize })} />
      <ConfigRange label="Tiempo para elegir secreto" value={selection} min={0} max={120} step={5} disabled={disabled}
        formatValue={(seconds) => (seconds === 0 ? 'Sin límite' : `${seconds} s`)} hint="Si lo elige el equipo: al agotarse, se asigna uno al azar. 0 = sin límite." onCommit={(selectionSeconds) => onChange({ ...value, selectionSeconds })} />
    </div>
    <div className={s.pair}>
      <Segmented label="Tiempo por turno" showLabel value={value.turnSeconds} options={turnTimes.map((seconds) => ({ value: seconds, label: `${seconds} s`, disabled }))} onChange={(turnSeconds) => void onChange({ ...value, turnSeconds })} />
      <Segmented label="Rondas máximas" showLabel hint="Si nadie adivina antes, la partida acaba en empate." value={value.rounds} options={roundCounts.map((rounds) => ({ value: rounds, label: String(rounds), disabled }))} onChange={(rounds) => void onChange({ ...value, rounds })} />
    </div>
    <Toggle label="Incluir formas regionales y variantes" hint="Usa todas las formas que el PokémonRepository marque como compatibles." checked={value.includeForms} disabled={disabled} onChange={(includeForms) => void onChange({ ...value, includeForms })} />
    <p className={s.note}>Cada equipo solo recibe su propio secreto y sus cartas bajadas; los del rival se revelan al final de la partida.</p>
  </fieldset>;
}
