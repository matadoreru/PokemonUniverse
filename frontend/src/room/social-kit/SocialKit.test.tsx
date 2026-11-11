import { Search } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChoicePair, PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, VoteBallot, VoteTally, type BallotOption, type ChoiceOption, type VoteBallotProps } from '.';
import { expectSingleLiveRegion } from '../test-support/live-regions';
import { member } from '../test-support/room-view';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const members = [member({ id: 'p1', displayName: 'Ana' }), member({ id: 'p2', displayName: 'Bruno' }), member({ id: 'p3', displayName: 'Carla', connected: false, presence: 'TEMPORARILY_DISCONNECTED' })];

const options: BallotOption[] = [
  { id: 'p1', name: 'Snorlax', ariaLabel: 'Snorlax, respuesta de Ana', sprite: '/snorlax.png', detail: 'de Ana' },
  { id: 'p2', name: 'Psyduck', ariaLabel: 'Psyduck, respuesta de Bruno', sprite: '/psyduck.png', detail: 'de Bruno' },
  { id: 'p3', name: 'Gengar', ariaLabel: 'Gengar, respuesta de Carla', sprite: '/gengar.png', detail: 'de Carla' },
];
const ballot = (props: Partial<VoteBallotProps>) => renderToStaticMarkup(<VoteBallot titleRef={{ current: null }} roundNumber={1} voteRound={1} options={options}
  candidateIds={['p1', 'p2', 'p3']} runoff={false} ownId="p1" ownVote={null} canVote participating onVote={async () => undefined} {...props} />);
const pressable = (html: string) => (html.match(/aria-pressed=/g) ?? []).length;

