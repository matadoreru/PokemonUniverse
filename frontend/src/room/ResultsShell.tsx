import { Trophy } from 'lucide-react';
import type { ReactNode } from 'react';

export function ResultsShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="mx-auto max-w-2xl px-3 py-8 sm:px-5"><div className="card"><div className="mb-7 text-center"><Trophy className="mx-auto text-berry" size={48} /><span className="label mt-3">{subtitle}</span><h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1></div>{children}</div></section>;
}
