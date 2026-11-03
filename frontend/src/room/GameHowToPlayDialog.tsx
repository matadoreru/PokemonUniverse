import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { HowToPlayCarousel } from '../components/HowToPlayCarousel';
import { gameHowToPlay } from '../games/how-to-play';

interface Props {
  gameId: string;
  gameName: string;
  open: boolean;
  onClose(): void;
}

/**
 * «Cómo se juega» de un minijuego en un `<dialog>` modal: el navegador atrapa el foco, Esc lo cierra
 * y, al cerrarse (o desmontarse abierto), el foco vuelve al botón que lo abrió.
 */
export function GameHowToPlayDialog({ gameId, gameName, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const slides = gameHowToPlay[gameId];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-carousel-next]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  if (!slides) return null;
  const idPrefix = `how-to-play-${gameId}`;
  return <dialog ref={dialogRef} className="modal-dialog" aria-labelledby={`${idPrefix}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    {open && <HowToPlayCarousel slides={slides} kicker="Cómo se juega" heading={gameName} idPrefix={idPrefix} itemLabel="paso" headerAction={<button type="button" className="icon-button -mr-2 shrink-0" onClick={onClose} aria-label="Cerrar"><X /></button>} />}
  </dialog>;
}
