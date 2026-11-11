import type { ReactNode } from 'react';
import { Dialog } from '../ui';
import s from './HelpDialog.module.css';

/** Una sección del diálogo de ayuda: título (`h3`) y contenido. */
export interface HelpSection {
  id: string;
  title: string;
  content: ReactNode;
}

/**
 * Diálogo de ayuda de la partida: una o varias secciones con título (hoy «Cómo se juega»; otra sección, como los atajos
 * de teclado, se añade pasando otra entrada en `sections`). Se cierra con «Entendido», Esc o el fondo.
 */
export function HelpDialog({ open, title, sections, onClose }: { open: boolean; title: string; sections: readonly HelpSection[]; onClose(): void }) {
  return <Dialog open={open} title={title} onClose={onClose} width={480}
    actions={[{ label: 'Entendido', variant: 'yellow', autoFocus: true, onClick: () => undefined }]}>
    <div className={s.sections}>
      {sections.map((section) => <section key={section.id} aria-labelledby={`help-${section.id}`} className={s.section}>
        <h3 id={`help-${section.id}`} className={s.sectionTitle}>{section.title}</h3>
        {section.content}
      </section>)}
    </div>
  </Dialog>;
}

/** Las reglas de un juego (`howTo` del manifiesto) como lista numerada: la sección «Reglas» del diálogo de ayuda. */
export function HelpRules({ rules }: { rules: readonly string[] }) {
  return <ol className={s.rules}>
    {rules.map((rule, index) => <li key={index} className={s.rule}>
      <span className={s.number} aria-hidden="true">{index + 1}</span>
      <span>{rule}</span>
    </li>)}
  </ol>;
}
