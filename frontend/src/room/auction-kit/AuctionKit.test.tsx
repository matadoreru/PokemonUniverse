import { Hourglass } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuctionAward, AuctionLot, AuctionScreen, BidControls, BidHistory, BudgetPlate, bidBlock, bidLog, type BidBlockInput, type BidControlsProps } from '.';

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

  it('bloqueada: los controles a la vista deshabilitados y «Pujar» dice por qué', () => {
    for (const [block, title] of [[{ leading: true }, 'Ya vas ganando'], [{ max: 2, canRaise: false }, 'Sin presupuesto'], [{ open: false }, 'Puja cerrada']] as const) {
      const html = controls({}, block);
      expect(html).toContain(`>${title}</h2>`);
      expect(html).toMatch(new RegExp(`data-testid="bid-submit"[^>]*>.*${title}`));
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-submit"|<button[^>]*data-testid="bid-submit"[^>]*disabled=""/);
      expect(html).not.toContain('NaN');
    }
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
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-submit"|<button[^>]*data-testid="bid-submit"[^>]*disabled=""/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-pass"|data-testid="bid-pass"[^>]*disabled=""/);
    // Team Auction (el motor no da `canPass` a quien no llega): los dos bloqueados.
    const team = controls({ max: 2 }, { max: 2, canRaise: false, canPass: false });
    expect(team).toMatch(/<button[^>]*disabled=""[^>]*data-testid="bid-pass"|data-testid="bid-pass"[^>]*disabled=""/);
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
  it('la puja actual, quién va ganando, la mínima y el turno en texto', () => {
    const html = renderToStaticMarkup(<AuctionLot kicker="Lote 3 · en subasta" item={<span>Pikachu</span>} currentBid={4} leader={{ name: 'Ana', self: true }} minimumBid={5} turn="Turno de Eru"
      award={<AuctionAward tone="won" kicker="Lote 2 adjudicado" title="Charizard para Ana" detail="por 6 monedas" fresh />} />);
    expect(html).toContain('aria-label="Lote 3 · en subasta"');
    expect(html).toMatch(/data-testid="auction-current-bid"><span[^>]*><strong>4<\/strong> <small>monedas<\/small>/);
    expect(html).toContain('Ana');
    expect(html).toContain('5 monedas');
    expect(html).toContain('Turno de Eru');
    expect(html).toContain('Charizard para Ana');
    expect(html).toContain('Nuevo');
    expect(html).not.toMatch(/role="(status|alert)"|aria-live/);
  });

  it('sin pujas y sin lote', () => {
    expect(renderToStaticMarkup(<AuctionLot kicker="Lote 1" item={<span>x</span>} currentBid={null} leader={null} minimumBid={1} />)).toContain('Sin pujas');
    expect(renderToStaticMarkup(<AuctionLot kicker="Lote 1" item={null} currentBid={null} leader={null} minimumBid={1} />)).toContain('La subasta ha terminado.');
    expect(renderToStaticMarkup(<AuctionAward tone="unsold" kicker="Lote 4 sin dueño" title="Mewtwo" />)).toContain('Lote 4 sin dueño');
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

  it('el marco tiene una sola región viva y su testid', () => {
    const html = renderToStaticMarkup(<AuctionScreen gameName="Subasta" roundNumber={1} totalRounds={4} roundLabel="Lote 1 de 4" heading="Tu turno" timer={{ deadline: null, serverOffset: 0, label: 'Turno de puja' }}
      announcement="Lote 1 de 4: Pikachu." stage={<p>lote</p>} side={<p>lado</p>} bottom={<p>abajo</p>} />);
    expect(html).toContain('data-testid="auction-screen"');
    expect(html.match(/aria-live/g)).toHaveLength(1);
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
