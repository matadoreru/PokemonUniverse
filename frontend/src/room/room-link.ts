import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOM_CODE_LENGTH } from './roomCode';

/** Parámetro de `/play` con el código de la sala a la que entrar (`/play?sala=PIKA42`). */
export const ROOM_LINK_PARAM = 'sala';

const ROOM_CODE = new RegExp(`^[A-Z2-9]{${ROOM_CODE_LENGTH}}$`);

/**
 * El código de un enlace `?sala=`, o `null` si no lo es. Más estricto que `normalizeRoomCode` (que adivina el código
 * en un texto pegado): solo quita espacios y pasa a mayúsculas; lo demás (otra longitud, 0, 1, guiones) se ignora.
 */
export function parseRoomLinkCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.replace(/\s+/g, '').toUpperCase();
  return ROOM_CODE.test(code) ? code : null;
}

/** Enlace para entrar en la sala: `/play?sala=CÓDIGO` en el mismo origen. */
export function roomJoinUrl(code: string, origin: string): string {
  return `${origin}/play?${ROOM_LINK_PARAM}=${encodeURIComponent(code)}`;
}

/** Lo que el botón de compartir necesita del navegador (en las pruebas, un doble). */
export interface ShareEnvironment {
  /** Pantalla táctil (`pointer: coarse`): ahí se abre el menú de compartir del sistema si existe. */
  touch: boolean;
  share?: ((data: { title?: string; text?: string; url?: string }) => Promise<void>) | undefined;
  writeText(text: string): Promise<void>;
}

/** `copied`: copiado al portapapeles; `shared`: enviado desde el menú del sistema; `cancelled`: cerró el menú. */
export type ShareOutcome = 'copied' | 'shared' | 'cancelled' | 'failed';

/**
 * Comparte el enlace de la sala: en táctil con `navigator.share`, el menú del sistema (cerrarlo no copia nada); si no,
 * o si el menú falla por otro motivo, lo copia al portapapeles.
 */
export async function shareRoomLink(code: string, origin: string, env: ShareEnvironment): Promise<ShareOutcome> {
  const url = roomJoinUrl(code, origin);
  if (env.touch && env.share) {
    try {
      await env.share({ title: 'Pokémon Universe', text: `Únete a mi sala de Pokémon Universe: ${code}`, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await env.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function browserShareEnvironment(): ShareEnvironment {
  const nav = window.navigator;
  return {
    touch: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    share: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
    writeText: (text) => nav.clipboard.writeText(text),
  };
}

/**
 * Botón de copiar o compartir el enlace de la sala: `copied` vale `true` 1,8 s tras copiarlo (para el aviso «Código
 * copiado» y el icono de hecho). Lo usan la placa de la sala y la sala vacía del lobby.
 */
export function useRoomLinkShare(code: string): { copied: boolean; share(): void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const share = useCallback(() => {
    void shareRoomLink(code, window.location.origin, browserShareEnvironment()).then((outcome) => {
      if (outcome !== 'copied') return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1_800);
    });
  }, [code]);
  return { copied, share };
}
