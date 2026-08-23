import {
  GENERATIONS,
  HIGHER_LOWER_CATEGORIES,
  HIGHER_LOWER_DIFFICULTIES,
  type HigherLowerCategory,
  type HigherLowerConfig,
  type HigherLowerDifficulty,
} from '@pokemon-universe/shared';
import { ConfigRange } from '../../room/ConfigRange';

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
  const toggleGeneration = (generation: number) => {
    const generations = value.generations.includes(generation)
      ? value.generations.filter((item) => item !== generation)
      : [...value.generations, generation];
    if (generations.length) void onChange({ ...value, generations });
  };
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
            <button type="button" key={category} onClick={() => toggleCategory(category)} className={`rounded-xl border-2 px-3 py-2 text-left font-extrabold ${value.categories.includes(category) ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised text-ink/50'}`}>
              {categoryLabels[category]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Dificultad de comparación</span>
        <p className="mb-3 text-sm text-ink/55">A mayor dificultad, más parecidos serán los valores de los dos Pokémon.</p>
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
                className={`rounded-xl border-2 px-3 py-3 text-left transition ${selected ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised text-ink hover:border-berry/45'}`}
              >
                <span className="block font-extrabold">{copy.label}</span>
                <span className={`mt-1 block text-xs font-semibold ${selected ? 'text-white/80' : 'text-ink/50'}`}>{copy.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="label">Generaciones</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {GENERATIONS.map((generation) => (
            <button type="button" key={generation} onClick={() => toggleGeneration(generation)} className={`rounded-xl border-2 py-2 font-bold ${value.generations.includes(generation) ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/45'}`}>
              Gen {generation}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Mostrar valor anterior</span>
          <div className="grid grid-cols-2 gap-2">
            {([[true, 'Sí'], [false, 'No']] as const).map(([choice, label]) => (
              <button type="button" key={String(choice)} onClick={() => void onChange({ ...value, showPreviousValue: choice })} className={`rounded-xl border-2 py-2 font-bold ${value.showPreviousValue === choice ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Mostrar respuestas</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void onChange({ ...value, answerVisibility: 'REALTIME' })} className={`rounded-xl border-2 py-2 font-bold ${value.answerVisibility === 'REALTIME' ? 'border-leaf bg-leaf text-night' : 'border-ink/10 bg-surface-raised'}`}>En directo</button>
            <button type="button" onClick={() => void onChange({ ...value, answerVisibility: 'REVEAL' })} className={`rounded-xl border-2 py-2 font-bold ${value.answerVisibility === 'REVEAL' ? 'border-leaf bg-leaf text-night' : 'border-ink/10 bg-surface-raised'}`}>En reveal</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
        <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={30} disabled={disabled} accent="aqua" formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
      </div>
    </fieldset>
  );
}
