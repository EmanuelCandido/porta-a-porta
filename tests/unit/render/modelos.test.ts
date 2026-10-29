import { describe, expect, it } from 'vitest';
import { modeloDe } from '../../../src/render/catalogo';
import {
  caixaDaParte,
  normalDeNewell,
  ordenarPartes,
  poligonosDasPartes,
} from '../../../src/render/geometria';
import { criarIso } from '../../../src/render/iso';
import { instanciar, type Rotacao } from '../../../src/render/modelos';
import { modelos, ruas, visual } from '../../../src/sim/content';
import {
  MODELOS_DE_CIDADE,
  MODELOS_MOVEIS,
  type Figurante,
  type ObjetoRua,
} from '../../../src/sim/content/esquemas';

const iso = criarIso(visual.tile);
const ctx = { iso, visual };
const ROTACOES: Rotacao[] = [0, 90, 180, 270];

const TODOS: (ObjetoRua | Figurante)[] = [
  { modelo: 'casa_terrea', x: 0, y: 0, rot: 0 },
  { modelo: 'sobrado', x: 0, y: 0, rot: 0 },
  { modelo: 'casa_grande', x: 0, y: 0, rot: 0 },
  { modelo: 'poste', estado: 'amigo', x: 0, y: 0, rot: 0 },
  { modelo: 'poste', estado: 'apagado', x: 0, y: 0, rot: 0 },
  { modelo: 'poste', estado: 'corrompido', x: 0, y: 0, rot: 0 },
  { modelo: 'lixeira', x: 0, y: 0, rot: 0 },
  { modelo: 'arvore', x: 0, y: 0, rot: 0 },
  { modelo: 'banco', x: 0, y: 0, rot: 0 },
  { modelo: 'bruxinha', x: 0, y: 0, rot: 0 },
  { modelo: 'pestinha_lencol', x: 0, y: 0, rot: 0 },
  ...MODELOS_DE_CIDADE.map((modelo): ObjetoRua => ({ modelo, x: 0, y: 0, rot: 0 })),
  { modelo: 'loja', variante: 'farmacia', x: 0, y: 0, rot: 0 },
  { modelo: 'loja', variante: 'padaria', x: 0, y: 0, rot: 0 },
  { modelo: 'carro', variante: 'perua', x: 0, y: 0, rot: 0 },
  { modelo: 'predio', variante: 'alto', x: 0, y: 0, rot: 0 },
];

function desenhar(o: ObjetoRua | Figurante, rot: Rotacao) {
  const inst = instanciar(modeloDe(o, ctx), 0, 0, rot);
  return poligonosDasPartes(
    ordenarPartes(inst.partes, iso),
    iso,
    visual.paleta,
    visual.volumes.limiarTopo,
  );
}

