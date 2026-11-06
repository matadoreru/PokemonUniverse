import { describe, expect, it } from 'vitest';
import { opaqueBounds, viewBoxFor } from './sprite-trim';

function image(width: number, height: number, opaque: Array<[number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe('sprite-trim', () => {
  it('mide el rectángulo opaco', () => {
    const data = image(10, 10, [[2, 3], [6, 8]]);
    expect(opaqueBounds(data, 10, 10)).toEqual({ left: 2, top: 3, right: 7, bottom: 9 });
  });
  it('una imagen transparente no tiene rectángulo', () => {
    expect(opaqueBounds(image(4, 4, []), 4, 4)).toBeNull();
  });
  it('ignora el alfa casi invisible', () => {
    const data = image(4, 4, [[1, 1]]);
    data[3] = 8;
    expect(opaqueBounds(data, 4, 4)).toEqual({ left: 1, top: 1, right: 2, bottom: 2 });
  });
  it('recorta los márgenes y no toca una imagen que ya llena el cuadro', () => {
    expect(viewBoxFor({ left: 10, top: 4, right: 90, bottom: 96 }, 96, 96)).toBe('inset(4px 6px 0px 10px)');
    expect(viewBoxFor({ left: 0, top: 0, right: 96, bottom: 96 }, 96, 96)).toBeNull();
  });
});
