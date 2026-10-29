import { describe, expect, it } from 'vitest';
import { escolhaDaUrl, urlDaFase } from '../../../src/game/dev/fases';

describe('aba Testar do modo dev: a URL de cada fase', () => {
  it('monta os parâmetros que a sessão já entende', () => {
    expect(urlDaFase('rua2', 1, 'fantasma', '', false)).toBe('?posicao=2-2&campeao=fantasma');
    expect(urlDaFase('porta', 0, 'bruxinha', '', false)).toBe(
      '?posicao=1-1&porta=1&campeao=bruxinha',
    );
    expect(urlDaFase('chefe', 2, 'bruxinha', '42', false)).toBe(
      '?bairro=3&chefe=1&campeao=bruxinha&semente=42',
    );
    expect(urlDaFase('moradora', 0, 'bruxinha', 'x', true)).toBe(
      '?moradora=1&campeao=bruxinha&dev=1',
    );
    expect(urlDaFase('treino', 0, 'bruxinha', '', false)).toBe('?modo=treino&campeao=bruxinha');
  });

  it.each(['rua1', 'rua3', 'porta', 'chefe', 'moradora', 'treino'])(
    '%s: o painel reabre na mesma fase depois de recarregar',
    (fase) => {
      const e = escolhaDaUrl(urlDaFase(fase, 2, 'vampirinho', '7', false));
      expect(e.fase).toBe(fase);
      expect(e.campeao).toBe('vampirinho');
      expect(e.semente).toBe('7');
      if (fase !== 'moradora' && fase !== 'treino') expect(e.bairro).toBe(2);
    },
  );

  it('sem parâmetros: bairro 1, rua 1, Bruxinha', () => {
    expect(escolhaDaUrl('')).toEqual({ fase: 'rua1', bairro: 0, campeao: 'bruxinha', semente: '' });
  });
});
