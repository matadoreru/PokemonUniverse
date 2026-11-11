/**
 * Solo tests: patrón del HTML estático de un `Segmented` con `showLabel`, cuya etiqueta visible nombra al grupo
 * (`aria-labelledby`).
 */
export function labelledRadiogroup(label: string): RegExp {
  const text = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<span id="([^"]+)"[^>]*>${text}</span><div[^>]*role="radiogroup" aria-labelledby="\\1"`);
}
