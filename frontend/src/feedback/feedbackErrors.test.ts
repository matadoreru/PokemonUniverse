import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_SPANISH_MESSAGES, feedbackErrorMessage } from './feedbackErrors';

const JAVA = fileURLToPath(new URL('../../../backend/src/main/java/es/pokemonuniverse/', import.meta.url));

describe('feedbackErrorMessage', () => {
  it('passes the backend Spanish validation messages through', () => {
    expect(feedbackErrorMessage(new Error('Describe el feedback con al menos 10 caracteres.'))).toBe('Describe el feedback con al menos 10 caracteres.');
    expect(feedbackErrorMessage('El minijuego seleccionado no existe.')).toBe('El minijuego seleccionado no existe.');
  });

  it('translates English and network errors', () => {
    expect(feedbackErrorMessage(new Error('Authentication required'))).toMatch(/sesión/);
    expect(feedbackErrorMessage(new Error('Too many requests'))).toMatch(/Espera/);
    expect(feedbackErrorMessage(new Error('Failed to fetch'))).toMatch(/conexión/);
  });

  it('never shows an unknown server text', () => {
    for (const raw of ['Internal Server Error', 'Bad Gateway', 'Request failed', '', undefined]) {
      const message = feedbackErrorMessage(raw === undefined ? raw : new Error(raw));
      expect(message).toBe('No se pudo enviar. Inténtalo de nuevo en unos segundos.');
    }
  });

  it('keeps its Spanish list in step with the Java backend', () => {
    const sources = ['adapters/in/rest/feedback/CreateFeedbackRequest.java', 'application/feedback/FeedbackService.java'].map((file) => readFileSync(`${JAVA}${file}`, 'utf8')).join('\n');
    for (const message of FEEDBACK_SPANISH_MESSAGES) expect(sources, message).toContain(`"${message}"`);
  });
});