describe('modelos do kit visual', () => {
  it.each(TODOS.map((o) => [o.modelo + ('estado' in o ? `:${o.estado}` : ''), o] as const))(
    '%s tem faces planas e coordenadas finitas',
    (_nome, o) => {
      for (const parte of modeloDe(o, ctx).partes) {
        for (const face of parte.faces) {
          expect(face.pts.length).toBeGreaterThanOrEqual(3);
          const n = normalDeNewell(face.pts, iso);
          const a = face.pts[0]!;
          for (const p of face.pts) {
            expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
            const d = n.x * (p.x - a.x) + n.y * (p.y - a.y) + (n.z * (p.z - a.z)) / iso.zPorTile;
            expect(Math.abs(d)).toBeLessThan(1e-9);
          }
        }
      }
    },
  );

  it('todo modelo aparece em todas as rotações', () => {
    for (const o of TODOS)
      for (const rot of ROTACOES) expect(desenhar(o, rot).length).toBeGreaterThan(0);
  });

  it('o cenário nunca usa cores de acento; só personagens e o Poste Corrompido', () => {
    const acentos = new Set(Object.values(visual.acentos));
    const comAcento = TODOS.filter((o) => desenhar(o, 0).some((p) => acentos.has(p.cor))).map(
      (o) => o.modelo,
    );
    // Personagens e objetos que andam podem ter acento (olhos, detalhes); do cenário, só o poste
    // (o estado corrompido brilha roxo).
    const moveis = new Set<string>(MODELOS_MOVEIS);
    expect(comAcento.filter((m) => !moveis.has(m)).sort()).toEqual(['poste']);
  });

  it('girar 90° troca largura e profundidade da pegada', () => {
    const modelo = modeloDe({ modelo: 'casa_grande', x: 0, y: 0, rot: 0 }, ctx);
    const { pegada } = instanciar(modelo, 2, 3, 90);
    expect(pegada).toEqual({ x0: 2, y0: 3, x1: 2 + modelo.profundidade, y1: 3 + modelo.largura });
  });

  it('a frente (+x) aparece a 0° e some a 180°', () => {
    const casa = { modelo: 'casa_terrea', x: 0, y: 0, rot: 0 } as const;
    const brilhoNaFrente = (rot: Rotacao) => desenhar(casa, rot).filter((p) => p.emissivo).length;
    expect(brilhoNaFrente(0)).not.toBe(brilhoNaFrente(180));
  });

  it('toda janela acesa vira um feixe com a largura e o andar dela', () => {
    const { luzes } = modeloDe({ modelo: 'sobrado', x: 0, y: 0, rot: 0 }, ctx);
    const janelas = luzes.filter((l) => l.tipo === 'janela');
    expect(janelas.length).toBeGreaterThan(4);
    for (const j of janelas) expect(j.largura).toBeGreaterThan(0);
    // Os andares de cima também jogam luz (mais longe da parede, pela regra).
    const andares = new Set(janelas.map((j) => j.andar));
    expect(andares.has(0) && andares.has(1)).toBe(true);
  });

  it('só o poste amigo e o corrompido emitem luz', () => {
    const tipos = (estado: 'amigo' | 'apagado' | 'corrompido') =>
      modeloDe({ modelo: 'poste', estado, x: 0, y: 0, rot: 0 }, ctx).luzes.map((l) => l.tipo);
    expect(tipos('amigo')).toEqual(['poste']);
    expect(tipos('apagado')).toEqual([]);
    expect(tipos('corrompido')).toEqual(['posteCorrompido']);
  });

  it('todas as ruas do conteúdo montam', () => {
    for (const rua of ruas) {
      for (const o of [...rua.objetos, ...rua.figurantes]) {
        expect(() => instanciar(modeloDe(o, ctx), o.x, o.y, o.rot)).not.toThrow();
      }
    }
  });

  it('a colisão de cada modelo fica dentro do que é desenhado', () => {
    for (const o of TODOS) {
      const caixas = modeloDe(o, ctx).partes.map(caixaDaParte);
      const minX = Math.min(...caixas.map((c) => c.min.x));
      const minY = Math.min(...caixas.map((c) => c.min.y));
      const maxX = Math.max(...caixas.map((c) => c.max.x));
      const maxY = Math.max(...caixas.map((c) => c.max.y));
      for (const r of modelos[o.modelo].colisao) {
        expect(r.x0).toBeGreaterThanOrEqual(minX - 1e-9);
        expect(r.y0).toBeGreaterThanOrEqual(minY - 1e-9);
        expect(r.x1).toBeLessThanOrEqual(maxX + 1e-9);
        expect(r.y1).toBeLessThanOrEqual(maxY + 1e-9);
      }
    }
  });
});

describe('janelas que iluminam o chão', () => {
  it('as do JSON (usadas pela simulação) são as mesmas do desenho, em todos os modelos', async () => {
    const { criarIso } = await import('../../../src/render/iso');
    const { modelos, visual } = await import('../../../src/sim/content');
    const ctx = { iso: criarIso(visual.tile), visual };
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const nomes = ['casa_terrea', 'sobrado', 'casa_grande', ...MODELOS_DE_CIDADE] as const;
    for (const nome of nomes) {
      const desenho = modeloDe({ modelo: nome, x: 0, y: 0, rot: 0 } as ObjetoRua, ctx)
        .luzes.filter((l) => l.tipo === 'janela')
        .map((l) => ({
          x: r(l.x),
          y: r(l.y),
          nx: l.normal!.x,
          ny: l.normal!.y,
          largura: r(l.largura!),
          andar: l.andar!,
        }));
      expect(modelos[nome].janelas, nome).toEqual(desenho);
    }
  });
});
