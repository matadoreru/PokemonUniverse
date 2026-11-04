import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Chip, cx, Pill, Row, type RowProps } from '../ui';
import { adminStatusLabel, adminStatusTone, pageBounds, paginationText } from './admin-format';
import tone from '../styles/tones.module.css';

/** Chip de estado o de rol con su texto (el color nunca va solo). */
export function StatusChip({ value, scope }: { value: string; scope?: 'game' }) {
  return <Chip tone={adminStatusTone(value)}>{adminStatusLabel(value, scope)}</Chip>;
}

/**
 * Datos de la segunda línea de una franja, cada uno con su propio texto: si no caben en una línea (móvil), bajan a la
 * siguiente en vez de pisar el chip de estado.
 */
export function MetaParts({ parts }: { parts: string[] }) {
  return <span className="flex min-w-0 flex-wrap gap-x-2">{parts.map((part, index) => <span key={index} className="min-w-0 [overflow-wrap:anywhere]">{part}</span>)}</span>;
}

/** Par etiqueta y valor de una ficha de detalle (dentro de un `<dl>`). */
export function Detail({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('min-w-0', wide && 'sm:col-span-2')}>
      <dt className={cx('text-13 font-extrabold uppercase tracking-[.06em]', tone.textInk2)}>{label}</dt>
      <dd className="mt-1 break-words text-15 font-bold">{children}</dd>
    </div>
  );
}

/** Rejilla de la ficha de detalle. */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>;
}

/**
 * Paginación accesible: un `nav` con nombre, píldoras redondas de 44 px con etiqueta («Página anterior» y «Página
 * siguiente») y el texto de la página actual como región viva.
 */
export function Pagination({ label, page, totalPages, total, onPage }: { label: string; page: number; totalPages: number; total: number; onPage(page: number): void }) {
  const { prev, next } = pageBounds(page, totalPages);
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <p className={cx('text-13 font-extrabold', tone.textInk2)} aria-live="polite">{paginationText(page, totalPages, total)}</p>
      <div className="flex gap-2">
        <Pill size="round" variant="cream" icon={ChevronLeft} aria-label="Página anterior" disabled={!prev} onClick={() => onPage(page - 1)} />
        <Pill size="round" variant="cream" icon={ChevronRight} aria-label="Página siguiente" disabled={!next} onClick={() => onPage(page + 1)} />
      </div>
    </nav>
  );
}

/**
 * Franja de una lista con detalle: la franja (la abierta en amarillo) y una píldora redonda que abre su ficha. La píldora
 * lleva `aria-current` en la abierta y un id estable para devolverle el foco al volver de la ficha en el móvil.
 */
export function SelectRow({ id, current, openLabel, onOpen, ...row }: RowProps & { id: string; current: boolean; openLabel: string; onOpen(): void }) {
  return (
    <Row {...row} self={current}>
      {row.children}
      <Pill id={id} size="round" variant="cream" icon={ChevronRight} aria-label={openLabel} aria-current={current ? 'true' : undefined} className="shrink-0" onClick={onOpen} />
    </Row>
  );
}

/** Id del control de una franja (para devolverle el foco). */
export const rowControlId = (scope: string, id: string) => `admin-${scope}-${id}`;

/**
 * Lista y ficha (spec §2): en escritorio, dos columnas con su propio scroll; en el móvil, la lista y, al abrir una
 * franja, solo la ficha con «Volver». «Volver» es estado de la pantalla (no añade entradas al historial).
 */
export function ListDetail({ list, detail, detailOpen, onBack, className }: { list: ReactNode; detail: ReactNode; detailOpen: boolean; onBack(): void; className?: string }) {
  return (
    <div className={cx('grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(26rem,34rem)_minmax(0,1fr)] 2xl:gap-6', className)}>
      <div className={cx('flex min-w-0 flex-col gap-3 lg:min-h-0', detailOpen && 'max-lg:hidden')}>{list}</div>
      <div className={cx('flex min-w-0 flex-col gap-3 lg:min-h-0', !detailOpen && 'max-lg:hidden')}>
        <Pill variant="cream" icon={ArrowLeft} className="self-start lg:hidden" onClick={onBack}>Volver</Pill>
        {detail}
      </div>
    </div>
  );
}

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

/**
 * Estado de lista y ficha: la franja elegida, si la ficha está abierta en el móvil y el foco. Al abrir en el móvil el foco
 * va al título de la ficha; al volver, a la píldora de la franja que se abrió.
 */
export function useListDetail(scope: string) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<string | null>(null);

  useEffect(() => {
    if (detailOpen && isMobile()) titleRef.current?.focus();
    if (!detailOpen && returnTo.current) {
      document.getElementById(returnTo.current)?.focus();
      returnTo.current = null;
    }
  }, [detailOpen]);

  const open = useCallback((id: string) => { setSelectedId(id); setDetailOpen(true); }, []);
  const back = useCallback(() => {
    if (selectedId) returnTo.current = rowControlId(scope, selectedId);
    setDetailOpen(false);
  }, [scope, selectedId]);
  const reset = useCallback(() => { setSelectedId(null); setDetailOpen(false); }, []);
  return { selectedId, setSelectedId, detailOpen, open, back, reset, titleRef };
}
