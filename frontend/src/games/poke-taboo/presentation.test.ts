import type { PokeTabooPublicState, PokeTabooRoundResult } from '@pokemon-universe/shared/public';
import { describe, expect, it } from 'vitest';
import {
  tabooAnnouncement, tabooCurrentStep, tabooForbiddenWords, tabooHeading, tabooHintProblem, tabooRevealSummary, tabooRole, tabooRoundLabel, tabooStatsLine,
  tabooTurnStatus, tabooVerdict,
} from './presentation';

const lucario = { id: 'lucario', name: 'Lucario' };
const vulpix = { id: 'vulpix-alola', name: 'Vulpix de Alola' };
const mime = { id: 'mr-mime', name: 'Mr. Mime' };

const result: PokeTabooRoundResult = {
  reason: 'GUESSED', pokemon: { id: 'lucario', name: 'Lucario', sprite: '/l.png', generation: 4, types: ['fighting'] },
  descriptorId: 'p1', winnerId: 'p2', guesserPoints: 4, descriptorPoints: 2, winnerAttemptCount: 2,
};
const names: Record<string, string> = { p1: 'Ana', p2: 'Pedro', p3: 'Carlos' };
const nameOf = (id: string) => names[id] ?? 'Entrenador';

describe('palabras prohibidas', () => {
  it('son el nombre y, con forma regional, también el nombre base (no se inventan otras)', () => {
    expect(tabooForbiddenWords(lucario)).toEqual(['Lucario']);
    expect(tabooForbiddenWords(vulpix)).toEqual(['Vulpix de Alola', 'Vulpix']);
    expect(tabooForbiddenWords(mime)).toEqual(['Mr. Mime']);
  });

  it('detecta el nombre sin tildes ni mayúsculas, por palabras y con los espacios quitados, como el motor', () => {
    expect(tabooHintProblem('Es como LUCARIO pero azul', lucario)).toBe('Lucario');
    expect(tabooHintProblem('lu ca rio', lucario)).toBe('Lucario');
    expect(tabooHintProblem('superlucariomax', lucario)).toBe('Lucario');
    expect(tabooHintProblem('Un zorro de hielo, como vulpix', vulpix)).toBe('Vulpix');
    expect(tabooHintProblem('mr. mime hace mimo', mime)).toBe('Mr. Mime');
    expect(tabooHintProblem('Siente el aura de los demás', lucario)).toBeNull();
    expect(tabooHintProblem('   ', lucario)).toBeNull();
    expect(tabooHintProblem('Lucario', null)).toBeNull();
  });

  // Casos fijos que rechaza `PokeTabooRules.containsTabooPokemonName` del motor Java sin los nombres en otros idiomas
  // (`names`, que solo conoce el servidor). Si el motor cambia la regla, hay que cambiar esta tabla.
  it('rechaza exactamente las pistas que rechazaría el motor en una tabla de Pokémon y pistas', () => {
    const rejected: Record<string, { pokemon: { id: string; name: string }; hints: string[] }> = {
      lucario: { pokemon: lucario, hints: ['Es como LUCARIO pero azul', 'lu ca rio', 'superlucariomax'] },
      vulpix: { pokemon: vulpix, hints: ['Un zorro de hielo, como vulpix', 'vulpix alola', 'vulpixalola'] },
      mime: { pokemon: mime, hints: ['mr. mime hace mimo', 'mrmime'] },
      tauros: { pokemon: { id: 'tauros-paldea-aqua-breed', name: 'Tauros de Paldea (raza acuática)' }, hints: ['Un tauros que nada', 'TAUROS!!', 'tauros paldea aqua breed'] },
      zigzagoon: { pokemon: { id: 'zigzagoon-galar', name: 'Zigzagoon de Galar' }, hints: ['zigzagoon corre en zigzag', 'zigzagoon galar'] },
      hooh: { pokemon: { id: 'ho-oh', name: 'Ho-Oh' }, hints: ['Ho Oh vuela', 'hooh'] },
      farfetchd: { pokemon: { id: 'farfetchd', name: "Farfetch'd" }, hints: ['farfetchd con puerro', "farfetch'd"] },
    };
    const allowedEverywhere = ['Siente el aura de los demás', 'Un pájaro arcoíris', 'Toro de agua', '   ', 'zig zag', 'mime'];
    const hints = [...Object.values(rejected).flatMap((entry) => entry.hints), ...allowedEverywhere];
    for (const { pokemon, hints: forbidden } of Object.values(rejected)) {
      for (const hint of hints) expect(tabooHintProblem(hint, pokemon) !== null, `${pokemon.id} · «${hint}»`).toBe(forbidden.includes(hint));
    }
  });
});

function game(over: Partial<PokeTabooPublicState> = {}): Pick<PokeTabooPublicState, 'phase' | 'roundNumber' | 'descriptorOrder' | 'descriptorId' | 'nextDescriptorId' | 'lastRound'> {
  return { phase: 'ROUND_ACTIVE', roundNumber: 2, descriptorOrder: ['p1', 'p2', 'p3'], descriptorId: 'p2', nextDescriptorId: 'p3', lastRound: null, ...over };
}

