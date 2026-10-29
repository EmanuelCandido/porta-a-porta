import { describe, expect, it, vi } from 'vitest';
import { CampoDeFluxo, Grade } from '../../../src/sim/campoDeFluxo';
import { gerador, luz, modelos } from '../../../src/sim/content';
import { esquemaRua, MODELOS_DE_CASA } from '../../../src/sim/content/esquemas';
import { gerarRua, type RuaGerada } from '../../../src/sim/gerador';
import { posicionador, type Retangulo, type V2 } from '../../../src/sim/geometria';
import { obstaculosDaRua } from '../../../src/sim/rua';

// Cada teste gera várias ruas inteiras: com os outros arquivos em paralelo, passa dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000 });

const RAIO = 0.4;
const CASAS = new Set<string>(MODELOS_DE_CASA);
/** A rua de luta antes da rota: 34 × 40 tiles. */
const AREA_ANTIGA = 34 * 40;

/** Campo de fluxo a partir da entrada, com a grade do portão e as ruas interditadas fechadas. */
function campo(g: RuaGerada, opcoes: { grade: boolean; bloqueios: boolean }): CampoDeFluxo {
  const obst = [
    ...obstaculosDaRua(g.rua, modelos),
    ...g.bloqueado,
    ...(opcoes.grade ? [g.grade] : []),
    ...(opcoes.bloqueios ? g.bloqueios.map((b) => b.area) : []),
  ];
  const limites = { x0: 0, y0: 0, x1: g.rua.largura, y1: g.rua.profundidade };
  const c = new CampoDeFluxo(new Grade(limites, 0.5, obst, RAIO - 0.15));
  c.calcular(g.rua.entrada);
  return c;
}

const dentro = (p: V2, r: Retangulo, folga = 0) =>
  p.x >= r.x0 - folga && p.x <= r.x1 + folga && p.y >= r.y0 - folga && p.y <= r.y1 + folga;

function comprimento(rota: V2[]): number {
  let s = 0;
  for (let k = 0; k + 1 < rota.length; k++)
    s += Math.hypot(rota[k + 1]!.x - rota[k]!.x, rota[k + 1]!.y - rota[k]!.y);
  return s;
}