describe('social-kit: fases', () => {
  it('marca la actual con aria-current, flecha y nombre; las pasadas con ✓ y «hecho»', () => {
    const html = renderToStaticMarkup(<PhaseRail steps={[{ key: 'choose', label: 'Elegir' }, { key: 'vote', label: 'Votar' }, { key: 'result', label: 'Resultado' }]} current="vote" />);
    expect(html).toContain('aria-label="Fases de la ronda"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step" data-phase="vote"/);
    expect(html).toContain('Elegir<span class="sr-only"> (hecho)</span>');
    expect(html).toContain('>3<');
    const none = renderToStaticMarkup(<PhaseRail steps={[{ key: 'choose', label: 'Elegir' }]} current={null} />);
    expect(none).not.toContain('aria-current');
  });
});

describe('social-kit: progreso', () => {
  it('dice quién ha terminado en texto, sin el qué, y quién está sin conexión', () => {
    const html = renderToStaticMarkup(<ResponseProgress members={members} playerIds={['p1', 'p2', 'p3']} doneIds={['p2']} selfId="p1" doneText="Votó" note="Los votos son secretos." />);
    expect(html.match(/data-testid="social-progress-row"/g)).toHaveLength(3);
    expect(html).toContain('Votó');
    expect(html.match(/Pendiente/g)).toHaveLength(2);
    expect(html).toContain('Sin conexión');
    expect(html).toContain('1/3');
    expect(html).toContain('Los votos son secretos.');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });

  it('con status y value sirve para la revelación («Sin respuesta», «+3»)', () => {
    const html = renderToStaticMarkup(<ResponseProgress members={members} playerIds={['p1', 'p2']} doneIds={[]} selfId="p1" count={false}
      status={(id) => (id === 'p1' ? { tone: 'ok', text: 'Ganó' } : { tone: 'bad', text: 'Sin respuesta' })} value={(id) => (id === 'p1' ? '+3' : '+0')} />);
    expect(html).toContain('Ganó');
    expect(html).toContain('Sin respuesta');
    expect(html).toContain('+3');
    expect(html).not.toContain('Pendiente');
  });
});

describe('social-kit: papeleta', () => {
  it('abierta: cartas seleccionables con aria-pressed (la propia no), confirmar deshabilitado hasta elegir', () => {
    const html = ballot({});
    expect(html).toContain('Vota la mejor respuesta');
    expect(pressable(html)).toBe(2);
    expect(html).toContain('aria-label="Psyduck, respuesta de Bruno"');
    expect(html).not.toContain('aria-label="Snorlax, respuesta de Ana"');
    expect(html).toContain('Tu respuesta');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ballot-confirm"|<button[^>]*data-testid="ballot-confirm"[^>]*disabled=""/);
    expect(html).toContain('Elige una opción y confirma tu voto.');
  });

  it('segunda vuelta: solo los empatados, con su título y «Empate»', () => {
    const html = ballot({ runoff: true, voteRound: 2, candidateIds: ['p1', 'p2'] });
    expect(html).toContain('Vota entre las empatadas');
    expect(html).toContain('Psyduck');
    expect(html).not.toContain('Gengar');
    expect(html).toContain('Empate');
    expect(pressable(html)).toBe(1);
  });

  it('bloqueada: el voto propio marcado («Tu voto»), sin botones ni confirmar', () => {
    const html = ballot({ ownVote: 'p2', canVote: false });
    expect(html).toContain('Voto bloqueado');
    expect(html).toContain('Tu voto');
    expect(pressable(html)).toBe(0);
    expect(html).not.toContain('ballot-confirm');
  });

  it('observando: las opciones a la vista, sin botones', () => {
    const html = ballot({ participating: false, canVote: false, ownId: null });
    expect(html).toContain('Estás observando');
    expect(pressable(html)).toBe(0);
    expect(html).toContain('Gengar');
  });

  it('opciones de texto: el texto entero y el nombre accesible sin autor (anónimas)', () => {
    const text = [{ id: 'a1', name: 'Respuesta 1', ariaLabel: 'Respuesta 1', text: 'Se come los pasteles de los demás sin pedir permiso y encima se queja de que están secos.' }, { id: 'a2', name: 'Respuesta 2', ariaLabel: 'Respuesta 2', text: 'Ronca.' }];
    const html = renderToStaticMarkup(<VoteBallot titleRef={{ current: null }} roundNumber={1} voteRound={1} options={text} candidateIds={['a1', 'a2']} runoff={false} ownId="a2" ownVote={null} canVote participating onVote={async () => undefined} kind="text" />);
    expect(html).toContain('encima se queja de que están secos.');
    expect(pressable(html)).toBe(1);
    expect(html).toContain('aria-label="Respuesta 1"');
  });
});

describe('social-kit: recuento', () => {
  const tallyOptions = options.map(({ id, name, detail }) => ({ id, name, detail }));
  const voterName = (id: string) => members.find((entry) => entry.id === id)?.displayName ?? id;

  it('con segunda vuelta: cada vuelta en su bloque visible (primero la que decide), barras y «N votos» sin puntos', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p2']} voterName={voterName} intro="¿Quién llegaría tarde?" />);
    expect(html).toContain('Gana Psyduck con 2 votos tras la segunda vuelta.');
    // Sin pestañas: las dos vueltas a la vista, cada una con su título; la que decide, arriba.
    expect(html).not.toMatch(/role="tab"|aria-selected/);
    expect(html.match(/data-tally-round=/g)).toHaveLength(2);
    expect(html).toMatch(/data-tally-round="2"[^]*Segunda vuelta[^]*data-tally-round="1"[^]*Primera vuelta/);
    expect(html.match(/data-testid="tally-row"/g)).toHaveLength(5);
    expect(html).toMatch(/data-testid="tally-votes"[^>]*>(<[^>]+>)*2(<[^>]+>|\s)*votos/);
    expect(html).toContain('Ganadora');
    expect(html).toContain('role="meter"');
    // Cada franja en una línea en escritorio (`Row inline`), para que quepan sin desplazar.
    expect(html.match(/class="[^"]*_inline_/g)).toHaveLength(5);
    // Los puntos ya están en el lateral «Puntos de la ronda»: nada de «+N» en el recuento.
    expect(html).not.toMatch(/>\+\d/);
  });

  it('la barra se llena respecto a la más votada de la vuelta', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p2']} voterName={voterName} />);
    expect(html).toMatch(/aria-valuenow="2"[^>]*aria-valuemax="2"|aria-valuemax="2"[^>]*aria-valuenow="2"/);
    expect(html).toMatch(/aria-valuenow="1"[^>]*aria-valuemax="2"|aria-valuemax="2"[^>]*aria-valuenow="1"/);
  });

  it('quién votó a quién: una ficha con avatar por voto, con el nombre en `title` y en texto para lectores', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p2']} voterName={voterName} voterAvatar={() => ({ type: 'DEFAULT' })} />);
    const voters = [...html.matchAll(/data-testid="tally-voter"[^>]*title="([^"]+)"|title="([^"]+)"[^>]*data-testid="tally-voter"/g)].map((match) => match[1] ?? match[2]);
    expect(voters).toEqual(['Ana', 'Carla', 'Bruno']);
    expect(html).toContain('<span class="sr-only">Votos de Ana y Carla</span>');
    expect(html).toContain('<span class="sr-only">Votos de Bruno</span>');
    // Ya no hay línea de texto visible «Votos de …»: solo la de lectores.
    expect(html.match(/Votos de Ana y Carla/g)).toHaveLength(1);
  });

  it('insignias propias del juego y el Pokémon elegido (sprite pequeño con su nombre)', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p2', p1: 'p2' } }];
    const fake = [
      { id: 'p1', name: 'Ana', pick: { name: 'Lapras', sprite: '/lapras.png' } },
      { id: 'p2', name: 'Bruno', pick: { name: 'Snorlax', sprite: '/snorlax.png' }, tags: [{ key: 'fake', label: 'Fake' }] },
    ];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={fake} rounds={rounds} winnerIds={['p2']} voterName={voterName} winnerLabel="Más votado" />);
    expect(html).toMatch(/data-tally-winner="true"[^]*Más votado[^]*Fake</);
    expect(html).not.toContain('Fake ·');
    expect(html).toMatch(/<img[^>]*src="\/lapras.png"[^>]*alt=""|<img[^>]*alt=""[^>]*src="\/lapras.png"/);
    expect(html).toMatch(/data-testid="tally-pick"[^>]*>(<[^>]+>)*(<span class="sr-only">eligió <\/span>)?Lapras|data-testid="tally-pick"[^]*?Lapras/);
  });

  it('empate en la vuelta final: «Empate» explícito y victoria compartida', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p1', 'p2']} voterName={voterName} />);
    expect(html).toContain('victoria compartida');
    expect(html.match(/Empate</g)).toHaveLength(2);
    expect(html).not.toContain('Primera vuelta');
  });

  it('nadie votó: «Empate sin votos», nunca «Ganadora» con 0 votos; una sola respuesta: «Única respuesta»', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2'], votes: {} }, { number: 2, candidateIds: ['p1', 'p2'], votes: {} }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p1', 'p2']} voterName={voterName} />);
    expect(html).toContain('Empate sin votos');
    expect(html).not.toContain('Ganadora');
    const single = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions.slice(0, 1)} rounds={[]} winnerIds={['p1']} voterName={voterName} />);
    expect(single).toContain('Única respuesta');
    expect(single).not.toContain('0 votos');
    expect(single).not.toContain('Ganadora');
  });

  it('empate decidido por sorteo: nunca «Gana X con N votos»; «Empate · sorteo» en los empatados', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p3: 'p1', p1: 'p2' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p2']} voterName={voterName} winnerLabel="Más votado" winnerIcon={null} verb="Sale" />);
    expect(html).toContain('Empate a 1 voto entre Snorlax y Psyduck tras la segunda vuelta: el sorteo eligió a Psyduck.');
    expect(html).not.toMatch(/Sale Psyduck con|Gana Psyduck con/);
    expect(html.match(/Empate · sorteo/g)).toHaveLength(2);
    expect(html).toContain('Más votado');
    expect(html).not.toContain('lucide-crown');
  });

  it('empate sin ganador y resumen propio', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p1', p1: 'p2' } }];
    const tie = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={[]} voterName={voterName} />);
    expect(tie).toContain('Empate a 1 voto entre Snorlax y Psyduck: no hay ganador.');
    expect(tie.match(/Empate</g)).toHaveLength(2);
    const own = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={[]} voterName={voterName} summary="La sala quedó dividida." />);
    expect(own).toContain('La sala quedó dividida.');
  });

  it('la ganadora destaca (highlight); la propia perdedora solo lleva el chip «Tuya»', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2'], votes: { p3: 'p2', p1: 'p2' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions.map((option) => ({ ...option, self: option.id === 'p1' }))} rounds={rounds} winnerIds={['p2']} voterName={voterName} />);
    expect(html.match(/data-highlight="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-tally-winner="true"[^]*?data-highlight="true"/);
    expect(html).toContain('Tuya');
    expect(html).not.toMatch(/_self_/);
  });

  it('sin respuestas: el vacío, sin región viva', () => {
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={[]} rounds={[]} winnerIds={[]} voterName={voterName} />);
    expect(html).toContain('Nadie respondió a tiempo.');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });
});

