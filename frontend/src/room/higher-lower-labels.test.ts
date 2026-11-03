import { describe, expect, it } from 'vitest';
import { higherLowerChoiceLabels } from './higher-lower-labels';

describe('higherLowerChoiceLabels', () => {
  it('traduce las tres respuestas al español', () => {
    expect(higherLowerChoiceLabels).toEqual({ HIGHER: 'Mayor', SAME: 'Igual', LOWER: 'Menor' });
  });
});
