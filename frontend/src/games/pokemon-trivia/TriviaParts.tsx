import type { PokemonTriviaOptionId, PokemonTriviaPublicState, PokemonTriviaRoundResult, RoomMemberView } from '@pokemon-universe/shared/public';
import { Brain, Check, CheckCircle2, CircleDashed, Equal, Lightbulb, MinusCircle, XCircle } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { AvatarStack, avatarStackLabel } from '../../components/AvatarStack';
import { guessSprite } from '../../room/guess-kit';
import { playerColor } from '../../room/player-color';
import { Badge, Card, Chip, cx, Icon, Panel, Row, type CardState } from '../../ui';
import { triviaComparedValue, triviaOptionLabel, triviaRanking, triviaShortcut } from './presentation';
import s from './PokemonTrivia.module.css';

const nameOf = (members: ReadonlyMap<string, RoomMemberView>, id: string) => members.get(id)?.displayName ?? 'Entrenador';

/**
 * La pregunta (`Panel` azul noche, en grande) y las opciones: `Card`s llenas con el sprite, el nombre y el atajo (1–4)
 * en una insignia. Durante la ronda son botones (con `aria-pressed` la elegida, aún sin confirmar); en la revelación,
 * la correcta y las incorrectas llevan su marca en la esquina del sprite (icono, y el texto para lectores), solo el dato
 * que compara la pregunta y, encima del sprite, los avatares de quién eligió cada una. El hueco del sprite no cambia de
 * tamaño: el dato tiene su línea reservada desde el principio y las marcas y los avatares van encima. La respuesta
 * correcta solo se lee de `result`, que quien llama pasa únicamente en `ROUND_RESULTS`.
 */
export function TriviaBoard({ game, result, selected, pending, canAnswer, members, selfId, onSelect }: {
  game: PokemonTriviaPublicState;
  /** Solo en la revelación (`triviaVisibleRound`). */
  result: PokemonTriviaRoundResult | null;
  /** La elección propia: sin confirmar (local), enviándose o ya bloqueada. */
  selected: PokemonTriviaOptionId | null;
  /** Hay una respuesta en camino: las cartas no cambian. */
  pending: boolean;
  canAnswer: boolean;
  members: ReadonlyMap<string, RoomMemberView>;
  selfId: string;
  onSelect(id: PokemonTriviaOptionId): void;
}) {
  const pickers = (id: PokemonTriviaOptionId) => result ? Object.entries(result.answers).filter(([, answer]) => answer.optionId === id).map(([playerId]) => playerId) : [];
  return <div className={cx(s.board)}>
    <Panel variant="dark" as="section" aria-label="Pregunta" bodyClassName={cx(s.question)}>
      <span className={s.questionIcon}><Icon icon={Brain} size={32} /></span>
      <div className={s.questionText}>
        <p className={s.prompt} data-testid="trivia-prompt">{game.prompt ?? 'Preparando la pregunta…'}</p>
        {result && <p className={s.fact} data-testid="trivia-fact"><Icon icon={Lightbulb} size={18} />{result.fact}</p>}
      </div>
    </Panel>
    <ol className={cx(s.options, s[`options_${game.options.length}`])} aria-label="Opciones">{game.options.map((option, index) => {
      const shortcut = triviaShortcut(index);
      const mine = selected === option.id;
      const state: CardState = result ? (option.id === result.correctOptionId ? 'correct' : 'wrong') : mine ? 'selected' : 'idle';
      const details = result?.optionDetails[option.id];
      const compared = details ? triviaComparedValue(game.questionType, details) : null;
      const chosenBy = pickers(option.id);
      // Quién la eligió, encima del sprite (abajo a la derecha): avatares, con los nombres para lectores de pantalla.
      const overlay = result && chosenBy.length > 0
        ? <span data-testid="trivia-pickers" data-self={chosenBy.includes(selfId) ? 'true' : undefined}>
          <AvatarStack members={chosenBy.map((id) => ({ id, name: nameOf(members, id), avatar: members.get(id)?.avatar }))}
            label={avatarStackLabel(chosenBy.map((id) => (id === selfId ? 'ti' : nameOf(members, id))), 'Elegida por')} />
        </span>
        : null;
      const body = <>
        <span className={s.shortcut} aria-hidden="true">{shortcut}</span>
        {/* Línea reservada desde el principio para el dato comparado: al revelar, el sprite no encoge. */}
        <strong className={s.compared} aria-hidden={compared ? undefined : 'true'}>{compared ?? '\u00a0'}</strong>
        {result && chosenBy.length === 0 && <span className="sr-only">Nadie la eligió</span>}
      </>;
      const common = { size: 'fill' as const, marks: 'corner' as const, sprite: guessSprite(option.pokemon.sprite), name: option.pokemon.name, decorativeSprite: true, state, ...(overlay ? { artOverlay: overlay } : {}) };
      return <li key={option.id} className={s.option} data-option={option.id}>
        {result || !canAnswer
          ? <Card {...common} attrs={{ 'data-trivia-card': option.id }}>{body}</Card>
          : <Card {...common} disabled={pending && !mine}
            attrs={{ 'aria-label': `${shortcut}. ${option.pokemon.name}`, 'aria-keyshortcuts': shortcut, 'data-trivia-card': option.id }} onSelect={() => onSelect(option.id)}>{body}</Card>}
      </li>;
    })}</ol>
  </div>;
}

