import type { Pokemon, PokemonType } from '../../pokemon/types.js';
import { isPlayerRequired, type GameActionResult, type GameContext, type MiniGameModule } from '../contracts.js';
import { advanceTimedRound, resolveWhenRequiredPlayersComplete } from '../infrastructure/timing.js';
import { defaultPokemonTriviaConfig, pokemonTriviaConfigSchema, type PokemonTriviaConfig, type PokemonTriviaQuestionType } from './config.js';
import { buildPokemonTriviaResults, emptyPokemonTriviaStats, pokemonTriviaPoints } from './rules.js';
import { POKEMON_TRIVIA_OPTION_IDS, pokemonTriviaActionSchema, type PokemonTriviaAction, type PokemonTriviaOption, type PokemonTriviaPlayerState, type PokemonTriviaPublicState, type PokemonTriviaQuestion, type PokemonTriviaRoundResult, type PokemonTriviaState } from './types.js';

export const POKEMON_TRIVIA_REVEAL_MS = 4_000;

const manifest = {
  id: 'pokemon-trivia', name: 'Pokémon Trivia', icon: '🧠', recommended: true,
  description: 'Responde preguntas objetivas sobre tipos, generaciones, estadísticas y medidas.', minPlayers: 1, maxPlayers: 12,
  profileStats: { metrics: [
    { key: 'answers', label: 'Respuestas', aggregation: 'SUM' as const },
    { key: 'correct', label: 'Aciertos', aggregation: 'SUM' as const },
    { key: 'incorrect', label: 'Fallos', aggregation: 'SUM' as const },
    { key: 'unanswered', label: 'Sin respuesta', aggregation: 'SUM' as const },
    { key: 'fastestCorrectMs', label: 'Respuesta más rápida', aggregation: 'MIN' as const, format: 'DURATION_MS' as const },
    { key: 'correctTimeTotalMs', label: 'Tiempo total en aciertos', aggregation: 'SUM' as const, format: 'DURATION_MS' as const },
    { key: 'pointsFromRounds', label: 'Puntos en rondas', aggregation: 'SUM' as const },
  ], derivedMetrics: [
    { key: 'accuracy', label: 'Precisión', kind: 'PERCENT' as const, numerator: 'correct', denominator: ['answers'] },
    { key: 'averageCorrectTime', label: 'Tiempo medio', kind: 'AVERAGE' as const, numerator: 'correctTimeTotalMs', denominator: ['correct'], format: 'DURATION_MS' as const },
  ] },
} as const;

const typeLabels: Record<PokemonType, string> = {
  normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada',
};

function takeRandom<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items]; const result: T[] = [];
  while (result.length < count && pool.length) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    result.push(pool.splice(index, 1)[0]!);
  }
  return result;
}

function makeOptions(pokemon: readonly Pokemon[], correctId: string, random: () => number): { options: PokemonTriviaOption[]; correctOptionId: (typeof POKEMON_TRIVIA_OPTION_IDS)[number] } {
  const shuffled = takeRandom(pokemon, pokemon.length, random);
  const options = shuffled.map((entry, index) => ({ id: POKEMON_TRIVIA_OPTION_IDS[index]!, pokemon: { id: entry.id, name: entry.name, sprite: entry.sprite } }));
  return { options, correctOptionId: options.find((option) => option.pokemon.id === correctId)!.id };
}

function categoricalQuestion(type: 'TYPE' | 'GENERATION', pool: readonly Pokemon[], count: number, used: ReadonlySet<string>, random: () => number): PokemonTriviaQuestion | null {
  const targets = takeRandom(pool, pool.length, random);
  for (const target of targets) {
    const discriminator = type === 'TYPE' ? takeRandom(target.types, 1, random)[0] : target.generation;
    if (discriminator === undefined) continue;
    const key = `${type}:${String(discriminator)}:${target.id}`;
    if (used.has(key)) continue;
    const distractors = pool.filter((candidate) => candidate.id !== target.id && (type === 'TYPE' ? !candidate.types.includes(discriminator as PokemonType) : candidate.generation !== discriminator));
    const selected = takeRandom(distractors, count - 1, random);
    if (selected.length !== count - 1) continue;
    const built = makeOptions([target, ...selected], target.id, random);
    const label = type === 'TYPE' ? typeLabels[discriminator as PokemonType] : `la generación ${discriminator}`;
    return { key, type, prompt: type === 'TYPE' ? `¿Cuál de estos Pokémon es de tipo ${label}?` : `¿Cuál de estos Pokémon pertenece a ${label}?`, ...built, fact: `${target.name} es la respuesta correcta: pertenece a ${label}.` };
  }
  return null;
}