describe('gerador da rota', () => {
  it('nenhuma cerca, sebe ou muro atravessa uma casa, e nenhum poste fica dentro de uma copa', () => {
    const BORDA = new Set(['cerca', 'cerca_viva', 'muro', 'tapume']);
    const ARVORES = new Set(['arvore', 'arvore_seca', 'pinheiro']);
    for (let semente = 1; semente <= 12; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const todos = [...g.rua.objetos, ...(g.rua.cenario ?? [])].map((o) => {
        const m = modelos[o.modelo];
        return {
          o,
          p: posicionador(m.pegada.largura, m.pegada.profundidade, o.x, o.y, o.rot).pegada,
        };
      });
      const casas = todos.filter((t) => CASAS.has(t.o.modelo));
      for (const a of todos) {
        if (BORDA.has(a.o.modelo)) {
          const esp = Math.min(a.p.x1 - a.p.x0, a.p.y1 - a.p.y0);
          for (const b of casas) {
            const iw = Math.min(a.p.x1, b.p.x1) - Math.max(a.p.x0, b.p.x0);
            const ih = Math.min(a.p.y1, b.p.y1) - Math.max(a.p.y0, b.p.y0);
            const atravessa = Math.min(iw, ih) >= esp * 0.9 && Math.max(iw, ih) > 0.4;
            expect(atravessa, `${a.o.modelo} em ${a.o.x},${a.o.y} × ${b.o.modelo}`).toBe(false);
          }
        }
        if (a.o.modelo === 'poste')
          for (const b of todos) {
            if (!ARVORES.has(b.o.modelo)) continue;
            const d = Math.hypot(
              (a.p.x0 + a.p.x1 - b.p.x0 - b.p.x1) / 2,
              (a.p.y0 + a.p.y1 - b.p.y0 - b.p.y1) / 2,
            );
            expect(d, `poste em ${a.o.x},${a.o.y} na copa`).toBeGreaterThanOrEqual(0.9);
          }
      }
    }
    // Doze ruas inteiras: com a suíte em paralelo, leva mais que os 5 s padrão.
  }, 180_000);

  it('a mesma semente gera a mesma rota', () => {
    const a = gerarRua(42, gerador, modelos, luz, { bairro: 0 });
    const b = gerarRua(42, gerador, modelos, luz, { bairro: 0 });
    expect(a).toEqual(b);
    expect(gerarRua(43, gerador, modelos, luz, { bairro: 0 })).not.toEqual(a);
  });

  it('o chão que dá para andar tem mais de 5 vezes a área da rua antiga e o caminho é longo', () => {
    for (let semente = 1; semente <= 10; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const fechado = g.bloqueado.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
      const andavel = g.rua.largura * g.rua.profundidade - fechado;
      expect(andavel).toBeGreaterThan(5 * AREA_ANTIGA);
      expect(comprimento(g.rota)).toBeGreaterThan(300);
      // O mundo é recortado na rota: boa parte dele é caminho, não cenário sobrando.
      expect(andavel / (g.rua.largura * g.rua.profundidade)).toBeGreaterThan(0.2);
    }
  });

  it('a rota é linear: da entrada (sul) ao portão (norte), um passo de quarteirão por vez', () => {
    const S = gerador.rota.celula;
    for (let semente = 1; semente <= 20; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const nos = g.rota.slice(1, -1);
      expect(nos.length).toBeGreaterThanOrEqual(gerador.rota.nos[0]);
      for (let k = 0; k + 1 < nos.length; k++) {
        const d = Math.hypot(nos[k + 1]!.x - nos[k]!.x, nos[k + 1]!.y - nos[k]!.y);
        expect(d).toBeCloseTo(S, 6);
      }
      // Dois nós que não são vizinhos na rota nunca ficam colados (há um quarteirão entre eles).
      for (let a = 0; a < nos.length; a++)
        for (let b = a + 2; b < nos.length; b++)
          expect(Math.hypot(nos[a]!.x - nos[b]!.x, nos[a]!.y - nos[b]!.y)).toBeGreaterThan(S + 1);
      expect(g.rota[0]!.y).toBeGreaterThan(g.rota.at(-1)!.y);
      expect(g.ySaida).toBeLessThan(g.yEntrada);
    }
  });

  it('as salas vêm na ordem: largo, Poste 1, praça, obra, pátio do Poste 2 e o largo do portão', () => {
    for (let semente = 1; semente <= 15; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const nos = g.rota.slice(1, -1);
      const ordem = (tipo: string) => {
        const z = g.zonas.find((zz) => zz.tipo === tipo);
        expect(z, tipo).toBeDefined();
        return nos.findIndex((n) => dentro(n, z!.area));
      };
      const largos = g.zonas.filter((z) => z.tipo === 'largo');
      expect(largos).toHaveLength(2);
      const poste = ordem('cruzamento');
      const pracaK = ordem('praca');
      const obras = ordem('obras');
      const patio = ordem(g.zonas.some((z) => z.tipo === 'escola') ? 'escola' : 'estacionamento');
      expect(poste).toBeGreaterThan(0);
      expect(pracaK).toBeGreaterThan(poste);
      expect(obras).toBeGreaterThan(pracaK);
      expect(patio).toBeGreaterThan(obras);
      expect(patio).toBe(nos.length - 2);
      const [p1, p2] = g.postesCorrompidos;
      expect(dentro(p1!, g.zonas.find((z) => z.tipo === 'cruzamento')!.area)).toBe(true);
      const zonaP2 = g.zonas.find(
        (z) => dentro(p2!, z.area) && ['escola', 'estacionamento'].includes(z.tipo),
      );
      expect(zonaP2).toBeDefined();
      expect(g.praca).not.toBeNull();
      expect(g.bueirosFlanco).toHaveLength(1);
      expect(g.bloqueios).toHaveLength(1);
    }
  });

  for (let semente = 1; semente <= 20; semente++) {
    it(`semente ${semente}: o caminho é contínuo e nada vaza para fora dele`, () => {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      expect(() => esquemaRua.parse(g.rua)).not.toThrow();
      const vizinho = (c: CampoDeFluxo, p: V2) =>
        [
          p,
          { x: p.x + 1, y: p.y },
          { x: p.x - 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x, y: p.y - 1 },
        ].some((q) => Number.isFinite(c.distanciaDe(q)));
      // Com a rua interditada fechada, dá para chegar ao 1º Poste, mas não ao 2º.
      const antes = campo(g, { grade: true, bloqueios: true });
      expect(vizinho(antes, g.postesCorrompidos[0]!)).toBe(true);
      expect(vizinho(antes, g.postesCorrompidos[1]!)).toBe(false);
      // Depois que ela abre, o resto da rota inteira fica ao alcance.
      const c = campo(g, { grade: true, bloqueios: false });
      const alcancavel = (p: V2) => Number.isFinite(c.distanciaDe(p));
      expect(vizinho(c, g.postesCorrompidos[1]!)).toBe(true);
      for (const b of [...g.bueiros, ...g.bueirosFlanco]) expect(alcancavel(b)).toBe(true);
      expect(g.quintais.length).toBeGreaterThanOrEqual(1);
      for (const q of g.quintais) {
        expect(alcancavel(q.selvagem)).toBe(true);
        expect(alcancavel(q.bau)).toBe(true);
        expect(alcancavel(q.boca)).toBe(true);
      }
      for (const porta of g.portas) expect(alcancavel(porta)).toBe(true);
      const ex = g.exploracao;
      for (const p of [...ex.campainhas, ...ex.segredos, ...ex.postes])
        expect(alcancavel(p)).toBe(true);
      expect(ex.mirante).not.toBeNull();
      expect(alcancavel(ex.mirante!)).toBe(true);
      for (const e of g.encontros) expect(vizinho(c, e.pos)).toBe(true);
      // Com o portão fechado, a saída fica isolada; aberto, dá para sair.
      const fora = { x: (g.ruaX[0] + g.ruaX[1]) / 2, y: g.ySaida - 1 };
      expect(alcancavel(fora)).toBe(false);
      expect(Number.isFinite(campo(g, { grade: false, bloqueios: false }).distanciaDe(fora))).toBe(
        true,
      );
      // Só se anda pelo caminho: todo ponto alcançável fica numa rua, sala, beco ou quintal.
      for (let y = 1; y < g.rua.profundidade; y += 2)
        for (let x = 1; x < g.rua.largura; x += 2) {
          if (!alcancavel({ x, y })) continue;
          expect(
            g.zonas.some((z) => dentro({ x, y }, z.area, 0.6)),
            `(${x}, ${y})`,
          ).toBe(true);
        }
    });
  }

  it('cada rota esconde campainhas, 3 Abóboras Douradas longe umas das outras e postes apagados', () => {
    const ex = gerador.exploracao;
    for (let semente = 1; semente <= 10; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const e = g.exploracao;
      // O sorteio dá de `campainhas[0]` a `[1]`; as ruas com menos de `casasPorRua` ganham mais.
      expect(e.campainhas.length).toBeGreaterThanOrEqual(ex.campainhas[0]);
      expect(e.segredos).toHaveLength(ex.segredos);
      for (const a of e.segredos)
        for (const b of e.segredos)
          if (a !== b)
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
              ex.distanciaEntreSegredos,
            );
      expect(e.postes.length).toBeGreaterThanOrEqual(ex.postesParaReligar[0]);
      expect(e.postes.length).toBeLessThanOrEqual(ex.postesParaReligar[1]);
      for (const p of e.postes) {
        const o = g.rua.objetos[p.objeto]!;
        expect(o.modelo === 'poste' && o.estado === 'apagado').toBe(true);
      }
      for (const cmp of e.campainhas) {
        const o = g.rua.objetos[cmp.objeto]!;
        expect(o.modelo).toBe('abobora_decor');
        expect(o.grupo?.startsWith('campainha:')).toBe(true);
      }
      expect(g.rua.objetos[e.mirante!.objeto]!.modelo).toBe('caixa_dagua');
      expect(g.encontros.length).toBeGreaterThan(0);
    }
  });

  it('os limites são discretos: nada de muro; a entrada e os becos terminam em interdições', () => {
    for (let semente = 1; semente <= 8; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: semente % 3 });
      const todos = [...g.rua.objetos, ...g.rua.cenario];
      expect(todos.some((o) => o.modelo === 'muro')).toBe(false);
      expect(g.rua.objetos.some((o) => o.modelo === 'barreira')).toBe(true);
      expect(g.rua.objetos.filter((o) => CASAS.has(o.modelo)).length).toBeGreaterThan(80);
    }
  });

  it('as ruas da rota têm nomes diferentes', () => {
    const g = gerarRua(7, gerador, modelos, luz, { bairro: 1 });
    const ruas = g.zonas.filter((z) => z.tipo === 'rua');
    expect(ruas.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ruas.map((z) => z.nome)).size).toBe(ruas.length);
  });

  it('o cenário só existe até onde a câmera alcança a partir do caminho', () => {
    const alcance = gerador.rota.alcanceDaCamera;
    for (let semente = 1; semente <= 8; semente++) {
      const g = gerarRua(semente, gerador, modelos, luz, { bairro: 1 });
      const { mundo, cenario, largura, profundidade } = g.rua;
      const anel = gerador.cidade.anel;
      expect(mundo).toEqual({ x0: -anel, y0: -anel, x1: largura + anel, y1: profundidade + anel });
      // As zonas cobrem o caminho; nenhum enfeite fica além do alcance da câmera (com a folga
      // da grade grossa de distâncias).
      const distancia = (x: number, y: number) =>
        Math.min(
          ...g.zonas.map((z) =>
            Math.hypot(
              Math.max(z.area.x0 - x, 0, x - z.area.x1),
              Math.max(z.area.y0 - y, 0, y - z.area.y1),
            ),
          ),
        );
      for (const o of cenario) expect(distancia(o.x + 0.5, o.y + 0.5)).toBeLessThan(alcance + 3);
      // Mas perto do caminho a cidade continua: casas além da borda do mundo jogável.
      const fora = cenario.filter(
        (o) => o.x + 0.5 < 0 || o.y + 0.5 < 0 || o.x > largura || o.y > profundidade,
      );
      expect(fora.length).toBeGreaterThan(10);
    }
  });

  it('rua sem luz não tem postes amigos nem janelas, mas os postes da rota religam', () => {
    const g = gerarRua(5, gerador, modelos, luz, { bairro: 0, semLuz: true });
    expect(g.luzes).toEqual([]);
    expect(g.exploracao.postes.length).toBeGreaterThan(gerador.exploracao.postesParaReligar[1]);
  });

  it('postes apagados pelos preços não iluminam', () => {
    const normal = gerarRua(5, gerador, modelos, luz, { bairro: 0 });
    const apagado = gerarRua(5, gerador, modelos, luz, { bairro: 0, postesApagados: 1 });
    const postes = (g: RuaGerada) => g.luzes.filter((l) => l.tipo === 'poste').length;
    expect(postes(apagado)).toBe(postes(normal) - 1);
  });
});

