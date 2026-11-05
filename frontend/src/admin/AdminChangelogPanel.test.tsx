import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminChangelogPanel, ChangelogVersionList, emptyChanges, formFromEntry, highlightCount, newChangelogForm, normalizedChange } from './AdminChangelogPanel';
import { entry, LEGACY } from './fixtures';

const noop = () => undefined;

describe('formulario del changelog', () => {
  it('una versión nueva empieza en borrador, con la fecha local y un cambio vacío', () => {
    const form = newChangelogForm(new Date(2026, 10, 4, 23, 30));
    expect(form).toMatchObject({ id: null, summary: '', date: '2026-11-04', published: false, content: [{ type: 'NEW', text: '' }] });
  });
  it('copia una versión sin compartir sus cambios', () => {
    const form = formFromEntry(entry);
    expect(form).toMatchObject({ id: 'c1', version: '0.9.0', date: '2026-11-03', published: true });
    expect(form.content[0]).not.toBe(entry.content[0]);
    expect(form.summary).toBe('La portada estrena pantalla de título.');
    expect(formFromEntry({ ...entry, summary: undefined as never }).summary).toBe('');
  });
  it('guarda highlight solo cuando es true, para que el formulario no parezca cambiado', () => {
    expect(normalizedChange({ type: 'NEW', text: 'A', highlight: false })).toEqual({ type: 'NEW', text: 'A' });
    expect(normalizedChange({ type: 'NEW', text: 'A', highlight: true })).toEqual({ type: 'NEW', text: 'A', highlight: true });
    expect(highlightCount(formFromEntry(entry).content)).toBe(1);
  });
  it('marca los cambios sin texto', () => {
    expect(emptyChanges([{ type: 'NEW', text: 'Algo' }, { type: 'BUGS', text: '  ' }, { type: 'NEW', text: '' }])).toEqual([1, 2]);
  });
});

describe('ChangelogVersionList', () => {
  it('vacío, error con «Reintentar» y lista con estado en texto', () => {
    expect(renderToStaticMarkup(<ChangelogVersionList entries={[]} currentId={null} onOpen={noop} status={{ kind: 'empty', title: 'No hay versiones todavía' }} />)).toContain('No hay versiones todavía');
    const error = renderToStaticMarkup(<ChangelogVersionList entries={[]} currentId={null} onOpen={noop} status={{ kind: 'error', title: 'No se pudo cargar el changelog', action: { label: 'Reintentar', onClick: noop } }} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain('Reintentar');
    const html = renderToStaticMarkup(<ChangelogVersionList entries={[entry, { ...entry, id: 'c2', version: '0.8.0', published: false }]} currentId="c1" onOpen={noop} status={null} />);
    expect(html).toContain('v0.9.0');
    expect(html).toContain('Publicada');
    expect(html).toContain('Borrador');
    expect(html).toContain('aria-label="Editar v0.8.0"');
    expect(html).toContain('2 registros');
  });
});

describe('AdminChangelogPanel', () => {
  it('carga las versiones y abre el editor de una nueva, solo con el catálogo', () => {
    const html = renderToStaticMarkup(<AdminChangelogPanel />);
    expect(html).toContain('Cargando versiones');
    expect(html).toContain('Nueva versión');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Publicar esta versión');
    expect(html).toContain('Guardar borrador');
    expect(html).toContain('Añadir cambio');
    expect(html).not.toMatch(LEGACY);
  });
});
