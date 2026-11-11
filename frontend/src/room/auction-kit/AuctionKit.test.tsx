import { Hourglass } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GAME_SIDE_FIT } from '../game-kit/GameScreen';
import { AuctionAward, AuctionLot, AuctionPrevious, AuctionScreen, BidControls, BidHistory, BudgetPlate, bidBlock, bidLog, turnOrderEntries, type BidBlockInput, type BidControlsProps } from '.';
import { expectSingleLiveRegion } from '../test-support/live-regions';

// «Saltar minijuego» va en la cabecera (`GameSkipSlot` lee la sala): sin votación de salto no pinta nada.
vi.mock('../RoomContext', () => ({ useRoom: () => ({ room: { gameSkipState: null }, connected: true, setGameSkipVote: () => undefined }) }));

const open: BidBlockInput = { participating: true, open: true, canRaise: true, canPass: true, leading: false, min: 5, max: 20, turnName: null };
const controls = (props: Partial<BidControlsProps> = {}, block: Partial<BidBlockInput> = {}) => renderToStaticMarkup(<BidControls titleRef={{ current: null }} block={bidBlock({ ...open, ...block })}
  min={5} max={20} epoch={1} onBid={async () => undefined} onPass={async () => undefined} budget={20} {...props} />);

describe('auction-kit: controles de la puja', () => {
  it('en tu turno: incrementos con atajo, campo, «Pujar N», «Pasar» y el presupuesto', () => {
    const html = controls();
    expect(html).toContain('id="bid-controls-title"');
    expect(html).toContain('Tu turno');
    expect(html.match(/data-testid="bid-step"/g)).toHaveLength(4);
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toContain('Mínima: 5');
    expect(html).toContain('Todo: 20');
    expect(html).toContain('Pujar 5');
    expect(html).toContain('Pasar');
    expect(html).toContain('Tu presupuesto');
    expect(html).toMatch(/type="number"[^>]*min="5"[^>]*max="20"|max="20"[^>]*min="5"/);
    // Una sola región viva por pantalla: la placa no trae alertas ni `aria-live`.
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });

  it('sin poder pujar ni pasar (no es tu turno, vas ganando, sin presupuesto, cerrada): solo el mensaje, sin controles grises', () => {
    for (const [block, title] of [[{ leading: true, canRaise: false, canPass: false }, 'Ya vas ganando'], [{ max: 2, canRaise: false, canPass: false }, 'Sin presupuesto'], [{ open: false }, 'Puja cerrada'], [{ canRaise: false, canPass: false, turnName: 'Ana' }, 'Esperando tu turno']] as const) {
      const html = controls({}, block);
      expect(html).toContain(`>${title}</h2>`);
      expect(html).toContain('data-idle="true"');
      expect(html).not.toContain('bid-submit');
      expect(html).not.toContain('bid-pass');
      expect(html).not.toContain('bid-step');
      // El presupuesto sigue a la vista.
      expect(html).toContain('Tu presupuesto');
      expect(html).not.toContain('NaN');
    }
    expect(controls({}, { leading: true, canRaise: false, canPass: false, texts: { leading: { title: 'Le toca a Ana', text: 'Tú vas ganando con 3 monedas.' } } })).toContain('Tú vas ganando con 3 monedas.');
  });

  it('quien observa solo ve la placa; sin `onPass` no hay «Pasar»', () => {
    const watching = controls({}, { participating: false });
    expect(watching).toContain('Estás observando');
    expect(watching).not.toContain('bid-submit');
    expect(controls({ onPass: undefined })).not.toContain('bid-pass');
    expect(controls({ budget: null })).not.toContain('Tu presupuesto');
  });

  it('sin llegar a la mínima pero con permiso del servidor para pasar, «Pasar» sigue activo (Bluff en el máximo)', () => {
    const html = controls({ min: 1026, max: 1025, budget: null, allIn: false }, { min: 1026, max: 1025, texts: { noBudget: { title: 'Puja máxima', text: 'Nadie puede subir más.' } } });
    expect(html).toContain('>Puja máxima</h2>');
    // Solo «Pasar» a la vista: ni campo con un valor imposible (1026 > 1025), ni incrementos ni «Pujar» grises.
    expect(html).not.toContain('bid-submit');
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain('bid-step');
    expect(html).not.toContain('1026');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-pass"|data-testid="bid-pass"[^>]*disabled=""/);
    // Team Auction (el motor no da `canPass` a quien no llega): solo el mensaje.
    expect(controls({ max: 2 }, { max: 2, canRaise: false, canPass: false })).not.toContain('bid-pass');
  });

  it('sin `allIn` no hay «Todo»', () => {
    const html = controls({ allIn: false });
    expect(html).not.toContain('Todo:');
    expect(html.match(/data-testid="bid-step"/g)).toHaveLength(3);
  });

  it('con poco presupuesto los incrementos no se pasan del máximo', () => {
    const html = controls({ max: 6 }, { max: 6 });
    expect(html).toContain('Mínima: 5');
    expect(html).toContain('Todo: 6');
    expect(html).not.toContain('+2: 7');
  });
});

