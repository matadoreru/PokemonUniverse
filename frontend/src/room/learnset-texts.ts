/**
 * Texto del último aviso de Learnset Guess. `solved` es verdadero para quien ya no tiene que adivinar (ha acertado,
 * observa o no participa): solo el jugador que falta recibe el «Solo faltas tú». `remainingSeconds` son los segundos
 * reales hasta `roundEndsAt` (el mismo reloj que la cabecera); sin segundos que contar, el texto es neutro.
 */
export function learnsetLastWarningText(lastWarning: boolean, solved: boolean, remainingSeconds: number): string | null {
  if (!lastWarning) return null;
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 1) return '¡Último aviso! Se acaba pronto.';
  const seconds = Math.ceil(remainingSeconds);
  const unit = seconds === 1 ? 'segundo' : 'segundos';
  return solved ? `Último aviso: la ronda se cierra en ${seconds} ${unit}.` : `¡Último aviso! Solo faltas tú: ${seconds} ${unit}.`;
}
