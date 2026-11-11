import { describe, expect, it } from 'vitest';
import { connectionsGroupAction } from './presentation';

describe('connectionsGroupAction', () => {
  it('envía el grupo elegido cuando está completo y se puede elegir', () => {
    expect(connectionsGroupAction(true, ['1', '4', '7', '25'], 4)).toEqual({ type: 'SUBMIT_GROUP', pokemonIds: ['1', '4', '7', '25'] });
  });
  it('no envía nada con el grupo a medias, de más o sin poder elegir (otro envío en curso o fuera de la ronda)', () => {
    expect(connectionsGroupAction(true, ['1', '4', '7'], 4)).toBeNull();
    expect(connectionsGroupAction(true, ['1', '4', '7', '25', '39'], 4)).toBeNull();
    expect(connectionsGroupAction(false, ['1', '4', '7', '25'], 4)).toBeNull();
  });
});
