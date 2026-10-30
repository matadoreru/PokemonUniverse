/**
 * Medición de encaje y legibilidad en cada captura (portada de la de InazumaElevenManager,
 * `tests/e2e/layout.ts`). Hace fallar el spec cuando aparece:
 * - texto de menos de `minFontPx` (12 px por defecto: `text-xs`);
 * - textos y controles que se pisan (sin contar capas: diálogos, avisos, tooltips, `[data-layer]`);
 * - texto recortado («…», `line-clamp` u `overflow`) sin `title` con el texto completo en él o en
 *   un antepasado;
 * - controles que se salen de la caja que los recorta (sin contar listas y carruseles con scroll).
 *
 * `[data-layout-ignore]` excluye un elemento y sus descendientes: solo para falsos positivos del
 * medidor, nunca para esconder un problema real.
 */
import type { Page } from '@playwright/test';

export interface LayoutReport {
  small: string[];
  overlaps: string[];
  cuts: string[];
  clipped: string[];
}

export async function measureLayout(page: Page, minFontPx = 12): Promise<LayoutReport> {
  return page.evaluate((minPx) => {
    const desc = (el: Element): string => {
      const parts: string[] = [];
      let e: Element | null = el;
      for (let i = 0; e && i < 3; i++, e = e.parentElement) {
        const tid = e.getAttribute('data-testid');
        const cls = (e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        parts.unshift(`${e.tagName.toLowerCase()}${tid ? `[${tid}]` : ''}${cls ? `.${cls}` : ''}`);
        if (tid) break;
      }
      return parts.join('>');
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      // El contenido de un `<details>` cerrado conserva caja en Chromium (`content-visibility:
      // hidden` en su slot), pero no se pinta: `checkVisibility()` lo detecta.
      if (!el.checkVisibility()) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
      }
      return true;
    };
    const ignored = (el: Element) => !!el.closest('[data-layout-ignore]');
    // Caja de un texto: la de sus nodos de texto directos (no la del bloque, que puede ser mucho
    // mayor que el texto), recortada a la caja del elemento.
    const textRect = (el: Element): DOMRect => {
      let l = Infinity;
      let t = Infinity;
      let r = -Infinity;
      let b = -Infinity;
      for (const n of el.childNodes) {
        if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const q = range.getBoundingClientRect();
        l = Math.min(l, q.left);
        t = Math.min(t, q.top);
        r = Math.max(r, q.right);
        b = Math.max(b, q.bottom);
      }
      const box = el.getBoundingClientRect();
      if (l === Infinity) return box;
      // Intersección con la caja del elemento: con `line-height: 1` la caja de la fuente es más alta que su línea.
      const L = Math.max(l, box.left);
      const T = Math.max(t, box.top);
      return new DOMRect(L, T, Math.max(0, Math.min(r, box.right) - L), Math.max(0, Math.min(b, box.bottom) - T));
    };
    const isControl = (el: Element) => el.matches('button, [role="button"], [role="tab"], input, select');
    const root = document.body;
    const clipBox = (el: Element) => {
      const r = isControl(el) ? el.getBoundingClientRect() : textRect(el);
      let l = r.left;
      let t = r.top;
      let rr = r.right;
      let b = r.bottom;
      for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const c = e.getBoundingClientRect();
          l = Math.max(l, c.left);
          t = Math.max(t, c.top);
          rr = Math.min(rr, c.right);
          b = Math.min(b, c.bottom);
        }
      }
      return { l, t, r: rr, b };
    };
    const small: string[] = [];
    const textEls = new Set<Element>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      const text = t.textContent?.trim();
      const el = t.parentElement;
      if (!text || !el || el.closest('svg, canvas, script, style, noscript') || ignored(el) || !visible(el)) continue;
      textEls.add(el);
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < minPx - 0.05) small.push(`${px.toFixed(1)} px «${text.slice(0, 30)}» ${desc(el)}`);
    }
    const cuts: string[] = [];
    for (const el of root.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement) || ignored(el) || !visible(el)) continue;
      const text = el.innerText?.trim();
      if (!text || text.length >= 120 || el.children.length > 2) continue;
      const cs = getComputedStyle(el);
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
      const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip' || clamp;
      const overX = hidesX && el.scrollWidth > el.clientWidth + 1;
      const overY = hidesY && (clamp ? el.scrollHeight > el.clientHeight + 2 : el.scrollHeight > el.clientHeight + parseFloat(cs.fontSize) * 0.6);
      const srOnly = el.clientWidth <= 1 || el.clientHeight <= 1 || el.classList.contains('sr-only');
      if (!(overX || overY) || srOnly) continue;
      if (el.closest('[title]')) continue;
      cuts.push(`«${text.slice(0, 40)}» ${desc(el)} (${el.scrollWidth}/${el.clientWidth})`);
    }
    const controls = 'button, [role="button"], [role="tab"], input, select';
    const boxes = [...new Set([...textEls, ...root.querySelectorAll(controls)])].filter((e) => !ignored(e) && visible(e));
    const rects = boxes.map((e) => ({ e, c: clipBox(e) })).filter((x) => x.c.r - x.c.l > 1 && x.c.b - x.c.t > 1);
    // Capas: lo que está en una capa distinta puede tapar a lo de debajo a propósito.
    const layer = (e: Element) => e.closest('[role="dialog"], dialog, [role="alert"], [role="tooltip"], [data-layer]');
    const control = (e: Element) => e.closest('button, [role="button"], [role="tab"]');
    const block = (e: Element) => {
      let x: Element | null = e;
      while (x && getComputedStyle(x).display.startsWith('inline')) x = x.parentElement;
      return x;
    };
    const overlaps: string[] = [];
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const A = rects[i]!;
        const B = rects[j]!;
        if (A.e.contains(B.e) || B.e.contains(A.e) || layer(A.e) !== layer(B.e)) continue;
        const w = Math.min(A.c.r, B.c.r) - Math.max(A.c.l, B.c.l);
        const h = Math.min(A.c.b, B.c.b) - Math.max(A.c.t, B.c.t);
        // Tres píxeles o menos: bordes que se tocan a propósito (pestañas, grupos de botones).
        if (w <= 3 || h <= 3 || w * h <= 12) continue;
        const ca = control(A.e);
        if (ca && ca === control(B.e)) continue;
        if (block(A.e) === block(B.e)) continue;
        const name = (e: Element) => `${desc(e)} «${(e as HTMLElement).innerText?.trim().slice(0, 25) ?? ''}»`;
        overlaps.push(`${name(A.e)} ⟷ ${name(B.e)} (${Math.round(w * h)} px²)`);
      }
    // Controles recortados por su contenedor (sin contar listas ni carruseles con scroll, donde el
    // recorte es a propósito).
    const clipped: string[] = [];
    for (const el of root.querySelectorAll('button, [role="button"], [role="tab"], kbd')) {
      if (ignored(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
        const c = e.getBoundingClientRect();
        const out = Math.max(c.left - r.left, r.right - c.right, c.top - r.top, r.bottom - c.bottom);
        if (out > 1.5) clipped.push(`${desc(el)} «${(el as HTMLElement).innerText?.trim().slice(0, 25)}» ${out.toFixed(1)} px fuera de ${desc(e)}`);
        break;
      }
    }
    return { small, overlaps, cuts, clipped };
  }, minFontPx);
}
