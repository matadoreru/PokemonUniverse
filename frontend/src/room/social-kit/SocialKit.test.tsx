import type { RoomMemberView } from '@pokemon-universe/shared';
import { Search } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PhaseRail, ResponseProgress, SocialPlate, SocialPrompt, SocialScreen, VoteBallot, VoteTally, type BallotOption, type VoteBallotProps } from '.';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const member = (id: string, displayName: string, presence: 'CONNECTED' | 'TEMPORARILY_DISCONNECTED' = 'CONNECTED') => ({ id, displayName, avatar: { type: 'DEFAULT' as const }, connected: presence === 'CONNECTED', presence, roomRole: 'MEMBER' as const, role: 'PLAYER' as const, isHost: false, ready: false, sessionPoints: 0 }) as RoomMemberView;
const members = [member('p1', 'Ana'), member('p2', 'Bruno'), member('p3', 'Carla', 'TEMPORARILY_DISCONNECTED')];

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

  it('con segunda vuelta: pestaña por vuelta (abierta la que decide), barras, votos en texto, quién votó y la ganadora', () => {
    const rounds = [{ number: 1, candidateIds: ['p1', 'p2', 'p3'], votes: { p1: 'p2', p2: 'p1' } }, { number: 2, candidateIds: ['p1', 'p2'], votes: { p1: 'p2', p3: 'p2', p2: 'p1' } }];
    const html = renderToStaticMarkup(<VoteTally idBase="t" options={tallyOptions} rounds={rounds} winnerIds={['p2']} voterName={voterName} points={(id) => (id === 'p2' ? 3 : 0)} intro="¿Quién llegaría tarde?" />);
    expect(html).toContain('Gana Psyduck con 2 votos tras la segunda vuelta.');
    expect(html).toContain('Primera vuelta');
    expect(html).toMatch(/aria-selected="true"[^>]*>(<[^>]+>)*Segunda vuelta/);
    expect(html.match(/data-testid="tally-row"/g)).toHaveLength(2);
    expect(html).toContain('2 votos');
    expect(html).toContain('Votos de Ana y Carla');
    expect(html).toContain('Ganadora');
    expect(html).toContain('+3');
    expect(html).toContain('role="meter"');
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
    expect(html.match(/aria-live/g)).toHaveLength(1);
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
