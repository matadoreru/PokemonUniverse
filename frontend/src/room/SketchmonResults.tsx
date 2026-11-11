import type { SketchmonPublicState } from '@pokemon-universe/shared/public';
import { SKETCHMON_DRAWER_POINTS, SKETCHMON_GUESSER_MAX_POINTS, SKETCHMON_GUESSER_MIN_POINTS } from '@pokemon-universe/shared/public';
import { Brush, Equal, Search, Target } from 'lucide-react';
import { sketchStatsLine } from '../games/sketchmon/presentation';
import { SketchGallery } from '../games/sketchmon/SketchParts';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, standingRows } from './ResultsShell';
import { useRoomMembers } from './room-members';
import type { GameResultsProps } from './room-command';
import s from '../games/sketchmon/Sketchmon.module.css';

/**
 * Resultados de Sketchmon: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con insignia y
 * «+N» y, en texto, adivinados, al primer intento, dibujos descubiertos y los puntos por adivinar y por dibujar), la
 * regla de los puntos; al lado, los récords (más adivinados, al primer intento y mejor dibujante; empates juntos) y la
 * galería con los dibujos de la partida. Abajo, la acción del host. Un empate a cero no corona.
 */
export function SketchmonResults({ room, selfId, onLobby, onEnd }: GameResultsProps) {
  const game = room.game as SketchmonPublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const members = useRoomMembers(room); const { nameOf } = members;
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows = standingRows(standings, members, (standing) => ({
    meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{sketchStatsLine(standing.stats)}</span></>,
  }));
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const guessed = guessTop(entries, 'guessedPokemon');
  const firstTry = guessTop(entries, 'firstTry');
  const drawer = guessTop(entries, 'drawingSuccesses');
  const records = <ResultsRecords id="sketchmon-records-title" records={[
    { key: 'guessed', title: 'Más Pokémon adivinados', icon: Search, names: guessed?.names ?? null, value: String(guessed?.value ?? ''), unit: guessed?.value === 1 ? 'Pokémon adivinado' : 'Pokémon adivinados' },
    { key: 'first', title: 'Al primer intento', icon: Target, names: firstTry?.names ?? null, value: String(firstTry?.value ?? ''), unit: firstTry?.value === 1 ? 'acierto sin fallar' : 'aciertos sin fallar' },
    { key: 'drawer', title: 'Mejor dibujante', icon: Brush, names: drawer?.names ?? null, value: String(drawer?.value ?? ''), unit: drawer?.value === 1 ? 'dibujo descubierto' : 'dibujos descubiertos' },
  ]} />;
  // La galería va bajo los récords: la columna de la clasificación reparte su alto entre las franjas (`fillLarge`).
  const aside = <>{records}<SketchGallery entries={game.gallery} members={members.byId} /></>;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="La galería de la partida" subtitle={`Sketchmon · ${game.totalRounds} ${game.totalRounds === 1 ? 'dibujo' : 'dibujos'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.resultsRule}>Puntos por reconocer rápido los dibujos y por conseguir que el grupo entienda los tuyos: quien acierta suma de {SKETCHMON_GUESSER_MAX_POINTS} a {SKETCHMON_GUESSER_MIN_POINTS} según lo rápido y quien dibuja, {SKETCHMON_DRAWER_POINTS}.</p>
  </ResultsShell>;
}
