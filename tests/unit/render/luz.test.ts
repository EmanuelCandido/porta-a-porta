import { describe, expect, it } from 'vitest';
import { criarIso, paraTela } from '../../../src/render/iso';
import {
  alturaDaLuz,
  distanciaNaTela,
  IndiceDeLuzes,
  luminosidade,
  luzesNoMundo,
  pegadaIluminada,
  pocaDaLuz,
  poligonoDeLuz,
  quedaDaLuz,
  tintNaLuz,
} from '../../../src/render/luz';
import { luz as luzDoJogo, modelos, visual } from '../../../src/sim/content';
import { luzesDasJanelas } from '../../../src/sim/gerador';

// A geometria do feixe das janelas é testada ligada; no jogo ele está desligado
// (luz.json → janela.iluminaChao) e só a vidraça brilha.
const luz = { ...luzDoJogo, janela: { ...luzDoJogo.janela, iluminaChao: true } };

describe('luz na tela', () => {
  it('a janela joga um feixe da parede para fora, só para o lado que ela olha', () => {
    const [l] = luzesNoMundo(
      [{ tipo: 'janela', x: 5, y: 2, normal: { x: 1, y: 0 }, largura: 0.6, andar: 0 }],
      luz,
    );
    expect(l).toMatchObject({ x: 5, y: 2, feixe: { nx: 1, ny: 0, largura: 0.6, inicio: 0 } });
    const comp = luz.janela.comprimento;
    // Na frente da janela, ao longo do feixe: acende; atrás da parede e muito ao lado: não.
    expect(pegadaIluminada({ x0: 5.5, y0: 1.9, x1: 5.6, y1: 2.1 }, [l!])).toBe(true);
    expect(
      pegadaIluminada({ x0: 5 + comp - 0.2, y0: 1.95, x1: 5 + comp - 0.1, y1: 2.05 }, [l!]),
    ).toBe(true);
    expect(pegadaIluminada({ x0: 4, y0: 1.9, x1: 4.5, y1: 2.1 }, [l!])).toBe(false);
    expect(pegadaIluminada({ x0: 5.3, y0: 4, x1: 5.5, y1: 4.2 }, [l!])).toBe(false);
    expect(
      pegadaIluminada({ x0: 5 + comp + 0.3, y0: 1.9, x1: 5 + comp + 0.5, y1: 2.1 }, [l!]),
    ).toBe(false);
  });

  it('a janela de um andar de cima joga o feixe mais longe da parede', () => {
    const [terreo, cima] = luzesNoMundo(
      [
        { tipo: 'janela', x: 5, y: 2, normal: { x: 0, y: 1 }, largura: 0.5, andar: 0 },
        { tipo: 'janela', x: 5, y: 2, normal: { x: 0, y: 1 }, largura: 0.5, andar: 1 },
      ],
      luz,
    );
    const rente = { x0: 4.9, y0: 2.05, x1: 5.1, y1: 2.15 };
    expect(pegadaIluminada(rente, [terreo!])).toBe(true);
    expect(pegadaIluminada(rente, [cima!])).toBe(luz.janela.inicioPorAndar <= 0.1);
  });

  it('o Poste Corrompido não recorta a escuridão', () => {
    const [amigo, corrompido] = luzesNoMundo(
      [
        { tipo: 'poste', x: 0, y: 0 },
        { tipo: 'posteCorrompido', x: 0, y: 0 },
      ],
      luz,
    );
    expect(amigo!.recortaEscuridao).toBe(true);
    expect(corrompido!.recortaEscuridao).toBe(false);
  });

  it('ilumina a pegada que o círculo toca', () => {
    const luzes = luzesNoMundo([{ tipo: 'poste', x: 0, y: 0 }], luz);
    const r = luz.poste.raio;
    expect(pegadaIluminada({ x0: r - 0.1, y0: 0, x1: r + 1, y1: 1 }, luzes)).toBe(true);
    expect(pegadaIluminada({ x0: r + 0.1, y0: 0, x1: r + 1, y1: 1 }, luzes)).toBe(false);
  });

  it('o polígono de luz tem o número de lados pedido e o raio certo', () => {
    const pts = poligonoDeLuz(1, 2, 3, 20);
    expect(pts).toHaveLength(20);
    for (const p of pts) expect(Math.hypot(p.x - 1, p.y - 2)).toBeCloseTo(3, 9);
  });
});

