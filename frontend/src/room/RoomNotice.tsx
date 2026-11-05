import { useMemo, useState } from 'react';
import { ToastStack, type ToastData } from '../ui';
import { useRoom } from './RoomContext';

/**
 * El aviso global de la sala como pila del catálogo (un único aviso de error, que no se cierra solo). Cada error nuevo
 * lleva un id nuevo, aunque repita el texto: así se vuelve a anunciar y la pila sube por encima de un diálogo abierto.
 */
function useRoomErrorToasts(error: string | null): ToastData[] {
  const [shown, setShown] = useState<{ error: string | null; id: number }>({ error: null, id: 0 });
  // Estado derivado del error (patrón de React para ajustar estado al cambiar una prop): nuevo error, nuevo id.
  if (shown.error !== error) setShown({ error, id: shown.id + 1 });
  return useMemo(() => (shown.error ? [{ id: shown.id, kind: 'error' as const, text: shown.error }] : []), [shown]);
}

/**
 * Único dueño de los errores de la sala (`useRoom().error`) en toda la aplicación: lo monta `Layout`, junto a las
 * invitaciones, porque «Unirse» desde Inicio o Perfil también puede fallar. Solo con aviso: montada siempre, su región
 * `status` de 1 px (absoluta, al final del documento) añadía scroll de página. Un `alert` se anuncia al insertarse.
 */
export function RoomNotice() {
  const { error, clearError } = useRoom();
  const toasts = useRoomErrorToasts(error);
  return toasts.length > 0 ? <ToastStack toasts={toasts} onClose={clearError} /> : null;
}