const numericQuestions: Record<Exclude<PokemonTriviaQuestionType, 'TYPE' | 'GENERATION'>, { prompt: string; value(pokemon: Pokemon): number | undefined; fact(value: number): string }> = {
  BST: { prompt: '¿Cuál tiene el mayor total de estadísticas base?', value: (pokemon) => pokemon.baseStatTotal, fact: (value) => `BST ${value}` },
  SPEED: { prompt: '¿Cuál tiene mayor Velocidad base?', value: (pokemon) => pokemon.speed, fact: (value) => `Velocidad base ${value}` },
  HEIGHT: { prompt: '¿Cuál es el Pokémon más alto?', value: (pokemon) => pokemon.heightDecimeters, fact: (value) => `${(value / 10).toLocaleString('es-ES')} m` },
  WEIGHT: { prompt: '¿Cuál es el Pokémon más pesado?', value: (pokemon) => pokemon.weightHectograms, fact: (value) => `${(value / 10).toLocaleString('es-ES')} kg` },
};

function numericQuestion(type: keyof typeof numericQuestions, pool: readonly Pokemon[], count: number, used: ReadonlySet<string>, random: () => number): PokemonTriviaQuestion | null {
  const definition = numericQuestions[type];
  const valid = pool.filter((pokemon) => (definition.value(pokemon) ?? 0) > 0);
  for (const target of takeRandom(valid, valid.length, random)) {
    const targetValue = definition.value(target)!; const key = `${type}:${target.id}`;
    if (used.has(key)) continue;
    const lower = valid.filter((candidate) => candidate.id !== target.id && definition.value(candidate)! < targetValue);
    const selected = takeRandom(lower, count - 1, random);
    if (selected.length !== count - 1) continue;
    const built = makeOptions([target, ...selected], target.id, random);
    return { key, type, prompt: definition.prompt, ...built, fact: `${target.name}: ${definition.fact(targetValue)}.` };
  }
  return null;
}

export function createPokemonTriviaQuestion(state: PokemonTriviaState, context: GameContext): PokemonTriviaQuestion {
  const pool = state.poolIds.map((id) => context.pokemon.byId(id)).filter((pokemon): pokemon is Pokemon => Boolean(pokemon));
  const used = new Set(state.usedQuestionKeys);
  for (const type of takeRandom(state.config.questionTypes, state.config.questionTypes.length, context.random)) {
    const question = type === 'TYPE' || type === 'GENERATION'
      ? categoricalQuestion(type, pool, state.config.optionCount, used, context.random)
      : numericQuestion(type, pool, state.config.optionCount, used, context.random);
    if (question) return question;
  }
  if (used.size) return createPokemonTriviaQuestion({ ...state, usedQuestionKeys: [] }, context);
  throw new Error('No hay suficientes datos distintos para crear preguntas con esta configuración.');
}

function beginRound(state: PokemonTriviaState, context: GameContext): PokemonTriviaState {
  const question = createPokemonTriviaQuestion(state, context);
  return { ...state, phase: 'ROUND_ACTIVE', roundNumber: state.roundNumber + 1, question, usedQuestionKeys: [...state.usedQuestionKeys, question.key], answers: {}, roundStartedAt: context.now, roundEndsAt: context.now + state.config.roundSeconds * 1_000, nextTransitionAt: null, lastRound: null };
}

function revealRound(state: PokemonTriviaState, context: GameContext): PokemonTriviaState {
  if (state.phase !== 'ROUND_ACTIVE' || !state.question) return state;
  const scores = { ...state.scores }; const playerStats = { ...state.playerStats }; const points: Record<string, number> = {};
  for (const playerId of state.playerIds) {
    const answer = state.answers[playerId]; const correct = answer?.optionId === state.question.correctOptionId; const previous = playerStats[playerId] ?? emptyPokemonTriviaStats();
    const elapsedMs = answer ? answer.answeredAt - state.roundStartedAt! : 0; const earned = correct ? pokemonTriviaPoints(state.roundStartedAt!, state.config.roundSeconds, answer!.answeredAt) : 0;
    points[playerId] = earned; scores[playerId] = (scores[playerId] ?? 0) + earned;
    playerStats[playerId] = { ...previous, answers: previous.answers + (answer ? 1 : 0), correct: previous.correct + (correct ? 1 : 0), incorrect: previous.incorrect + (answer && !correct ? 1 : 0), unanswered: previous.unanswered + (answer ? 0 : 1), fastestCorrectMs: correct ? (previous.fastestCorrectMs <= 0 ? elapsedMs : Math.min(previous.fastestCorrectMs, elapsedMs)) : previous.fastestCorrectMs, correctTimeTotalMs: previous.correctTimeTotalMs + (correct ? elapsedMs : 0), pointsFromRounds: previous.pointsFromRounds + earned };
  }
  const optionDetails = Object.fromEntries(state.question.options.map((option) => {
    const pokemon = context.pokemon.byId(option.pokemon.id)!;
    return [option.id, { generation: pokemon.generation, types: [...pokemon.types], hp: pokemon.hp, attack: pokemon.attack, defense: pokemon.defense, specialAttack: pokemon.specialAttack, specialDefense: pokemon.specialDefense, speed: pokemon.speed, baseStatTotal: pokemon.baseStatTotal, ...(pokemon.heightDecimeters !== undefined ? { heightDecimeters: pokemon.heightDecimeters } : {}), ...(pokemon.weightHectograms !== undefined ? { weightHectograms: pokemon.weightHectograms } : {}) }];
  })) as PokemonTriviaRoundResult['optionDetails'];
  return { ...state, phase: 'ROUND_RESULTS', scores, playerStats, roundEndsAt: null, nextTransitionAt: context.now + POKEMON_TRIVIA_REVEAL_MS, lastRound: { correctOptionId: state.question.correctOptionId, fact: state.question.fact, answers: { ...state.answers }, points, optionDetails } };
}

