import { SHINY_REVEAL_SECONDS_RANGE, SHINY_VOTE_VISIBILITIES, type ShinyVoteConfig } from '@pokemon-universe/shared/public';
import { Layers3, Shuffle } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../../room/ConfigRange';
import { LIVE_VISIBILITY_WARNING } from '../../room/live-visibility';
import { SHINY_REVEAL_DURATION_LABEL, shinyRevealSecondsLabel } from './reveal';
import { SHINY_VOTE_VISIBILITY_LABEL, shinyVisibilityLabels } from './vote-visibility';

export function ShinyVoteConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ShinyVoteConfig;
  return <fieldset disabled={disabled}>
    <legend className="label">Opciones de Pokemon</legend>
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <button type="button" className={`rounded-2xl border p-4 text-left transition ${value.candidateMode === 'SAME_POKEMON' ? 'border-electric bg-electric text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, candidateMode: 'SAME_POKEMON' })}>
        <Layers3 className="mb-2" size={24} /><strong className="block font-display text-lg">Mismo Pokémon</strong>
      </button>
      <button type="button" className={`rounded-2xl border p-4 text-left transition ${value.candidateMode === 'DIFFERENT_POKEMON' ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised'}`} onClick={() => void onChange({ ...value, candidateMode: 'DIFFERENT_POKEMON' })}>
        <Shuffle className="mb-2" size={24} /><strong className="block font-display text-lg">Pokémon diferentes</strong>
      </button>
    </div>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <div className="mt-5"><span className="label">Número de opciones</span><div className="grid grid-cols-4 gap-2">{[3, 4, 5, 6].map((count) => <button type="button" key={count} aria-pressed={value.optionCount === count} className={`rounded-xl border px-3 py-2 font-extrabold transition ${value.optionCount === count ? 'border-berry bg-berry text-white' : 'border-ink/10 bg-surface-raised text-ink/70'}`} onClick={() => void onChange({ ...value, optionCount: count })}>{count}</button>)}</div></div>
    <div className="mt-5">
      <span className="label">{SHINY_VOTE_VISIBILITY_LABEL}</span>
      <div className="grid grid-cols-2 gap-2">{SHINY_VOTE_VISIBILITIES.map((visibility) => <button type="button" key={visibility} aria-pressed={value.voteVisibility === visibility} className={`rounded-xl border px-3 py-3 font-extrabold transition ${value.voteVisibility === visibility ? 'border-aqua bg-aqua text-night' : 'border-ink/10 bg-surface-raised text-ink/70'}`} onClick={() => void onChange({ ...value, voteVisibility: visibility })}>{shinyVisibilityLabels[visibility]}</button>)}</div>
      {value.voteVisibility === 'LIVE' && <p className="mt-2 text-sm font-bold text-ink/65">{LIVE_VISIBILITY_WARNING}</p>}
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={(seconds) => `${seconds} segundos`} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} formatValue={(rounds) => `${rounds} rondas`} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label={SHINY_REVEAL_DURATION_LABEL} value={value.revealSeconds} min={SHINY_REVEAL_SECONDS_RANGE.min} max={SHINY_REVEAL_SECONDS_RANGE.max} disabled={disabled} accent="electric" formatValue={shinyRevealSecondsLabel} onCommit={(revealSeconds) => onChange({ ...value, revealSeconds })} />
    </div>
  </fieldset>;
}
