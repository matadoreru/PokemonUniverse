import {
  HIGHER_LOWER_CATEGORIES,
  HIGHER_LOWER_DIFFICULTIES,
  HIGHER_LOWER_VISIBILITIES,
  type HigherLowerAnswerVisibility,
  type HigherLowerCategory,
  type HigherLowerConfig,
  type HigherLowerDifficulty,
} from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { GameModeField, useModeShown } from '../../room/GameModeField';
import { higherLowerVisibilityLabels } from '../../room/higher-lower-labels';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';
import { Card, cx, Segmented, Toggle } from '../../ui';
import s from './ConfigPanel.module.css';

const categoryLabels: Record<HigherLowerCategory, string> = {
  DEX_NUMBER: 'N.º Pokédex',
  HP: 'HP',
  ATTACK: 'Ataque',
  DEFENSE: 'Defensa',
  SPECIAL_ATTACK: 'Ataque Esp.',
  SPECIAL_DEFENSE: 'Defensa Esp.',
  SPEED: 'Velocidad',
  BASE_STAT_TOTAL: 'Total stats',
};

const difficultyCopy: Record<HigherLowerDifficulty, { label: string; description: string }> = {
  VERY_EASY: { label: 'Muy fácil', description: 'Diferencias muy amplias' },
  EASY: { label: 'Fácil', description: 'Diferencias claras' },
  NORMAL: { label: 'Normal', description: 'Valores equilibrados' },
  HARD: { label: 'Difícil', description: 'Stats bastante cercanos' },
  VERY_HARD: { label: 'Muy difícil', description: 'Valores casi iguales' },
};

const CATEGORIES_LABEL = 'Categorías';
const DIFFICULTY_LABEL = 'Dificultad de comparación';
const VISIBILITY_LABEL = 'Mostrar votaciones de los otros jugadores';

/** Nivel de la dificultad (1–5) en pips: cuántos van llenos. */
function DifficultyPips({ level }: { level: number }) {
  return <span className={s.pips}>{HIGHER_LOWER_DIFFICULTIES.map((difficulty, index) => <i key={difficulty} className={cx(s.pip, index < level && s.pipOn)} />)}</span>;
}

/**
 * Ajustes de Higher or Lower con los controles del catálogo: el modo (`GameModeField`; «Racha infinita» no tiene
 * número de rondas), las categorías (`Toggle`, al menos una queda encendida),
 * la dificultad (`Card` seleccionables con su nivel en pips), las generaciones, si se ve el valor del anterior
 * (`Toggle`), la visibilidad de las respuestas (`Segmented`, con el aviso de copia en «En directo») y los tiempos
 * (`ConfigRange`, el `Slider`).
 */
export function HigherLowerConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as HigherLowerConfig;
  const shown = useModeShown('higher-lower', value.mode);
  const toggleCategory = (category: HigherLowerCategory) => {
    const categories = value.categories.includes(category)
      ? value.categories.filter((item) => item !== category)
      : [...value.categories, category];
    if (categories.length) void onChange({ ...value, categories });
  };
  const visibilities = HIGHER_LOWER_VISIBILITIES.map((visibility) => ({ value: visibility, label: higherLowerVisibilityLabels[visibility], disabled }));
  const onlyCategory = value.categories.length === 1 ? value.categories[0] : null;

  return <fieldset disabled={disabled} className={s.panel}>
    <GameModeField gameId="higher-lower" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <div className={s.group}>
      <span className={s.label} aria-hidden="true">{CATEGORIES_LABEL}</span>
      <div className={s.categories} role="group" aria-label={CATEGORIES_LABEL}>{HIGHER_LOWER_CATEGORIES.map((category) => <Toggle key={category} label={categoryLabels[category]} checked={value.categories.includes(category)}
        disabled={disabled} className={cx(s.category)} {...(onlyCategory === category ? { hint: 'Al menos una' } : {})} onChange={() => toggleCategory(category)} />)}</div>
    </div>

    <div className={s.group}>
      <span className={s.label} aria-hidden="true">{DIFFICULTY_LABEL}</span>
      <div className={s.difficulties} role="group" aria-label={DIFFICULTY_LABEL}>{HIGHER_LOWER_DIFFICULTIES.map((difficulty, index) => {
        const copy = difficultyCopy[difficulty];
        return <Card key={difficulty} size="sm" name={copy.label} art={<DifficultyPips level={index + 1} />} state={value.difficulty === difficulty ? 'selected' : 'idle'} disabled={disabled}
          onSelect={() => { if (value.difficulty !== difficulty) void onChange({ ...value, difficulty }); }}>
          <span className={s.cardHint}>{copy.description}</span>
        </Card>;
      })}</div>
    </div>

    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />

    <div className={s.pair}>
      <div className={s.group}>
        <Toggle label="Mostrar el valor del anterior Pokémon" hint="Si no, los dos valores salen al revelar" checked={value.showPreviousValue} disabled={disabled} onChange={(showPreviousValue) => void onChange({ ...value, showPreviousValue })} />
      </div>
      <Segmented<HigherLowerAnswerVisibility> label={VISIBILITY_LABEL} showLabel hint={value.answerVisibility === 'LIVE' ? LIVE_VISIBILITY_WARNING : undefined} value={value.answerVisibility} options={visibilities} onChange={(answerVisibility) => void onChange({ ...value, answerVisibility })} />
    </div>

    <div className={s.ranges}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      {shown('CLASSIC') && <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} formatValue={(rounds) => `${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}`} onCommit={(rounds) => onChange({ ...value, rounds })} />}
    </div>
  </fieldset>;
}