describe('caminho na grade (A*)', () => {
  it('contorna uma parede e chega ao destino', () => {
    const grade = new Grade(
      { x0: 0, y0: 0, x1: 10, y1: 10 },
      0.5,
      [{ x0: 4, y0: 0, x1: 5, y1: 8 }],
      0.2,
    );
    const caminho = grade.caminho({ x: 1, y: 2 }, { x: 8, y: 2 })!;
    expect(caminho).not.toBeNull();
    expect(caminho.at(-1)).toEqual({ x: 8, y: 2 });
    // Passa por baixo da parede (y > 8) e nenhum trecho atravessa o obstáculo.
    expect(caminho.some((p) => p.y > 8)).toBe(true);
    let antes = { x: 1, y: 2 };
    for (const p of caminho) {
      expect(grade.linhaLivre(antes, p)).toBe(true);
      antes = p;
    }
  });

  it('sem caminho, devolve null', () => {
    const grade = new Grade(
      { x0: 0, y0: 0, x1: 10, y1: 10 },
      0.5,
      [{ x0: 4, y0: -1, x1: 5, y1: 11 }],
      0.2,
    );
    expect(grade.caminho({ x: 1, y: 2 }, { x: 8, y: 2 })).toBeNull();
  });
});

describe('portas com interação em toda rua da rota', () => {
  it('cada rua com nome da rota tem pelo menos casasPorRua campainhas ou Casas Desconfiadas', () => {
    const minimo = gerador.exploracao.casasPorRua;
    // A porta fica na calçada, fora da faixa da rua; numa rua curta vale a da esquina.
    const folga = 5;
    let ruas = 0;
    let comMinimo = 0;
    for (const bairro of [0, 1, 2])
      for (let s = 1; s <= 12; s++) {
        const g = gerarRua(s, gerador, modelos, luz, { bairro });
        const portas = [...g.exploracao.campainhas, ...(g.exploracao.desconfiadas ?? [])];
        // Só as ruas da rota: a avenida da entrada e os ramais da saída (no topo) não têm lotes.
        for (const z of g.zonas) {
          if (z.tipo !== 'rua' || z.nome.startsWith('Avenida') || z.area.y0 < 1) continue;
          const a = z.area;
          const n = portas.filter(
            (p) =>
              p.x >= a.x0 - folga &&
              p.x <= a.x1 + folga &&
              p.y >= a.y0 - folga &&
              p.y <= a.y1 + folga,
          ).length;
          ruas++;
          if (n >= minimo) comMinimo++;
          // Nenhuma rua fica sem porta nenhuma.
          expect(n, `${z.nome} (bairro ${bairro}, semente ${s})`).toBeGreaterThan(0);
        }
      }
    // As poucas abaixo do mínimo são ruas curtas sem lotes livres.
    expect(comMinimo / ruas).toBeGreaterThan(0.97);
  });
});
