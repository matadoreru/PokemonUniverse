import type { LucideIcon } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { Panel } from './Panel';
import s from './ActionPlate.module.css';

export type ActionPlateTone = 'ok' | 'bad' | 'info' | 'warn';

/** Atributos `data-*` de un elemento de la placa (ganchos de tests y E2E). */
type DataAttrs = Partial<Record<`data-${string}`, string | boolean | undefined>>;

export interface ActionPlateProps {
  /** `id` del `h2`, que da nombre a la sección. */
  titleId: string;
  /** Al título (`tabIndex -1`) va el foco al cambiar de fase (`useFocusOnTransition`). */
  titleRef?: Ref<HTMLHeadingElement> | undefined;
  icon: LucideIcon;
  tone: ActionPlateTone;
  kicker: ReactNode;
  title: string;
  /** Ayuda bajo el título. */
  text?: ReactNode;
  /** A la derecha de la fila: el aviso, los puntos o el presupuesto. */
  aside?: ReactNode;
  /**
   * Debajo de la fila, en su propia caja: el buscador, el campo de escribir o las opciones. Con `search`, en escritorio
   * el título va a la izquierda y esta caja a la derecha, y la bandeja de resultados del buscador lleva tope de alto.
   */
  body?: ReactNode;
  search?: boolean | undefined;
  /**
   * Placa compacta (Sketchmon): la ayuda del campo solo para lectores; en escritorio, una sola fila sin icono y la
   * bandeja del buscador abierta hacia arriba, sobre la escena.
   */
  compact?: boolean | undefined;
  /** Tras la caja de `body`, sin envolver (un formulario propio, un diálogo). */
  children?: ReactNode;
  className?: string | undefined;
  /** Clases de quien la usa, en cada pieza (van después de las de la placa). */
  plateClassName?: string | undefined;
  iconClassName?: string | undefined;
  textClassName?: string | undefined;
  helpClassName?: string | undefined;
  asideClassName?: string | undefined;
  bodyClassName?: string | undefined;
  rowAttrs?: DataAttrs | undefined;
  asideAttrs?: DataAttrs | undefined;
}

/**
 * Pantalla inferior de los juegos (spec §2: abajo, la acción): placa crema con el estado en texto (icono del tono,
 * kicker, título y ayuda), lo que toca a la derecha y, debajo, lo que se usa para actuar. Sin región viva propia: lo
 * que hay que anunciar lo dice la de la pantalla.
 */
export function ActionPlate({
  titleId, titleRef, icon, tone, kicker, title, text, aside, body, search = false, compact = false, children,
  className, plateClassName, iconClassName, textClassName, helpClassName, asideClassName, bodyClassName, rowAttrs, asideAttrs,
}: ActionPlateProps) {
  return (
    <Panel variant="cream" as="section" className={cx(compact && s.compact, className)} bodyClassName={cx(s.plate, search && s.plateSearch, plateClassName)} aria-labelledby={titleId}>
      <div className={s.row} {...rowAttrs}>
        <span className={cx(s.icon, s[`tone_${tone}`], iconClassName)}><Icon icon={icon} size={32} /></span>
        <div className={cx(s.text, textClassName)}>
          <span className={s.kicker}>{kicker}</span>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={s.title}>{title}</h2>
          {text && <p className={cx(s.help, helpClassName)}>{text}</p>}
        </div>
        {aside && <div className={cx(s.aside, asideClassName)} {...asideAttrs}>{aside}</div>}
      </div>
      {body != null && body !== false && <div className={cx(search && s.search, bodyClassName)}>{body}</div>}
      {children}
    </Panel>
  );
}