const finish = (state: PokemonTriviaState): PokemonTriviaState => ({ ...state, phase: 'GAME_RESULTS', nextTransitionAt: null, roundEndsAt: null });

export const pokemonTriviaGame: MiniGameModule<PokemonTriviaConfig, PokemonTriviaState, PokemonTriviaAction, PokemonTriviaPublicState> = {
  manifest, configSchema: pokemonTriviaConfigSchema, actionSchema: pokemonTriviaActionSchema, defaultConfig: defaultPokemonTriviaConfig,
  createInitialState(config, context) {
    const parsed = pokemonTriviaConfigSchema.parse(config); const pool = context.pokemon.forGenerations(parsed.generations).filter((pokemon) => pokemon.id && pokemon.name && pokemon.sprite);
    if (pool.length < parsed.optionCount) throw new Error(`Se necesitan al menos ${parsed.optionCount} Pokémon en las generaciones seleccionadas.`);
    const playerIds = context.players.map((player) => player.id);
    return { phase: 'GAME_STARTING', config: parsed, playerIds, poolIds: pool.map((pokemon) => pokemon.id), roundNumber: 0, question: null, usedQuestionKeys: [], answers: {}, scores: Object.fromEntries(playerIds.map((id) => [id, 0])), playerStats: Object.fromEntries(playerIds.map((id) => [id, emptyPokemonTriviaStats()])), roundStartedAt: null, roundEndsAt: null, nextTransitionAt: null, lastRound: null };
  },
  start(state, context) { if (state.phase !== 'GAME_STARTING') throw new Error('La partida ya ha comenzado.'); return beginRound(state, context); },
  handleAction(state, playerId, action, context): GameActionResult<PokemonTriviaState> {
    if (state.phase !== 'ROUND_ACTIVE' || !state.question) return { state, accepted: false, error: 'No hay una pregunta activa.' };
    if (!state.playerIds.includes(playerId) || !isPlayerRequired(context, playerId)) return { state, accepted: false, error: 'Estás observando esta ronda.' };
    if (state.answers[playerId]) return { state, accepted: false, error: 'Tu respuesta ya está bloqueada.' };
    if (context.now >= (state.roundEndsAt ?? 0)) return { state: revealRound(state, context), accepted: false, error: 'El tiempo ha terminado.' };
    if (!state.question.options.some((option) => option.id === action.optionId)) return { state, accepted: false, error: 'Esa opción no pertenece a la pregunta.' };
    let next = { ...state, answers: { ...state.answers, [playerId]: { optionId: action.optionId, answeredAt: context.now } } };
    next = resolveWhenRequiredPlayersComplete(next, context, next.playerIds, (id) => Boolean(next.answers[id]), revealRound);
    return { state: next, accepted: true };
  },
  handleTimeout(state, context) { return advanceTimedRound(state, context, { beginNext: beginRound, resolveActive: revealRound, finish, isComplete: (current) => current.roundNumber >= current.config.rounds }); },
  handlePresenceChange(state, context) { return resolveWhenRequiredPlayersComplete(state, context, state.playerIds, (id) => Boolean(state.answers[id]), revealRound); },
  getPublicState(state) {
    const reveal = state.phase === 'ROUND_RESULTS' || state.phase === 'GAME_RESULTS';
    return { gameId: 'pokemon-trivia', phase: state.phase, roundNumber: state.roundNumber, totalRounds: state.config.rounds, prompt: state.question?.prompt ?? null, questionType: state.question?.type ?? null, options: state.question?.options ?? [], answeredPlayerIds: Object.keys(state.answers), scores: state.scores, roundStartedAt: state.roundStartedAt, roundEndsAt: state.roundEndsAt, nextTransitionAt: state.nextTransitionAt, lastRound: reveal ? state.lastRound : null, results: state.phase === 'GAME_RESULTS' ? buildPokemonTriviaResults(state) : null };
  },
  getPlayerState(state, playerId, context): PokemonTriviaPlayerState {
    const participant = state.playerIds.includes(playerId);
    return { role: participant ? 'PLAYER' : 'SPECTATOR', canAnswer: state.phase === 'ROUND_ACTIVE' && participant && isPlayerRequired(context, playerId) && !state.answers[playerId], answer: state.answers[playerId] ?? null };
  },
  isFinished(state) { return state.phase === 'GAME_RESULTS'; },
  getResults(state) { return buildPokemonTriviaResults(state); },
};
