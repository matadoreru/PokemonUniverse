/**
 * Aplica los ajustes de pantalla a `<html>` al cargar el módulo, antes de que React pinte nada (`main.tsx` lo importa
 * primero): así no hay ni un fotograma con animación o con la letra de otro tamaño. Sigue cada cambio después.
 */
import { installMotion } from '../lib/motion';
import { applyTextSize, display } from './display';

if (typeof document !== 'undefined') {
  const root = document.documentElement;
  const disposeMotion = installMotion(root);
  const applyText = () => applyTextSize(root, display.get().text);
  applyText();
  const disposeText = display.subscribe(applyText);
  import.meta.hot?.dispose(() => { disposeMotion(); disposeText(); });
}
