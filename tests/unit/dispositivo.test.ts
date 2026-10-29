import { describe, expect, it } from 'vitest';
import { mexeuNoAnalogico } from '../../src/game/dispositivo';

describe('controle: o analógico mexeu?', () => {
  it('parado na zona morta não liga o controle', () => {
    expect(mexeuNoAnalogico([0.05, -0.1, 0, 0.19], 0.2)).toBe(false);
  });

  it('um analógico fora da zona morta liga', () => {
    expect(mexeuNoAnalogico([0, 0, 0.6, 0], 0.2)).toBe(true);
    expect(mexeuNoAnalogico([-0.9, 0], 0.2)).toBe(true);
  });

  it('o direcional parado de um controle genérico (eixo 9 = 3,29) não conta', () => {
    // O "PS3/PC Gamepad" visto no Chrome: o mouse deixava de mirar com ele só ligado no PC.
    const ps3 = [-0.004, -0.004, -0.004, 0, 0, -0.004, 0, 0, 0, 3.286];
    expect(mexeuNoAnalogico(ps3, 0.2)).toBe(false);
  });

  it('fora de [-1, 1] não é analógico, nem nos primeiros eixos', () => {
    expect(mexeuNoAnalogico([3.286, 0, 0, 0], 0.2)).toBe(false);
  });
});