describe('luz suave da tela', () => {
  const queda = visual.luzNaTela.queda;
  const iso = criarIso(visual.tile);

  it('a queda é cheia no centro, cai até a borda da regra e some depois dela', () => {
    expect(quedaDaLuz(0, queda)).toBe(1);
    expect(quedaDaLuz(queda.pleno, queda)).toBe(1);
    expect(quedaDaLuz(1, queda)).toBeCloseTo(queda.naBorda);
    expect(quedaDaLuz(1 + queda.alem, queda)).toBe(0);
    // Sempre caindo do centro para fora.
    let antes = 1;
    for (let d = 0; d <= 1 + queda.alem; d += 0.05) {
      const q = quedaDaLuz(d, queda);
      expect(q).toBeLessThanOrEqual(antes + 1e-9);
      antes = q;
    }
  });

  it('a poça é mais forte no pé da luz e some no fim do alcance', () => {
    expect(pocaDaLuz(0, queda)).toBe(1);
    expect(pocaDaLuz(0.5, queda)).toBeLessThan(pocaDaLuz(0.2, queda));
    expect(pocaDaLuz(1 + queda.alem, queda)).toBe(0);
  });

  it('a luminosidade de uma pegada é a da luz mais forte que chega nela', () => {
    const luzes = [
      { tipo: 'poste' as const, x: 0, y: 0, raio: 3, recortaEscuridao: true },
      { tipo: 'janela' as const, x: 10, y: 0, raio: 1.5, recortaEscuridao: true },
    ];
    expect(luminosidade({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, luzes, queda)).toBe(1);
    const meia = luminosidade({ x0: 3, y0: 0, x1: 3.2, y1: 0.2 }, luzes, queda);
    expect(meia).toBeCloseTo(queda.naBorda);
    expect(luminosidade({ x0: 6, y0: 6, x1: 6.5, y1: 6.5 }, luzes, queda)).toBe(0);
  });

  it('o tint vai do tom do escuro (sem luz) ao branco (luz cheia)', () => {
    const escuro = visual.luzNaTela.tintNoEscuro;
    expect(tintNaLuz(0, escuro)).toBe(Number.parseInt(escuro.slice(1), 16));
    expect(tintNaLuz(1, escuro)).toBe(0xffffff);
    const meio = tintNaLuz(0.5, '#000000');
    expect(meio >> 16).toBeGreaterThanOrEqual(127);
    expect(meio >> 16).toBeLessThanOrEqual(128);
  });

  it('a distância na tela desfaz a projeção: a borda da elipse fica a 1 raio', () => {
    // Um ponto do chão a 2 tiles em +x do centro, numa luz de raio 2.
    const p = paraTela({ x: 2, y: 0, z: 0 }, iso);
    expect(distanciaNaTela(p.x, p.y, 2, iso)).toBeCloseTo(1);
    expect(distanciaNaTela(0, 0, 2, iso)).toBe(0);
  });
});

describe('luz só com fonte à vista', () => {
  it('a janela de costas para a câmera não ilumina o chão', () => {
    const luzes = luzesNoMundo(
      [
        { tipo: 'janela', x: 5, y: 2, normal: { x: 1, y: 0 } },
        { tipo: 'janela', x: 5, y: 2, normal: { x: 0, y: 1 } },
        { tipo: 'janela', x: 5, y: 2, normal: { x: -1, y: 0 } },
        { tipo: 'janela', x: 5, y: 2, normal: { x: 0, y: -1 } },
      ],
      luz,
    );
    expect(luzes).toHaveLength(2);
  });

  it('nas casas giradas da simulação, só as janelas voltadas para a câmera viram luz', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const casa = { modelo: 'sobrado' as const, x: 0, y: 0, rot };
      const semFeixe = { ...luz, janela: { ...luz.janela, iluminaChao: false } };
      expect(luzesDasJanelas(casa, 0, modelos, semFeixe)).toEqual([]);
      const fontes = luzesDasJanelas(casa, 0, modelos, luz);
      expect(fontes.length).toBeGreaterThan(0);
      // Todo feixe sai de uma parede que a câmera vê (+x ou +y); as de costas ficam de fora.
      for (const f of fontes) expect(f.feixe!.nx + f.feixe!.ny).toBeGreaterThan(0);
    }
  });
});

describe('sombras das luzes', () => {
  it('o ponto entre dois postes recebe as duas luzes, a mais perto primeiro', () => {
    const luzes = luzesNoMundo(
      [
        { tipo: 'poste', x: 0, y: 0 },
        { tipo: 'poste', x: 4, y: 0 },
      ],
      luz,
    );
    const indice = new IndiceDeLuzes(luzes, visual.luzNaTela.queda, visual.luzNaTela.feixe);
    const chegam = indice.luzesNoPonto(1.5, 0, visual.luzNaTela.sombras.minimo);
    expect(chegam.map((c) => c.luz.x)).toEqual([0, 4]);
    expect(chegam[0]!.forca).toBeGreaterThanOrEqual(chegam[1]!.forca);
    // Longe de tudo, nenhuma luz (e nenhuma sombra).
    expect(indice.luzesNoPonto(20, 20, visual.luzNaTela.sombras.minimo)).toEqual([]);
  });

  it('a luz vem da lâmpada do poste e do andar da janela', () => {
    const a = { postePx: 67, janelaPx: 26, pulsoPx: 32, andarPx: 48 };
    const [poste, terreo, cima] = luzesNoMundo(
      [
        { tipo: 'poste', x: 0, y: 0 },
        { tipo: 'janela', x: 0, y: 0, normal: { x: 1, y: 0 }, largura: 0.5, andar: 0 },
        { tipo: 'janela', x: 0, y: 0, normal: { x: 1, y: 0 }, largura: 0.5, andar: 2 },
      ],
      luz,
    );
    expect(alturaDaLuz(poste!, a)).toBe(67);
    expect(alturaDaLuz(terreo!, a)).toBe(26);
    expect(alturaDaLuz(cima!, a)).toBe(122);
  });
});

describe('janelas sem feixe no chão (o jogo de hoje)', () => {
  it('a janela só brilha na vidraça: nenhuma luz no chão, na regra e na tela', () => {
    expect(luzDoJogo.janela.iluminaChao).toBe(false);
    expect(
      luzesNoMundo([{ tipo: 'janela', x: 0, y: 0, normal: { x: 1, y: 0 } }], luzDoJogo),
    ).toEqual([]);
    const casa = { modelo: 'sobrado' as const, x: 0, y: 0, rot: 0 as const };
    expect(luzesDasJanelas(casa, 0, modelos, luzDoJogo)).toEqual([]);
  });
});
