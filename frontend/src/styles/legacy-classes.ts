/**
 * Clases globales de los estilos antiguos (anteriores a Arcade DS) que ya no deben salir en el HTML pintado. Completa a
 * `global-classes.test.ts`, que solo ve los literales de `className`: esta mira el marcado, así que también caza una clase
 * que llega por variable o la devuelve una función.
 */
export const LEGACY = /class="[^"]*\b(btn-[\w-]+|icon-button|card|chip|label|field|panel|reveal-pop|timer-pulse|text-(electric|leaf|berry|aqua|ink)|bg-berry|empty-state|status-error|skeleton|page-shell|type-badge|sketchmon-canvas)\b/;
