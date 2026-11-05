import { useState } from 'react';
import { Icon } from '../ui';
import { gameIcon, gameSpriteUrl } from './game-icons';
import s from './GameArt.module.css';

/**
 * Imagen de un minijuego: el sprite a color del objeto de Pokémon que lo representa, pixelado y a escala entera para
 * que se vea nítido. Si no hay sprite (juego sin objeto o carga fallida) se ve su icono de línea. Es decorativa: el
 * nombre del juego va al lado.
 */
export function GameArt({ gameId, size = 32 }: { gameId: string; size?: 22 | 32 }) {
  const [failed, setFailed] = useState(false);
  const src = gameSpriteUrl(gameId);
  if (!src || failed) return <Icon icon={gameIcon(gameId)} size={size} />;
  return <img className={size === 22 ? s.small : s.large} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}
