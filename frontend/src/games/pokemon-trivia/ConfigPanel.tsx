import { POKEMON_TRIVIA_QUESTION_TYPES, type PokemonTriviaConfig, type PokemonTriviaQuestionType } from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { Chip, Segmented, Toggle } from '../../ui';
import { triviaCategoryLabels, triviaDifficultyLabels } from './presentation';
import { secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

/**
 * Ajustes de Pokémon Trivia con los controles del catálogo: generaciones, dificultad y opciones por pregunta
 * (`Segmented`), las categorías (`Toggle` por categoría, con la cuenta en un `Chip`; al menos una) y los tiempos
 * (`ConfigRange`).
 */
export function PokemonTriviaConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonTriviaConfig;
  const toggle = (type: PokemonTriviaQuestionType, on: boolean) => {
    if (!on && value.questionTypes.length === 1) return;
    void onChange({ ...value, questionTypes: on ? [...value.questionTypes, type] : value.questionTypes.filter((entry) => entry !== type) });
  };
  return <fieldset disabled={disabled} className={c.panel}>
    <GenerationSelector selected={value.generations} label="Generaciones" description="Las preguntas se generan únicamente con el catálogo local seleccionado." onChange={(generations) => void onChange({ ...value, generations })} />
    <div className={c.pair}>
      <Segmented label="Dificultad" showLabel hint="La dificultad ajusta lo parecidas que son las opciones numéricas." value={value.difficulty} options={(['EASY', 'NORMAL', 'HARD'] as const).map((difficulty) => ({ value: difficulty, label: triviaDifficultyLabels[difficulty], disabled }))} onChange={(difficulty) => void onChange({ ...value, difficulty })} />
      <Segmented label="Opciones por pregunta" showLabel value={value.optionCount} options={[3, 4].map((count) => ({ value: count, label: `${count} opciones`, disabled }))} onChange={(optionCount) => void onChange({ ...value, optionCount })} />
    </div>
    <div className={c.head}>
      <span className={c.label}>Categorías de preguntas</span>
      <Chip tone="ok">{value.questionTypes.length} activas</Chip>
    </div>
    <div className={s.kinds} role="group" aria-label="Categorías de preguntas">{POKEMON_TRIVIA_QUESTION_TYPES.map((type) => {
      const on = value.questionTypes.includes(type);
      return <Toggle key={type} label={triviaCategoryLabels[type]} checked={on} disabled={disabled || (on && value.questionTypes.length === 1)} onChange={(next) => toggle(type, next)} />;
    })}</div>
    <p className={c.help}>Mantén al menos una categoría activa.</p>
    <div className={c.pair}>
      <ConfigRange label="Tiempo por pregunta" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={secondsLabel} hint="La pregunta se cierra antes si todos han respondido." onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de preguntas" value={value.rounds} min={1} max={30} disabled={disabled} formatValue={(rounds) => (rounds === 1 ? '1 pregunta' : `${rounds} preguntas`)} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
  </fieldset>;
}
