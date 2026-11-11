import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptSourceField, type PromptSourceOption } from './PromptSourceField';
import { roomView } from '../../room/test-support/room-view';

const auth = vi.hoisted(() => ({ user: { kind: 'GUEST' } as { kind: string } | null }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => auth }));

const sources: PromptSourceOption[] = [
  { id: 'OFFICIAL', title: 'Oficiales', detail: 'Las del catálogo.' },
  { id: 'CUSTOM', title: 'Personales', detail: 'Solo las del host.' },
  { id: 'BOTH', title: 'Mezcladas', detail: 'Las dos.' },
];
const room = roomView({ hostId: 'host' });

const render = (selfId: string, extra: { masculine?: boolean } = {}) => renderToStaticMarkup(
  <PromptSourceField label="Fuente de preguntas" sources={sources} value="CUSTOM" disabled={false} onChange={() => undefined} room={room} selfId={selfId}
    noun={extra.masculine ? 'dilemas' : 'preguntas'} {...extra} hostCount={3} manager={<p>GESTOR</p>} />,
);

describe('PromptSourceField', () => {
  beforeEach(() => { auth.user = { kind: 'GUEST' }; });

  it('pinta la fuente con su etiqueta y, como ayuda, el detalle de la elegida', () => {
    const html = render('otro');
    expect(html).toContain('>Fuente de preguntas</span>');
    expect(html).toMatch(/aria-checked="true"[^>]*>Personales</);
    expect(html).toContain('>Solo las del host.</p>');
  });

  it('a quien no es el host le dice cuántas tiene activas el host, con la concordancia del nombre', () => {
    expect(render('otro')).toContain('Las preguntas personales pertenecen al host. Hay 3 activas.');
    expect(render('otro', { masculine: true })).toContain('Los dilemas personales pertenecen al host. Hay 3 activos.');
    expect(render('otro')).not.toContain('GESTOR');
  });

  it('al host sin cuenta lo invita a crearla y no le monta el gestor', () => {
    const html = render('host');
    expect(html).toContain('Crea una cuenta para guardar preguntas personales de forma permanente.');
    expect(html).not.toContain('GESTOR');
  });

  it('al host registrado le monta el gestor en lugar de la nota', () => {
    auth.user = { kind: 'USER' };
    const html = render('host');
    expect(html).toContain('GESTOR');
    expect(html).not.toContain('pertenecen al host');
    expect(html).not.toContain('Crea una cuenta');
  });
});
