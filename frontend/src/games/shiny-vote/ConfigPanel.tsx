import { SHINY_REVEAL_SECONDS_RANGE, SHINY_VOTE_VISIBILITIES, type ShinyCandidateMode, type ShinyVoteConfig, type ShinyVoteVisibility } from '@pokemon-universe/shared/public';
import { Layers3, Shuffle, type LucideIcon } from 'lucide-react';
import { GenerationSelector } from '../../components/GenerationSelector';
import { ConfigRange } from '../common/ConfigRange';
import { GameModeField } from '../common/GameModeField';
import { LIVE_VISIBILITY_WARNING } from '../common/live-visibility';
import { Card, Icon, Segmented } from '../../ui';
import { SHINY_REVEAL_DURATION_LABEL, shinyRevealSecondsLabel } from './reveal';
import { SHINY_VOTE_VISIBILITY_LABEL, shinyVisibilityLabels } from './vote-visibility';
import { roundsLabel, secondsLabel } from '../../lib/format';
import c from '../ConfigPanel.module.css';
import s from './ConfigPanel.module.css';

const CANDIDATE_MODE_LABEL = 'Opciones de Pokémon';
const OPTION_COUNT_LABEL = 'Número de opciones';
const OPTION_COUNTS = [3, 4, 5, 6] as const;
const CANDIDATE_MODES: { value: ShinyCandidateMode; label: string; icon: LucideIcon }[] = [
  { value: 'SAME_POKEMON', label: 'Mismo Pokémon', icon: Layers3 },
  { value: 'DIFFERENT_POKEMON', label: 'Pokémon diferentes', icon: Shuffle },
];

/**
 * Ajustes de Shiny Quiz con los controles del catálogo: el modo de juego (`GameModeField`), modo de candidatos (`Card` seleccionables), número de opciones
 * y visibilidad de los votos (`Segmented`, con el aviso de copia en «En directo»), generaciones y los tiempos (`ConfigRange`, el `Slider`).
 */
export function ShinyVoteConfigPanel({ config, disabled, onChange }: { config: unknown; disabled: boolean; onChange(config: unknown): Promise<void> }) {
  const value = config as ShinyVoteConfig;
  const counts = OPTION_COUNTS.map((count) => ({ value: count, label: String(count), disabled }));
  const visibilities = SHINY_VOTE_VISIBILITIES.map((visibility) => ({ value: visibility, label: shinyVisibilityLabels[visibility], disabled }));
  return <fieldset disabled={disabled} className={c.panelLoose}>
    <GameModeField gameId="shiny-vote" value={value.mode} disabled={disabled} onChange={(mode) => void onChange({ ...value, mode })} />
    <div className={s.group}>
      <span className={c.label} aria-hidden="true">{CANDIDATE_MODE_LABEL}</span>
      <div className={s.modes} role="group" aria-label={CANDIDATE_MODE_LABEL}>{CANDIDATE_MODES.map((mode) => <Card key={mode.value} size="sm" art={<Icon icon={mode.icon} size={32} />} name={mode.label}
        state={value.candidateMode === mode.value ? 'selected' : 'idle'} disabled={disabled} onSelect={() => { if (value.candidateMode !== mode.value) void onChange({ ...value, candidateMode: mode.value }); }} />)}</div>
    </div>
    <GenerationSelector selected={value.generations} onChange={(generations) => onChange({ ...value, generations })} label="Generaciones disponibles" />
    <Segmented<number> label={OPTION_COUNT_LABEL} showLabel className={s.group ?? ''} value={value.optionCount} options={counts} onChange={(optionCount) => void onChange({ ...value, optionCount })} />
    <Segmented<ShinyVoteVisibility> label={SHINY_VOTE_VISIBILITY_LABEL} showLabel hint={value.voteVisibility === 'LIVE' ? LIVE_VISIBILITY_WARNING : undefined} className={s.group ?? ''} value={value.voteVisibility} options={visibilities} onChange={(voteVisibility) => void onChange({ ...value, voteVisibility })} />
    <div className={s.ranges}>
      <ConfigRange label="Tiempo por ronda" value={value.roundSeconds} min={10} max={60} step={5} disabled={disabled} formatValue={secondsLabel} onCommit={(roundSeconds) => onChange({ ...value, roundSeconds })} />
      <ConfigRange label="Número de rondas" value={value.rounds} min={1} max={50} disabled={disabled} formatValue={roundsLabel} onCommit={(rounds) => onChange({ ...value, rounds })} />
      <ConfigRange label={SHINY_REVEAL_DURATION_LABEL} value={value.revealSeconds} min={SHINY_REVEAL_SECONDS_RANGE.min} max={SHINY_REVEAL_SECONDS_RANGE.max} disabled={disabled} formatValue={shinyRevealSecondsLabel} onCommit={(revealSeconds) => onChange({ ...value, revealSeconds })} />
    </div>
  </fieldset>;
}