describe('social-kit: marco', () => {
  it('una sola región viva; fases, escena, lateral y placa', () => {
    const html = renderToStaticMarkup(<SocialScreen gameName="Most Likely To" roundNumber={1} totalRounds={3} heading="Vota la mejor respuesta" announcement="Votación abierta."
      timer={{ deadline: 5_000, serverOffset: 0, label: 'Para votar' }} phases={<PhaseRail steps={[{ key: 'vote', label: 'Votar' }]} current="vote" />}
      stage={<SocialPrompt kicker="La pregunta del grupo" text="¿Quién llegaría tarde a una cita?" />}
      side={<ResponseProgress members={members} playerIds={['p1']} doneIds={[]} selfId="p1" />}
      bottom={<SocialPlate titleRef={{ current: null }} content={{ icon: Search, tone: 'info', kicker: 'Tu respuesta', title: 'Elige un Pokémon' }} />} />);
    expectSingleLiveRegion(html);
    expect(html).toContain('Votación abierta.');
    expect(html).toContain('Ronda 1 de 3');
    expect(html).toContain('¿Quién llegaría tarde a una cita?');
    expect(html).toContain('id="social-plate-title"');
    expect(html).toContain('Fases de la ronda');
    const label = renderToStaticMarkup(<SocialScreen gameName="Poké Taboo" roundNumber={3} totalRounds={6} roundLabel="Turno 3 de 6 · Vuelta 1 de 2" heading="Describe" announcement=""
      timer={{ deadline: null, serverOffset: 0, label: 'Tiempo' }} stage={null} side={null} bottom={null} />);
    expect(label).toContain('Turno 3 de 6 · Vuelta 1 de 2');
    expect(label).not.toContain('Ronda 3 de 6');
  });
});

