import type { MoveCategory, PokemonType, UnownTranslatorPublicState, UnownTranslatorRoundResult } from '@pokemon-universe/shared/public';
import { POKEMON_TYPE_LABELS, unownTranslatorScoringLabel } from '@pokemon-universe/shared/public';
import { CheckCircle2, Equal, EyeOff, Zap } from 'lucide-react';
import { categoryLabel } from '../games/learnset-guess/presentation';
import { Card, Chip, cx, Icon, Panel, TypeBadge } from '../ui';
import { guessSprite, guessTop } from './guess-kit';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords, type ResultsRecordItem } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import { plural, roundsLabel } from '../lib/format';
import s from '../games/unown-translator/UnownTranslator.module.css';

const GAME_NAME = 'Traductor Unown';
const typeLabel = (type: string) => POKEMON_TYPE_LABELS[type as PokemonType] ?? type;
const moveCategoryLabel = (category: string) => categoryLabel[category as MoveCategory] ?? category;

/** «4 letras ocultas» / «1 letra oculta»: las que seguían sin revelar al descifrarlo. */
export const hiddenLettersText = (n: number) => plural(n, 'letra oculta', 'letras ocultas');

/**
 * Lo que decía el mensaje (revelación de la ronda y último mensaje de los resultados finales): la respuesta en grande
 * y, en Pokémon, su carta con el sprite, el número y los tipos; en Movimientos, el tipo y la categoría.
 */
export function UnownRoundReveal({ round, kicker = 'El mensaje decía', className }: { round: UnownTranslatorRoundResult; kicker?: string; className?: string | undefined }) {
  const { pokemon, move } = round;
  return <Panel variant="cream" as="section" aria-labelledby="unown-answer" className={className ?? ''} bodyClassName={s.reveal ?? ''}>
    {pokemon && <span className={s.pokemon}>
      <Card name={pokemon.name} sprite={guessSprite(pokemon.sprite)} number={pokemon.nationalDexNumber} decorativeSprite size="sm" eager state="correct"
        types={pokemon.types.map((type) => ({ type: type as PokemonType, label: typeLabel(type) }))} />
    </span>}
    <span className={s.revealKicker}>{kicker}</span>
    <h2 id="unown-answer" className={cx(s.answer, 'ol')}>{round.answer}</h2>
    {move && <div className={s.details}>
      <TypeBadge type={move.type as PokemonType} label={typeLabel(move.type)} />
      <Chip tone="neutral">{moveCategoryLabel(move.category)}</Chip>
    </div>}
  </Panel>;
}

type Stats = NonNullable<UnownTranslatorPublicState['results']>['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);

/** Línea de métricas en texto: descifrados, primeros en descifrar y letras que seguían ocultas al acertar. */
export function unownStatsLine(stats: Stats): string {
  return [
    `${num(stats, 'solved')}/${num(stats, 'roundsPlayed')} descifrados`,
    plural(num(stats, 'firstSolves'), 'vez el primero', 'veces el primero'),
    hiddenLettersText(num(stats, 'hiddenLettersAtSolve')),
  ].join(' · ');
}

/**
 * Resultados de Traductor Unown: la clasificación del catálogo (`ResultsShell` con `standings`), la regla de puntos y
 * el último mensaje descifrado; al lado, los récords (más descifrados, más veces el primero y más letras ocultas al
 * acertar; empates juntos). Abajo, la acción del host. Un empate a cero no corona.
 */
export function UnownTranslatorResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as UnownTranslatorPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{unownStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const record = (key: string, title: string, icon: ResultsRecordItem['icon'], one: string, many: string): ResultsRecordItem => {
    const top = guessTop(entries, key);
    return { key, title, icon, names: top?.names ?? null, value: String(top?.value ?? ''), unit: top?.value === 1 ? one : many };
  };
  const records: ResultsRecordItem[] = [
    record('solved', 'Más descifrados', CheckCircle2, 'mensaje descifrado', 'mensajes descifrados'),
    record('firstSolves', 'El más rápido', Zap, 'vez el primero', 'veces el primero'),
    record('hiddenLettersAtSolve', 'A ciegas', EyeOff, 'letra oculta al acertar', 'letras ocultas al acertar'),
  ];
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Clasificación final" subtitle={`${GAME_NAME} · ${roundsLabel(game.totalRounds)}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={<ResultsRecords id="unown-records-title" records={records} />}
    actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>{unownTranslatorScoringLabel()}</p>
    {game.lastRound && <UnownRoundReveal round={game.lastRound} kicker="El último mensaje decía" />}
  </ResultsShell>;
}
