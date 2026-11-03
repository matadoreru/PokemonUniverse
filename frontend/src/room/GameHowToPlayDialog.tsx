import { useEffect } from 'react';
import { HowToPlayCarousel } from '../components/HowToPlayCarousel';
import { gameHowToPlay } from '../games/how-to-play';
import { Dialog } from '../ui';

interface Props {
  gameId: string;
  gameName: string;
  open: boolean;
  onClose(): void;
}

/**
 * «Cómo se juega» de un minijuego en el `Dialog` del sistema: el navegador atrapa el foco, Esc, el fondo y «Cerrar» lo cierran
 * y, al cerrarse (o desmontarse abierto), el foco vuelve al botón que lo abrió. El foco inicial va a «Siguiente». Bloquea
 * el scroll de la página.
 */
export function GameHowToPlayDialog({ gameId, gameName, open, onClose }: Props) {
  const slides = gameHowToPlay[gameId];

  useEffect(() => {
    if (!open) return;
    // La página de fondo no se desplaza mientras el diálogo está abierto.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!slides) return null;
  return <Dialog open={open} title={gameName} onClose={onClose} width={672} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
    <HowToPlayCarousel slides={slides} heading={gameName} idPrefix={`how-to-play-${gameId}`} itemLabel="paso" loop={false} inDialog lastAction={<button type="button" className="btn-primary" onClick={onClose}>Entendido</button>} />
  </Dialog>;
}