/**
 * Marcador (columna lateral): una franja por jugador con su color, el puesto, los puntos y si ya ha respondido (en
 * texto: «Respondió» o «Pensando…»; qué eligió no se ve hasta revelar).
 */
export function TriviaScoreboard({ game, players, members, colors, selfId, className }: { game: PokemonTriviaPublicState; players: readonly string[]; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const answered = players.filter((id) => game.answeredPlayerIds.includes(id)).length;
  const ranking = triviaRanking(players, game.scores);
  const tied = (position: number) => ranking.filter((entry) => entry.position === position).length > 1 && (game.scores[ranking.find((entry) => entry.position === position)!.id] ?? 0) > 0;
  return <Panel title="Marcador" variant="dark" scroll scrollLabel="Marcador de la partida" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${answered} / ${players.length} respuestas`}</Badge>}>
    <ol className={s.rows} aria-label="Clasificación de la partida">{ranking.map(({ id, position }) => {
      const member = members.get(id);
      const name = nameOf(members, id);
      const done = game.answeredPlayerIds.includes(id);
      return <li key={id} data-testid="trivia-score-row" aria-current={id === selfId ? 'true' : undefined}>
        <Row rank={position} name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>
            {done ? <Chip tone="ok" icon={<Icon icon={Check} size={18} />}>Respondió</Chip> : <Chip tone="neutral" icon={<Icon icon={CircleDashed} size={18} />}>Pensando…</Chip>}
            {tied(position) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}
          </span>}
          value={<span key={game.scores[id] ?? 0} className={cx(s.score, 'motion-bump')}>{game.scores[id] ?? 0}<small> pts</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

/** Revelación (columna lateral): qué eligió cada uno, si acertó (icono y texto) y los puntos de la ronda. */
export function TriviaAnswersBoard({ game, result, players, members, colors, selfId, className }: { game: PokemonTriviaPublicState; result: PokemonTriviaRoundResult; players: readonly string[]; members: ReadonlyMap<string, RoomMemberView>; colors: ReadonlyMap<string, number>; selfId: string; className?: string | undefined }) {
  const correct = players.filter((id) => result.answers[id]?.optionId === result.correctOptionId).length;
  const ordered = [...players].sort((a, b) => (result.points[b] ?? 0) - (result.points[a] ?? 0));
  return <Panel title="Respuestas" variant="dark" scroll scrollLabel="Respuestas de la ronda" {...(className ? { className } : {})}
    right={<Badge tone="cream">{`${correct} / ${players.length} aciertos`}</Badge>}>
    <ol className={s.rows} aria-label="Respuestas de la ronda">{ordered.map((id) => {
      const member = members.get(id);
      const name = nameOf(members, id);
      const answer = result.answers[id];
      const hit = answer?.optionId === result.correctOptionId;
      const points = result.points[id] ?? 0;
      return <li key={id} data-testid="trivia-answer-row">
        <Row name={name} color={playerColor(colors.get(id) ?? 0)} self={id === selfId} disconnected={member?.presence !== undefined && member.presence !== 'CONNECTED'}
          avatar={<Avatar name={name} avatar={member?.avatar} level={member?.level} size="sm" />}
          meta={<span className={s.rowMeta}>{answer
            ? <><Chip tone={hit ? 'ok' : 'bad'} icon={<Icon icon={hit ? CheckCircle2 : XCircle} size={18} />}>{hit ? 'Acertó' : 'Falló'}</Chip><span className={s.choice}>Eligió {triviaOptionLabel(game.options, answer.optionId)}</span></>
            : <Chip tone="neutral" icon={<Icon icon={MinusCircle} size={18} />}>Sin respuesta</Chip>}</span>}
          value={<span className={s.score}>+{points}<small> pts</small></span>} />
      </li>;
    })}</ol>
  </Panel>;
}