describe('auction-kit: lote y adjudicación', () => {
  it('una sola tarjeta con el estado de la puja: la cifra, quién gana, el mínimo para superarla y el turno en texto', () => {
    const html = renderToStaticMarkup(<AuctionLot kicker="Lote 3 · en subasta" item={<span>Pikachu</span>} currentBid={4} leader={{ name: 'Ana', self: true }} minimumBid={5} turn="Turno de Eru"
      previous={<AuctionPrevious kicker="Lote 2" item="Charizard" winner="Ana" detail="6 monedas" />} />);
    expect(html).toContain('aria-label="Lote 3 · en subasta"');
    expect(html.match(/data-testid="auction-status"/g)).toHaveLength(1);
    expect(html).toContain('Estado de la puja');
    expect(html).toMatch(/data-testid="auction-current-bid"><span[^>]*><strong>4<\/strong> <small>monedas<\/small>/);
    expect(html).toMatch(/data-testid="auction-leader">.*va ganando.*Ana.*Tú/);
    expect(html).toMatch(/Mínimo para superarla.*<strong>5<\/strong>/);
    expect(html).toContain('Turno de Eru');
    // El lote anterior, una línea pequeña fuera de la tarjeta.
    expect(html).toMatch(/data-testid="auction-previous"[^>]*>.*Lote 2.*Charizard.*para.*Ana.*6 monedas/);
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });

  it('fila del orden de turno: el actual marcado y quien pasó tachado, con icono y texto', () => {
    const order = turnOrderEntries({ order: ['a', 'b', 'c'], turnId: 'b', passedIds: ['a'], leaderId: 'c' }, (id) => ({ a: 'JejeGOz', b: 'Sitogc19', c: 'eru' })[id] ?? '', 'c');
    const html = renderToStaticMarkup(<AuctionLot kicker="Lote 2" item={<span>x</span>} currentBid={3} leader={{ name: 'eru', self: true }} minimumBid={4} order={order} />);
    expect(html).toContain('aria-label="Orden de turno"');
    expect(html.match(/data-testid="turn-order-entry"/g)).toHaveLength(3);
    expect(html).toMatch(/data-state="passed"[^>]*>.*JejeGOz.*pasó/);
    expect(html).toMatch(/data-state="turn"[^>]*aria-current="true"|aria-current="true"[^>]*data-state="turn"/);
    expect(html).toMatch(/data-state="leading"[^>]*>.*eru.*\(Tú\)/);
  });

  it('con la puja en el máximo: «Puja máxima alcanzada», nunca un mínimo imposible', () => {
    const html = renderToStaticMarkup(<AuctionLot kicker="Ronda 2" item={<span>x</span>} currentBid={1025} leader={{ name: 'Ana' }} minimumBid={1026} maximumBid={1025} unit="Pokémon" />);
    expect(html).toContain('Puja máxima alcanzada');
    expect(html).not.toContain('Mínimo para superarla');
    expect(renderToStaticMarkup(<AuctionLot kicker="Ronda 2" item={<span>x</span>} currentBid={5} leader={{ name: 'Ana' }} minimumBid={6} maximumBid={1025} />)).toContain('Mínimo para superarla');
  });

  it('el líder puede llevar su avatar decorativo junto al nombre', () => {
    expect(renderToStaticMarkup(<AuctionLot kicker="L" item={<span>x</span>} currentBid={3} leader={{ name: 'Ana', avatar: <i data-avatar="ana" /> }} minimumBid={4} />)).toMatch(/data-testid="auction-leader">.*data-avatar="ana".*Ana/);
  });

  it('sin pujas: «Sin pujas» y la mínima para abrir; sin lote, el texto de fin', () => {
    const html = renderToStaticMarkup(<AuctionLot kicker="Lote 1" item={<span>x</span>} currentBid={null} leader={null} minimumBid={1} />);
    expect(html).toMatch(/data-testid="auction-current-bid">Sin pujas</);
    expect(html).toMatch(/Puja mínima.*<strong>1<\/strong>/);
    expect(html).not.toContain('auction-leader');
    expect(renderToStaticMarkup(<AuctionLot kicker="Lote 1" item={null} currentBid={null} leader={null} minimumBid={1} />)).toContain('La subasta ha terminado.');
    expect(renderToStaticMarkup(<AuctionAward tone="unsold" kicker="Lote 4 sin dueño" title="Mewtwo" />)).toContain('Lote 4 sin dueño');
    expect(renderToStaticMarkup(<AuctionPrevious kicker="Lote 4" item="Mewtwo" winner={null} detail="sin dueño" />)).toMatch(/Mewtwo.*sin dueño/);
  });
});

