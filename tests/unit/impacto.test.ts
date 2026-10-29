import { describe, expect, it } from 'vitest';
import { intensidadeEmPixels, PausaDeImpacto, respostaDeImpacto } from '../../src/game/rua/impacto';
import { visual } from '../../src/sim/content';
import type { Evento } from '../../src/sim/eventos';
import { PassoFixo } from '../../src/sim/passoFixo';

const cfg = visual.combateNaTela;
const dano: Extract<Evento, { tipo: 'dano' }> = {
  tipo: 'dano',
  origem: 1,
  alvo: 2,
  valor: 20,
  absorvido: 0,
  critico: false,
  golpe: 'habilidade',
  comAviso: false,
  pos: { x: 0, y: 0 },
};

describe('impacto só na tela', () => {
  it('uma área para por 50 ms, sem multiplicar a pausa pelo número de alvos', () => {
    expect(respostaDeImpacto([dano, { ...dano, alvo: 3 }], 1, cfg).pausaS).toBe(0.05);
    expect(
      respostaDeImpacto([{ ...dano, critico: true, golpe: 'autoAtaque' }], 1, cfg).pausaS,
    ).toBe(0.08);
  });

  it('auto-ataque comum, imunidade e dano recebido não param a tela', () => {
    expect(
      respostaDeImpacto(
        [
          { ...dano, golpe: 'autoAtaque' },
          { ...dano, valor: 0 },
          { ...dano, origem: 2, alvo: 1 },
        ],
        1,
        cfg,
      ).pausaS,
    ).toBe(0);
  });

  it('queda do Poste tem precedência sobre explosões no mesmo quadro', () => {
    expect(
      respostaDeImpacto(
        [
          { tipo: 'explosaoAbobora', centro: dano.pos, raio: 2 },
          { tipo: 'posteCaiu', id: 2, indice: 0, pos: dano.pos },
        ],
        1,
        cfg,
      ),
    ).toEqual({ pausaS: 0.08, tremorPx: 6, posteCaiu: true });
    expect(
      respostaDeImpacto(
        [
          {
            tipo: 'pulso',
            tecla: 'R',
            lado: 'jogador',
            centro: dano.pos,
            raio: 3,
            dono: 1,
            final: false,
          },
        ],
        1,
        cfg,
      ).tremorPx,
    ).toBe(cfg.tremor.rPx);
  });

  it('o estouro da Vassoura e o último golpe que acerta dão um soco curto na tela', () => {
    const estouro = respostaDeImpacto(
      [{ tipo: 'estouro', dono: 1, chave: 'Q', lado: 'jogador', centro: dano.pos, raio: 1.2 }],
      1,
      cfg,
    );
    expect(estouro).toEqual({
      pausaS: cfg.pausa.estouro,
      tremorPx: cfg.tremor.estouroPx,
      posteCaiu: false,
    });
    const golpe = (final: boolean, acertos: number) =>
      respostaDeImpacto([{ tipo: 'golpeou', id: 1, combo: 2, final, x: 1, y: 0, acertos }], 1, cfg)
        .pausaS;
    expect(golpe(true, 2)).toBe(cfg.pausa.golpeFinal);
    expect(golpe(true, 0)).toBe(0);
    expect(golpe(false, 2)).toBe(0);
  });

  it('descarta o tempo parado, preserva o restante do quadro e não acumula ticks depois', () => {
    const pausa = new PausaDeImpacto();
    const passo = new PassoFixo(60, 10);
    pausa.iniciar(0.08);
    pausa.iniciar(0.05);
    expect(passo.avancar(pausa.tempoJogavel(50))).toBe(0);
    expect(passo.avancar(pausa.tempoJogavel(30))).toBe(0);
    expect(passo.avancar(pausa.tempoJogavel(1000 / 60))).toBe(1);
    pausa.iniciar(0.05);
    expect(pausa.tempoJogavel(70)).toBeCloseTo(20);
  });

  it.each([0.8, 1, 1.2])('mantém 3 pixels de tremor nos dois eixos com zoom %s', (zoom) => {
    const i = intensidadeEmPixels(3, 1280, 720, zoom);
    // Amplitude de Shake.update, transformada pela matriz escalada de Camera.preRender.
    expect(i.x * 1280 * zoom * zoom).toBeCloseTo(3);
    expect(i.y * 720 * zoom * zoom).toBeCloseTo(3);
  });
});
