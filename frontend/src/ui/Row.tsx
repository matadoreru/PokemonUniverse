import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { uiSound } from '../audio/uiSound';
import { cx } from './cx';
import { Icon } from './Icon';
import s from './Row.module.css';

export interface RowProps {
  rank?: number;
  avatar?: ReactNode;
  name: string;
  meta?: ReactNode;
  value?: ReactNode;
  /** Color del jugador (viene de los datos del avatar en tiempo de ejecución). */
  color?: string;
  self?: boolean;
  /**
   * Destacada (azul cielo, distinta del amarillo de la propia): una entrada recién llegada, p. ej. la pista nueva. El
   * color nunca va solo: quien la usa pone además un texto («Nueva»).
   */
  highlight?: boolean;
  disconnected?: boolean;
  /**
   * En una línea desde 1024 px: la meta va a la derecha del nombre en vez de debajo (listas que tienen que caber sin
   * desplazar, como el recuento de votos). El nombre se recorta con `title`; en móvil, como siempre.
   */
  inline?: boolean;
  children?: ReactNode;
}

/** Franja de lista (jugador, marcador): banda de color a la izquierda; el color nunca va solo. */
export function Row({ rank, avatar, name, meta, value, color, self, highlight, disconnected, inline, children }: RowProps) {
  const style = color ? ({ '--player': color } as CSSProperties) : undefined;
  return (
    <div className={cx(s.row, inline && s.inline, self && s.self, highlight && !self && s.highlight, disconnected && s.off)} style={style} {...(highlight ? { 'data-highlight': 'true' } : {})}>
      {color && <span className={s.band} aria-hidden="true" />}
      {rank != null && <span className={s.rank}>{rank}</span>}
      {avatar && <span className={s.avatar}>{avatar}</span>}
      <span className={s.text}>
        <span className={s.name} title={name}>
          {name}
        </span>
        {(meta || disconnected) && (
          <span className={s.meta}>
            {disconnected && <span className={s.offLabel}>Sin conexión</span>}
            {meta}
          </span>
        )}
      </span>
      {value != null && <span className={s.value}>{value}</span>}
      {children}
    </div>
  );
}

export interface RowLinkProps extends RowProps {
  /** Ruta de la aplicación (enlace de React Router). */
  to: string;
  /** Es la franja abierta ahora: amarilla y con `aria-current`. */
  current?: boolean;
}

/** Franja que navega (lista de una página con detalle): toda la franja es el enlace; la abierta va en amarillo. */
export function RowLink({ to, current, self, ...row }: RowLinkProps) {
  return (
    <Link to={to} className={s.link} aria-current={current ? 'true' : undefined} onClick={() => uiSound('tap')}>
      <Row {...row} self={Boolean(current || self)} />
    </Link>
  );
}

export interface RowButtonProps extends RowProps {
  /** Nombre accesible del botón: dice qué abre y lo que la franja muestra (el contenido no se lee por separado). */
  label: string;
  onClick(): void;
  /** Indicación a la derecha de lo que hace al pulsarla (p. ej. ojo y «Ver»); decorativa, la acción va en `label`. */
  cue?: { icon: LucideIcon; text: string } | undefined;
}

/**
 * Franja que abre algo en la misma pantalla (el tablero de un rival): toda la franja es el botón y suena «tap» como
 * `RowLink`. Sube 1 px al pasar y baja al pulsar; el fondo es el de la franja (no tapa la propia ni la destacada).
 */
export function RowButton({ label, onClick, cue, children, ...row }: RowButtonProps) {
  return (
    <button type="button" className={s.button} aria-label={label} onClick={() => { uiSound('tap'); onClick(); }}>
      <Row {...row}>
        {children}
        {cue && (
          <span className={s.cue} aria-hidden="true">
            <Icon icon={cue.icon} size={18} />
            {cue.text}
          </span>
        )}
      </Row>
    </button>
  );
}
