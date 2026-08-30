import { POKEMON_TRIVIA_QUESTION_TYPES, type PokemonTriviaConfig, type PokemonTriviaQuestionType } from '@pokemon-universe/shared';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

const labels: Record<PokemonTriviaQuestionType, string> = {
  TYPE: 'Tipos', GENERATION: 'Generaciones', HP: 'PS', ATTACK: 'Ataque', DEFENSE: 'Defensa', SPECIAL_ATTACK: 'Ataque Esp.', SPECIAL_DEFENSE: 'Defensa Esp.', BST: 'BST', SPEED: 'Velocidad', HEIGHT: 'Altura', WEIGHT: 'Peso', DEX_NUMBER: 'N.º Pokédex',
};

export function PokemonTriviaConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as PokemonTriviaConfig;
  const toggle = (type: PokemonTriviaQuestionType) => {
    const selected = value.questionTypes.includes(type);
    if (selected && value.questionTypes.length === 1) return;
    void onChange({ ...value, questionTypes: selected ? value.questionTypes.filter((entry) => entry !== type) : [...value.questionTypes, type] });
  };
  return <fieldset disabled={disabled} className="space-y-6">
    <GenerationSelector selected={value.generations} label="Generaciones" description="Las preguntas se generan únicamente con el catálogo local seleccionado." onChange={(generations) => void onChange({ ...value, generations })} />
    <section><span className="label">Dificultad</span><div className="grid max-w-xl grid-cols-3 gap-2">{(['EASY', 'NORMAL', 'HARD'] as const).map((difficulty) => <button key={difficulty} type="button" aria-pressed={value.difficulty === difficulty} onClick={() => void onChange({ ...value, difficulty })} className={`min-h-12 rounded-xl border font-extrabold ${value.difficulty === difficulty ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised'}`}>{({ EASY: 'Fácil', NORMAL: 'Normal', HARD: 'Difícil' })[difficulty]}</button>)}</div><p className="mt-2 text-sm font-bold text-ink/60">La dificultad ajusta lo parecidas que son las opciones numéricas.</p></section>
    <section><span className="label">Categorías de preguntas</span><div className="flex flex-wrap gap-2">{POKEMON_TRIVIA_QUESTION_TYPES.map((type) => { const selected = value.questionTypes.includes(type); return <button key={type} type="button" aria-pressed={selected} onClick={() => toggle(type)} className={`min-h-11 rounded-full border px-4 py-2 font-extrabold transition-colors ${selected ? 'border-aqua bg-aqua text-night' : 'border-ink/15 bg-surface-raised text-ink/70 hover:border-aqua/60'}`}>{labels[type]}</button>; })}</div><p className="mt-2 text-sm font-bold text-ink/60">Mantén al menos una categoría activa.</p></section>
    <section><span className="label">Opciones por pregunta</span><div className="grid max-w-sm grid-cols-2 gap-2">{[3, 4].map((count) => <button key={count} type="button" aria-pressed={value.optionCount === count} onClick={() => void onChange({ ...value, optionCount: count })} className={`min-h-12 rounded-xl border font-extrabold transition-colors ${value.optionCount === count ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`}>{count} opciones</button>)}</div></section>
    <div className="grid gap-4 md:grid-cols-2"><ConfigRange label="Tiempo por pregunta" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} /><ConfigRange label="Número de preguntas" value={value.rounds} min={1} max={30} disabled={disabled} accent="aqua" formatValue={(rounds) => `${rounds} preguntas`} onCommit={(rounds) => onChange({ ...value, rounds })} /></div>
  </fieldset>;
}