describe('orden de turnos', () => {
  it('dice quién describe, quién va después y quién ya describió en la vuelta', () => {
    expect(tabooTurnStatus(game(), 'p1')).toBe('done');
    expect(tabooTurnStatus(game(), 'p2')).toBe('describing');
    expect(tabooTurnStatus(game(), 'p3')).toBe('next');
  });
  it('en la vuelta siguiente vuelve a empezar y, al revelar, quien describía «describió»', () => {
    expect(tabooTurnStatus(game({ roundNumber: 4, descriptorId: 'p1', nextDescriptorId: 'p2' }), 'p3')).toBe('pending');
    expect(tabooTurnStatus(game({ phase: 'ROUND_RESULTS', lastRound: { ...result, descriptorId: 'p2' } }), 'p2')).toBe('described');
  });
  it('insignia y paso del carril', () => {
    expect(tabooRoundLabel({ roundNumber: 3, totalRounds: 6, lapNumber: 1, totalLaps: 2 })).toBe('Turno 3 de 6 · Vuelta 1 de 2');
    expect(tabooCurrentStep('ROUND_ACTIVE')).toBe('describe');
    expect(tabooCurrentStep('ROUND_RESULTS')).toBe('reveal');
    expect(tabooCurrentStep('GAME_RESULTS')).toBeNull();
  });
});

describe('títulos, región viva y veredicto', () => {
  it('el título según el rol', () => {
    expect(tabooRole({ role: 'DESCRIPTOR', canSendHint: true, secretPokemon: null })).toBe('describer');
    expect(tabooRole({ role: 'SPECTATOR' })).toBe('watcher');
    expect(tabooRole(null)).toBe('waiting');
    expect(tabooHeading({ phase: 'ROUND_ACTIVE', role: 'describer', describerName: 'Ana', result: null })).toBe('Describe tu Pokémon');
    expect(tabooHeading({ phase: 'ROUND_ACTIVE', role: 'guesser', describerName: 'Ana', result: null })).toBe('¿Qué Pokémon describe Ana?');
    expect(tabooHeading({ phase: 'ROUND_ACTIVE', role: 'watcher', describerName: 'Ana', result: null })).toBe('Ana está describiendo');
    expect(tabooHeading({ phase: 'ROUND_RESULTS', role: 'guesser', describerName: 'Ana', result })).toBe('¡Era Lucario!');
  });

  const base = { phase: 'ROUND_ACTIVE' as const, roundNumber: 1, describerName: 'Ana', secretName: null, hints: [], ownLast: null, problem: null, result: null, nameOf };
  it('anuncia el turno, la pista nueva entera, el fallo propio (lo más reciente manda), la palabra prohibida y la revelación', () => {
    expect(tabooAnnouncement({ ...base, role: 'guesser' })).toBe('Turno 1: describe Ana. Busca el Pokémon cuando lo sepas.');
    expect(tabooAnnouncement({ ...base, role: 'describer', secretName: 'Lucario' })).toBe('Turno 1: te toca describir a Lucario. No digas ni escribas su nombre.');
    const hints = [{ id: 1, text: 'Tiene aura', sentAt: 2_000 }];
    const miss = { playerId: 'p2', guessedPokemon: { id: 'riolu', name: 'Riolu', sprite: '' }, attemptedAt: 3_000 };
    expect(tabooAnnouncement({ ...base, role: 'guesser', hints })).toBe('Pista 1 de Ana: Tiene aura');
    expect(tabooAnnouncement({ ...base, role: 'guesser', hints, ownLast: miss })).toBe('Riolu no era. Nuevo intento en un segundo.');
    expect(tabooAnnouncement({ ...base, role: 'guesser', hints: [...hints, { id: 2, text: 'Es azul', sentAt: 4_000 }], ownLast: miss })).toBe('Pista 2 de Ana: Es azul');
    expect(tabooAnnouncement({ ...base, role: 'describer', hints, problem: 'Lucario' })).toBe('Tu pista contiene «Lucario», que está prohibida: cámbiala para enviarla.');
    expect(tabooAnnouncement({ ...base, phase: 'ROUND_RESULTS', role: 'guesser', result })).toBe('Turno 1 terminado. Pedro acertó Lucario en 2 intentos.');
  });

  it('el resumen y el veredicto propio de la revelación', () => {
    expect(tabooRevealSummary({ ...result, winnerId: null }, nameOf)).toBe('Nadie lo adivinó: era Lucario.');
    expect(tabooVerdict(result, 'p2', true)).toEqual({ tone: 'ok', text: '¡Lo adivinaste en 2 intentos!', points: 4 });
    expect(tabooVerdict(result, 'p1', true)).toEqual({ tone: 'ok', text: 'Tu descripción funcionó', points: 2 });
    expect(tabooVerdict(result, 'p3', true).text).toBe('Otro jugador lo adivinó antes');
    expect(tabooVerdict(result, 'p9', false).text).toBe('Estás observando');
    expect(tabooVerdict({ ...result, winnerId: null }, 'p1', true)).toEqual({ tone: 'bad', text: 'Nadie adivinó tu Pokémon', points: 0 });
  });

  it('la línea de métricas de los resultados', () => {
    expect(tabooStatsLine({ guessedPokemon: 2, firstTry: 1, descriptorSuccesses: 1, descriptorRounds: 2, pointsFromGuessing: 9, pointsFromDescribing: 2 }))
      .toBe('2 adivinados · 1 al primer intento · 1/2 turnos describiendo con acierto · +9 adivinando · +2 describiendo');
  });
});