describe('auction-kit: lateral y marco', () => {
  it('presupuestos con estado en texto, la propia marcada y la acción', () => {
    const html = renderToStaticMarkup(<BudgetPlate entries={[
      { id: 'p1', name: 'Eru', budget: 14, self: true, status: { tone: 'warn', text: 'Su turno', icon: Hourglass }, action: <button type="button">Ver tu equipo</button> },
      { id: 'p2', name: 'Ana', budget: 1, disconnected: true },
    ]} />);
    expect(html.match(/data-testid="budget-row"/g)).toHaveLength(2);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('Su turno');
    expect(html).toContain('moneda<');
    expect(html).toContain('Sin conexión');
    expect(html).toContain('Ver tu equipo');
  });

  it('historial: una vista sin pestañas, varias con `Tabs`; vacío sin región viva', () => {
    const entries = bidLog([{ playerId: 'p1', type: 'BID', amount: 3 }], () => 'Ana');
    const one = renderToStaticMarkup(<BidHistory views={[{ key: 'lot', label: 'Este lote', entries, emptyText: 'Nada' }]} />);
    expect(one).toContain('Pujó 3 monedas');
    expect(one).toContain('Nueva');
    expect(one).not.toContain('role="tablist"');
    const many = renderToStaticMarkup(<BidHistory views={[{ key: 'lot', label: 'Este lote', entries: [], emptyText: 'Aún no hay pujas.' }, { key: 'closed', label: 'Cerrados', badge: '0/12', entries: [], emptyText: 'Nada cerrado.' }]} />);
    expect(many).toContain('role="tablist"');
    expect(many).toContain('Aún no hay pujas.');
    expect(many).not.toMatch(/role="(status|alert)"|aria-live/);
  });

  it('historial: sin ninguna puja no llena el alto de la columna lateral; con pujas, sí', () => {
    expect(GAME_SIDE_FIT).not.toBe('');
    const fit = new RegExp(`<section class="[^"]*\\b${GAME_SIDE_FIT}\\b`);
    const entries = bidLog([{ playerId: 'p1', type: 'BID', amount: 3 }], () => 'Ana');
    expect(renderToStaticMarkup(<BidHistory views={[{ key: 'round', label: 'Ronda', entries: [], emptyText: 'Nada' }]} />)).toMatch(fit);
    expect(renderToStaticMarkup(<BidHistory views={[{ key: 'round', label: 'Ronda', entries, emptyText: 'Nada' }]} />)).not.toMatch(fit);
    // Con pestañas basta una vista con franjas para que llene (cambiar de pestaña no cambia el alto).
    expect(renderToStaticMarkup(<BidHistory views={[{ key: 'lot', label: 'Lote', entries: [], emptyText: 'Nada' }, { key: 'closed', label: 'Cerrados', entries, emptyText: 'Nada' }]} />)).not.toMatch(fit);
  });

  it('el marco tiene una sola región viva y su testid', () => {
    const html = renderToStaticMarkup(<AuctionScreen gameName="Subasta" roundNumber={1} totalRounds={4} roundLabel="Lote 1 de 4" heading="Tu turno" timer={{ deadline: null, serverOffset: 0, label: 'Turno de puja' }}
      announcement="Lote 1 de 4: Pikachu." stage={<p>lote</p>} side={<p>lado</p>} bottom={<p>abajo</p>} />);
    expect(html).toContain('data-testid="auction-screen"');
    expectSingleLiveRegion(html);
    expect(html).toContain('Lote 1 de 4');
    // La insignia va envuelta para partir en dos líneas en el móvil (sin `roundLabel`, «Ronda N de M»).
    expect(html).toMatch(/class="[^"]*roundLabel[^"]*">Lote 1 de 4<\/span>/);
    const plain = renderToStaticMarkup(<AuctionScreen gameName="Subasta" roundNumber={2} totalRounds={4} heading="Tu turno" timer={{ deadline: null, serverOffset: 0, label: 'Turno de puja' }}
      announcement="" stage={<p>lote</p>} side={<p>lado</p>} bottom={<p>abajo</p>} />);
    expect(plain).not.toContain('unpinned');
    expect(renderToStaticMarkup(<AuctionScreen gameName="Subasta" roundNumber={2} totalRounds={4} heading="Tu turno" timer={{ deadline: null, serverOffset: 0, label: 'Turno de puja' }}
      announcement="" stage={<p>lote</p>} side={<p>lado</p>} bottom={<p>abajo</p>} pinBottom={false} />)).toMatch(/class="[^"]*unpinned/);
    expect(plain.replace(/<!-- -->/g, '')).toMatch(/class="[^"]*roundLabel[^"]*">Ronda 2 de 4<\/span>/);
  });
});
