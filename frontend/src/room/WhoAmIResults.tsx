import type { PokemonType, WhoAmIPublicState } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS, whoAmIScoringLabel } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, X } from 'lucide-react';
import { questionsText, WHO_AM_I_NAME } from '../games/who-am-i/presentation';
import { Card, Chip, Icon, Panel } from '../ui';
import { guessSprite } from './guess-kit';
import { sharesPosition } from './results-ties';
import { ResultsHostActions } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import s from '../games/who-am-i/WhoAmI.module.css';

const typeLabel = (type: string) => POKEMON_TYPE_LABELS[type as PokemonType] ?? type;

/**
 * Resultados de ¿Quién soy?: la clasificación del catálogo (posición, puntos, si acertó y cuántas preguntas hizo cada
 * uno) con la regla de puntos y, al lado, el Pokémon que tenía cada jugador, ya revelado. Abajo, la acción del host.
 * Un empate a cero no corona.
 */
export function WhoAmIResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as WhoAmIPublicState;
  const host = room.hostId === selfId;
  const results = [...(game.results ?? [])].sort((a, b) => a.rank - b.rank);
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = results.map((entry) => ({ id: entry.playerId, position: entry.rank }));
  const rows = standingRows(results.map((entry) => ({ ...entry, position: entry.rank })), members, (entry) => ({
    sprite: guessSprite(entry.pokemon.sprite),
    meta: <>
      {sharesPosition(positions, entry.playerId, () => entry.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
      <span>{`Era ${entry.pokemon.name} · ${entry.solved ? 'Acertó' : 'No acertó'} · ${questionsText(entry.questionsAsked)}`}</span>
    </>,
  }));
  const solved = results.filter((entry) => entry.solved).length;
  const winner = results.find((entry) => entry.rank === 1 && entry.points > 0 && entry.playerId === selfId);
  const aside = <Panel title="Los Pokémon de cada uno" variant="dark" scroll scrollLabel="Los Pokémon de cada jugador">
    <ul className={s.reveal} aria-label="Pokémon de cada jugador">
      {results.map((entry) => <li key={entry.playerId} className={s.seat}>
        <Card name={entry.pokemon.name} sprite={guessSprite(entry.pokemon.sprite)} number={entry.pokemon.nationalDexNumber} decorativeSprite size="sm"
          types={entry.pokemon.types.map((type) => ({ type: type as PokemonType, label: typeLabel(type) }))}>
          <span className={s.player}>
            {entry.playerId === selfId ? `${nameOf(entry.playerId)} (tú)` : nameOf(entry.playerId)}
            {entry.solved
              ? <Chip tone="ok" icon={<Icon icon={CheckCircle2} size={18} />}>Acertó</Chip>
              : <Chip tone="bad" icon={<Icon icon={X} size={18} />}>No acertó</Chip>}
          </span>
        </Card>
      </li>)}
    </ul>
  </Panel>;
  return <ResultsShell won={Boolean(winner)} title="Clasificación final" subtitle={`${WHO_AM_I_NAME} · ${solved} de ${results.length} ${solved === 1 ? 'acertó' : 'acertaron'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside}
    actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>{whoAmIScoringLabel()}</p>
  </ResultsShell>;
}
