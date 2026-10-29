import type { Forma } from '../sim/content/esquemas';
import type { V2 } from '../sim/geometria';
import { pontoNoAlcance } from '../sim/habilidades';
import { poligonoDeLuz } from './luz';

/** O que desenhar no chão enquanto a tecla está apertada, em tiles do mundo. */
export interface Indicador {
  /** Área cheia: a faixa da linha, o círculo da área ou o trajeto do dash. */
  area: V2[];
  /** Contorno do alcance máximo, em volta do lançador (só nas áreas). */
  alcance: V2[] | null;
  /** Onde a habilidade termina (ponta da linha, centro da área, pouso do dash). */
  ponta: V2;
}

/** Raio do círculo que marca o alvo escolhido ou o próprio lançador, em tiles. */
const RAIO_MARCA_ALVO = 0.6;
/** Meia largura da faixa que mostra o trajeto do dash, em tiles. */
const MEIA_LARGURA_DASH = 0.2;

function direcao(de: V2, para: V2): V2 {
  const v = { x: para.x - de.x, y: para.y - de.y };
  const n = Math.hypot(v.x, v.y);
  return n === 0 ? { x: 1, y: 0 } : { x: v.x / n, y: v.y / n };
}

/** Retângulo de `de` até `de + dir × comprimento`, com a meia largura dada. */
export function faixa(de: V2, dir: V2, comprimento: number, meiaLargura: number): V2[] {
  const n = { x: -dir.y * meiaLargura, y: dir.x * meiaLargura };
  const fim = { x: de.x + dir.x * comprimento, y: de.y + dir.y * comprimento };
  return [
    { x: de.x + n.x, y: de.y + n.y },
    { x: fim.x + n.x, y: fim.y + n.y },
    { x: fim.x - n.x, y: fim.y - n.y },
    { x: de.x - n.x, y: de.y - n.y },
  ];
}

/**
 * Indicador de mira de uma habilidade: linhas vão até o alcance máximo na direção do cursor, áreas
 * caem no cursor ou no ponto mais distante possível, e o dash mostra o trajeto inteiro.
 */
export function indicadorDeMira(forma: Forma, origem: V2, cursor: V2, lados: number): Indicador {
  const dir = direcao(origem, cursor);
  switch (forma.tipo) {
    case 'linha': {
      const ponta = { x: origem.x + dir.x * forma.alcance, y: origem.y + dir.y * forma.alcance };
      return { area: faixa(origem, dir, forma.alcance, forma.largura / 2), alcance: null, ponta };
    }
    case 'area': {
      const ponta = pontoNoAlcance(origem, cursor, forma.alcance);
      return {
        area: poligonoDeLuz(ponta.x, ponta.y, forma.raio, lados),
        alcance: poligonoDeLuz(origem.x, origem.y, forma.alcance, lados),
        ponta,
      };
    }
    case 'cone': {
      const meio = ((forma.angulo / 2) * Math.PI) / 180;
      const base = Math.atan2(dir.y, dir.x);
      const arco = Array.from({ length: lados + 1 }, (_, i) => {
        const t = base - meio + (2 * meio * i) / lados;
        return {
          x: origem.x + Math.cos(t) * forma.alcance,
          y: origem.y + Math.sin(t) * forma.alcance,
        };
      });
      const ponta = { x: origem.x + dir.x * forma.alcance, y: origem.y + dir.y * forma.alcance };
      return { area: [{ ...origem }, ...arco], alcance: null, ponta };
    }
    case 'alvo': {
      const ponta = pontoNoAlcance(origem, cursor, forma.alcance);
      return {
        area: poligonoDeLuz(ponta.x, ponta.y, RAIO_MARCA_ALVO, lados),
        alcance: poligonoDeLuz(origem.x, origem.y, forma.alcance, lados),
        ponta,
      };
    }
    case 'propria':
      return {
        area: poligonoDeLuz(origem.x, origem.y, RAIO_MARCA_ALVO, lados),
        alcance: null,
        ponta: { ...origem },
      };
    case 'dash': {
      const ponta = {
        x: origem.x + dir.x * forma.distancia,
        y: origem.y + dir.y * forma.distancia,
      };
      return {
        area: faixa(origem, dir, forma.distancia, MEIA_LARGURA_DASH),
        alcance: null,
        ponta,
      };
    }
  }
}
