import { describe, expect, it } from 'vitest';
import { createFeedbackSchema, updateFeedbackStatusSchema } from './feedback.js';

describe('feedback contracts', () => {
  it('normalizes valid player feedback', () => {
    expect(createFeedbackSchema.parse({ gameId: ' shiny-vote ', roomCode: 'abc234', type: 'BUG', description: ' El cursor aparece desplazado. ' })).toEqual({
      gameId: 'shiny-vote', roomCode: 'ABC234', type: 'BUG', description: 'El cursor aparece desplazado.',
    });
  });

  it('rejects short descriptions, unknown fields and invalid status changes', () => {
    expect(() => createFeedbackSchema.parse({ gameId: 'shiny-vote', type: 'BUG', description: 'Falla' })).toThrow(/10 caracteres/);
    expect(() => createFeedbackSchema.parse({ gameId: 'shiny-vote', type: 'BUG', description: 'Descripción suficientemente larga', extra: true })).toThrow();
    expect(() => updateFeedbackStatusSchema.parse({ status: 'CLOSED' })).toThrow();
  });
});
