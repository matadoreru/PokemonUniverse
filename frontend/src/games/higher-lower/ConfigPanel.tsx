import {
  HIGHER_LOWER_CATEGORIES,
  HIGHER_LOWER_DIFFICULTIES,
  HIGHER_LOWER_VISIBILITIES,
  type HigherLowerCategory,
  type HigherLowerConfig,
  type HigherLowerDifficulty,
} from '@pokemon-universe/shared/public';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { higherLowerVisibilityLabels } from '../../room/higher-lower-labels';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';

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

export function HigherLowerConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as HigherLowerConfig;
  const toggleCategory = (category: HigherLowerCategory) => {
    const categories = value.categories.includes(category)
      ? value.categories.filter((item) => item !== category)
      : [...value.categories, category];
    if (categories.length) void onChange({ ...value, categories });
  };

  return (
    <fieldset disabled={disabled} className="space-y-6">
      <div>
        <span className="label">Categorías</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHER_LOWER_CATEGORIES.map((category) => (
            <button type="button" key={category} aria-pressed={value.categories.includes(category)} onClick={() => toggleCategory(category)} className={`toggle-option text-left ${value.categories.includes(category) ? 'border-electric bg-electric text-night' : ''}`}>
              {categoryLabels[category]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Dificultad de comparación</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {HIGHER_LOWER_DIFFICULTIES.map((difficulty) => {
            const copy = difficultyCopy[difficulty];
            const selected = value.difficulty === difficulty;
            return (
              <button
                type="button"
                key={difficulty}
                onClick={() => void onChange({ ...value, difficulty })}
                aria-pressed={selected}
                className={`toggle-option py-3 text-left ${selected ? 'border-berry bg-berry text-night' : 'text-ink'}`}
              >
                <span className="block font-extrabold">{copy.label}</span>
                <span className={`mt-1 block text-xs font-semibold ${selected ? 'text-night/75' : 'text-ink/65'}`}>{copy.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} accent="aqua" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Mostrar el valor del anterior Pokémon</span>
          <div className="grid grid-cols-2 gap-2">
            {([[true, 'Sí'], [false, 'No']] as const).map(([choice, label]) => (
              <button type="button" key={String(choice)} aria-pressed={value.showPreviousValue === choice} onClick={() => void onChange({ ...value, showPreviousValue: choice })} className={`toggle-option ${value.showPreviousValue === choice ? 'border-berry bg-berry text-night' : 'text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Mostrar votaciones de los otros jugadores</span>
          <div className="grid grid-cols-2 gap-2">
            {HIGHER_LOWER_VISIBILITIES.map((visibility) => (
              <button type="button" key={visibility} aria-pressed={value.answerVisibility === visibility} onClick={() => void onChange({ ...value, answerVisibility: visibility })} className={`toggle-option ${value.answerVisibility === visibility ? 'border-leaf bg-leaf text-night' : 'text-ink'}`}>
                {higherLowerVisibilityLabels[visibility]}
              </button>
            ))}
          </div>
          {value.answerVisibility === 'LIVE' && <p className="mt-2 text-sm font-bold text-ink/65">{LIVE_VISIBILITY_WARNING}</p>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
        <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} accent="aqua" formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
      </div>
    </fieldset>
  );
}