describe('social-kit: papeleta de dos opciones', () => {
  const pair: readonly [ChoiceOption<'A' | 'B'>, ChoiceOption<'A' | 'B'>] = [
    { id: 'A', name: 'Opción A', text: 'Vivir con Gengar', ariaLabel: 'Opción A: Vivir con Gengar' },
    { id: 'B', name: 'Opción B', text: 'Viajar con Magikarp', ariaLabel: 'Opción B: Viajar con Magikarp' },
  ];
  it('abierta: dos cartas grandes con aria-pressed, atajos 1 y 2 con su insignia, «VS» y la ayuda', () => {
    const html = renderToStaticMarkup(<ChoicePair kicker="El dilema · Tu decisión" help="Atajos: 1 y 2." options={pair} value="B" onChange={() => undefined} aside={<span>Tu elección: B</span>} />);
    expect(html).toContain('aria-label="El dilema · Tu decisión"');
    expect(html.match(/aria-pressed=/g)).toHaveLength(2);
    expect(html).toContain('aria-pressed="true" aria-label="Opción B: Viajar con Magikarp" aria-keyshortcuts="2"');
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toContain('>VS<');
    expect(html).toContain('Atajos: 1 y 2.');
    expect(html).toContain('Tu elección: B');
    expect(html).not.toMatch(/aria-live|role="status"/);
  });
  it('deshabilitada: las opciones fijas, sin botones ni atajos; la elegida sigue marcada', () => {
    const html = renderToStaticMarkup(<ChoicePair kicker="Tu decisión" options={pair} value="A" onChange={() => undefined} disabled />);
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('aria-keyshortcuts');
    expect(html).toContain('Vivir con Gengar');
    expect(html).not.toContain('<button');
  });
});
