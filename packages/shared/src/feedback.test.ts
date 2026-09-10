import { describe, expect, it } from 'vitest';
import { createFeedbackSchema, updateFeedbackStatusSchema } from './feedback.js';

describe('feedback contracts', () => {
  it('normalizes valid player feedback', () => {
    expect(createFeedbackSchema.parse({ gameId: ' shiny-vote ', roomCode: 'abc234', type: 'BUG', description: ' El cursor aparece desplazado. ' })).toEqual({
      reference: 'MINIGAME', gameId: 'shiny-vote', roomCode: 'ABC234', type: 'BUG', description: 'El cursor aparece desplazado.',
    });
    expect(createFeedbackSchema.parse({ type: 'SUGGESTION', description: 'Me gustaría mejorar la navegación.' })).toEqual({
      reference: 'GENERAL', type: 'SUGGESTION', description: 'Me gustaría mejorar la navegación.',
    });
  });

  it('rejects short descriptions, unknown fields and invalid status changes', () => {
    expect(() => createFeedbackSchema.parse({ gameId: 'shiny-vote', type: 'BUG', description: 'Falla' })).toThrow(/10 caracteres/);
    expect(() => createFeedbackSchema.parse({ reference: 'MINIGAME', type: 'BUG', description: 'No carga la partida completa.' })).toThrow(/Selecciona un minijuego/);
    expect(() => createFeedbackSchema.parse({ reference: 'GENERAL', gameId: 'shiny-vote', type: 'BUG', description: 'No carga la partida completa.' })).toThrow(/solo se incluye/);
    expect(() => createFeedbackSchema.parse({ gameId: 'shiny-vote', type: 'BUG', description: 'Descripción suficientemente larga', extra: true })).toThrow();
    expect(() => updateFeedbackStatusSchema.parse({ status: 'CLOSED' })).toThrow();
  });
});
