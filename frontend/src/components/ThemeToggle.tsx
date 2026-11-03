import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('pokemon-universe-theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('pokemon-universe-theme', theme);
  }, [theme]);
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className="icon-button" onClick={() => setTheme(nextTheme)} aria-label={`Activar modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`} title={`Modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`}>
    {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
  </button>;
}
