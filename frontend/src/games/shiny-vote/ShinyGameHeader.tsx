import type { ShinyCandidateMode, ShinyVoteVisibility } from '@pokemon-universe/shared/public';
import type { ReactNode } from 'react';
import { Eye, Layers3, LayoutGrid, Shuffle } from 'lucide-react';
import { Badge, Chip, cx, Icon, Panel } from '../../ui';
import { shinyVisibilityChip } from './vote-visibility';
import s from './ShinyVote.module.css';

/**
 * Placa de la ronda (pantalla superior): ronda, modo de votos y de candidatos, la pregunta y, a la derecha, el tiempo
 * del servidor (en la revelación, el de la siguiente ronda en el mismo hueco: la placa no cambia de alto). Con
 * `candidates` (Supervivencia, donde crecen cada pocas rondas) añade el chip «N candidatos».
 */
export function ShinyGameHeader({ roundNumber, totalRounds, voteVisibility, candidateMode, timer, candidates = null }: {
  roundNumber: number;
  totalRounds: number;
  voteVisibility: ShinyVoteVisibility;
  candidateMode: ShinyCandidateMode;
  timer: ReactNode;
  candidates?: number | null;
}) {
  return <Panel variant="dark" as="div" bodyClassName={cx(s.hud)}>
    <div className={s.hudMain}>
      <div className={s.hudMeta}>
        <Badge>Ronda {roundNumber} de {totalRounds}</Badge>
        {candidates !== null && <Chip tone="info" icon={<Icon icon={LayoutGrid} size={18} />}>{candidates} candidatos</Chip>}
        <Chip tone="neutral" icon={<Icon icon={Eye} size={18} />}>{shinyVisibilityChip(voteVisibility)}</Chip>
        <Chip tone="neutral" icon={<Icon icon={candidateMode === 'SAME_POKEMON' ? Layers3 : Shuffle} size={18} />}>{candidateMode === 'SAME_POKEMON' ? 'Mismo Pokémon' : 'Pokémon diferentes'}</Chip>
      </div>
      <h1 className={cx(s.question, 'ol')}>¿Cuál es el shiny verdadero?</h1>
    </div>
    <div className={s.hudTimer}>{timer}</div>
  </Panel>;
}
