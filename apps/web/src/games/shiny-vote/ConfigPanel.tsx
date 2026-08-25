import { type ShinyVoteConfig } from '@pokemon-universe/shared';
import { Layers3, Shuffle } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';

export function ShinyVoteConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ShinyVoteConfig;
  return <fieldset disabled={disabled}>
    <legend className="label">Formato de candidatos</legend>
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <button type="button" className={`rounded-2xl border p-4 text-left transition ${value.candidateMode === 'SAME_POKEMON' ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, candidateMode: 'SAME_POKEMON' })}>
        <Layers3 className="mb-2" size={24} /><strong className="block font-display text-lg">Mismo Pokémon</strong><span className="mt-1 block text-sm font-bold opacity-60">Una especie, un shiny real y el resto recoloreados.</span>
      </button>
      <button type="button" className={`rounded-2xl border p-4 text-left transition ${value.candidateMode === 'DIFFERENT_POKEMON' ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, candidateMode: 'DIFFERENT_POKEMON' })}>
        <Shuffle className="mb-2" size={24} /><strong className="block font-display text-lg">Pokémon diferentes</strong><span className="mt-1 block text-sm font-bold opacity-60">Especies distintas y una shiny auténtica.</span>
      </button>
    </div>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className="mt-5"><span className="label">Número de opciones</span><div className="grid grid-cols-4 gap-2">{[3, 4, 5, 6].map((count) => <button type="button" key={count} aria-pressed={value.optionCount === count} className={`rounded-xl border px-3 py-2 font-extrabold transition ${value.optionCount === count ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised text-ink/70'}`} onClick={() => void onChange({ ...value, optionCount: count })}>{count}</button>)}</div></div>
    <div className="mt-5"><span className="label">Mostrar votos en tiempo real</span><div className="grid grid-cols-2 gap-2">{[{ label: 'Sí', value: true }, { label: 'No', value: false }].map((option) => <button type="button" key={String(option.value)} aria-pressed={value.showVotes === option.value} className={`rounded-xl border px-3 py-3 font-extrabold transition ${value.showVotes === option.value ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/70'}`} onClick={() => void onChange({ ...value, showVotes: option.value })}>{option.label}</button>)}</div><p className="mt-2 text-sm font-bold text-ink/65">Si se ocultan, solo se verá quién ha votado hasta el reveal.</p></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={20} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
    </div>
  </fieldset>;
}
