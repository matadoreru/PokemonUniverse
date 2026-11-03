/**
 * Texto del último aviso de Learnset Guess. `solved` es verdadero para quien ya no tiene que adivinar (ha acertado,
 * observa o no participa): solo el jugador que falta recibe el «Solo faltas tú».
 */
export function learnsetLastWarningText(lastWarning: boolean, solved: boolean): string | null {
  if (!lastWarning) return null;
  return solved ? 'Último aviso: la ronda se cierra en 10 segundos.' : '¡Último aviso! Solo faltas tú: 10 segundos.';
}
