import { describe, expect, it } from 'vitest';
import campeoesJson from '../../content/campeoes.json';
import combateJson from '../../content/combate.json';
import controlesJson from '../../content/controles.json';
import habilidadesJson from '../../content/habilidades.json';
import luzJson from '../../content/luz.json';
import modelosJson from '../../content/modelos.json';
import ruasJson from '../../content/ruas.json';
import visualJson from '../../content/visual.json';
import {
  esquemaCampeoes,
  esquemaCombate,
  esquemaControles,
  esquemaHabilidades,
  esquemaLuz,
  esquemaModelos,
  esquemaRuas,
  esquemaVisual,
} from '../../src/sim/content/esquemas';
import { criarLancador } from '../../src/sim/habilidades';

describe('content/visual.json', () => {
  it('passa na validação', () => {
    expect(() => esquemaVisual.parse(visualJson)).not.toThrow();
  });

  it('recusa cor fora do formato #RRGGBB', () => {
    const quebrado = structuredClone(visualJson);
    quebrado.paleta.chao = 'cinza';
    expect(esquemaVisual.safeParse(quebrado).success).toBe(false);
  });

  it('recusa zoom inicial fora dos limites', () => {
    const quebrado = structuredClone(visualJson);
    quebrado.camera.zoomInicial = 2;
    expect(esquemaVisual.safeParse(quebrado).success).toBe(false);
  });

  it('recusa altura de andar que não é múltipla de 24 px', () => {
    const quebrado = structuredClone(visualJson);
    quebrado.alturaAndarPx = 40;
    expect(esquemaVisual.safeParse(quebrado).success).toBe(false);
  });
});

describe('content/luz.json', () => {
  it('passa na validação com os raios do GDD (sem luz própria em volta do jogador)', () => {
    const l = esquemaLuz.parse(luzJson);
    expect(l.poste.raio).toBe(3);
    expect(l.janela.comprimento).toBeGreaterThan(0);
    expect('lanterna' in l).toBe(false);
  });
});

describe('content/ruas.json', () => {
  it('passa na validação', () => {
    expect(() => esquemaRuas.parse(ruasJson)).not.toThrow();
  });

  it('recusa objeto fora da rua', () => {
    const quebrado = structuredClone(ruasJson);
    quebrado.ruas[0]!.objetos[0]!.x = 999;
    expect(esquemaRuas.safeParse(quebrado).success).toBe(false);
  });

  it('recusa modelo desconhecido', () => {
    const quebrado = structuredClone(ruasJson);
    quebrado.ruas[0]!.objetos[0]!.modelo = 'castelo';
    expect(esquemaRuas.safeParse(quebrado).success).toBe(false);
  });

  it('recusa entrada fora da rua', () => {
    const quebrado = structuredClone(ruasJson);
    quebrado.ruas[0]!.entrada.y = -1;
    expect(esquemaRuas.safeParse(quebrado).success).toBe(false);
  });

  it('recusa ids de rua repetidos', () => {
    const quebrado = structuredClone(ruasJson);
    quebrado.ruas[1]!.id = quebrado.ruas[0]!.id;
    expect(esquemaRuas.safeParse(quebrado).success).toBe(false);
  });
});

describe('content/modelos.json', () => {
  it('passa na validação', () => {
    expect(() => esquemaModelos.parse(modelosJson)).not.toThrow();
  });

  it('recusa modelo sem registro', () => {
    const semBanco: Partial<typeof modelosJson> = structuredClone(modelosJson);
    delete semBanco.banco;
    expect(esquemaModelos.safeParse(semBanco).success).toBe(false);
  });

  it('recusa retângulo de colisão invertido', () => {
    const quebrado = structuredClone(modelosJson);
    quebrado.poste.colisao[0]!.x1 = 0;
    expect(esquemaModelos.safeParse(quebrado).success).toBe(false);
  });
});

describe('content/habilidades.json', () => {
  it('passa na validação', () => {
    expect(() => esquemaHabilidades.parse(habilidadesJson)).not.toThrow();
  });

  it('recusa número de valores por posto errado (R tem 3, as outras 5)', () => {
    const quebrado = structuredClone(habilidadesJson);
    quebrado.habilidades[0]!.recarga = [6, 6, 6];
    expect(esquemaHabilidades.safeParse(quebrado).success).toBe(false);
    const r = structuredClone(habilidadesJson);
    r.habilidades[3]!.recarga = [90, 80, 70, 60, 50];
    expect(esquemaHabilidades.safeParse(r).success).toBe(false);
  });

  it('recusa forma desconhecida', () => {
    const quebrado = structuredClone(habilidadesJson) as { habilidades: { forma: unknown }[] };
    quebrado.habilidades[0]!.forma = { tipo: 'espiral' };
    expect(esquemaHabilidades.safeParse(quebrado).success).toBe(false);
  });

  it('tem os números da Bruxinha do GDD', () => {
    const porId = new Map(
      esquemaHabilidades.parse(habilidadesJson).habilidades.map((h) => [h.id, h]),
    );
    expect(porId.get('bruxinha_q')).toMatchObject({ custo: 40, lancamento: 0.25 });
    expect(porId.get('bruxinha_w')).toMatchObject({ custo: 60, lancamento: 0.25 });
    expect(porId.get('bruxinha_e')).toMatchObject({ custo: 50, lancamento: 0 });
    expect(porId.get('bruxinha_r')).toMatchObject({ custo: 100, lancamento: 0.8 });
  });
});

describe('content/campeoes.json', () => {
  it('passa na validação e cada habilidade existe na tecla certa', () => {
    const c = esquemaCampeoes.parse(campeoesJson);
    const bruxinha = c['bruxinha']!;
    const porId = new Map(
      esquemaHabilidades.parse(habilidadesJson).habilidades.map((h) => [h.id, h]),
    );
    expect(() => criarLancador(bruxinha, porId)).not.toThrow();
    for (const [tecla, id] of Object.entries(bruxinha.habilidades)) {
      expect(porId.get(id)?.tecla).toBe(tecla);
    }
  });

  it('o lançador recusa habilidade inexistente', () => {
    const c = esquemaCampeoes.parse(campeoesJson);
    const bruxinha = c['bruxinha']!;
    expect(() =>
      criarLancador(
        { ...bruxinha, habilidades: { ...bruxinha.habilidades, Q: 'nada' } },
        new Map(),
      ),
    ).toThrow();
  });
});

describe('content/combate.json e controles.json', () => {
  it('passam na validação', () => {
    expect(() => esquemaCombate.parse(combateJson)).not.toThrow();
    expect(esquemaControles.parse(controlesJson).lancamento).toBe('soltar');
  });
});

describe('regras de legibilidade (GAMEPLAY.md)', () => {
  it('ataques inimigos com dano têm aviso vermelho de 0,4 s ou mais (fora o golpe das pestinhas)', async () => {
    const { habilidades, inimigos } = await import('../../src/sim/content');
    const porId = new Map(habilidades.map((h) => [h.id, h]));
    for (const [id, def] of Object.entries(inimigos.inimigos)) {
      const ehPestinha = def.comportamento === 'onda' || def.comportamento === 'arremessador';
      for (const a of def.ataques) {
        const h = porId.get(a);
        expect(h, `${id}: ataque ${a}`).toBeDefined();
        const temDano = h!.efeitos.some((e) => e.tipo === 'dano');
        if (temDano && !ehPestinha) {
          expect(h!.aviso, `${a} precisa de aviso`).toBe(true);
          expect(h!.lancamento, `${a} avisa por pouco tempo`).toBeGreaterThanOrEqual(0.4);
        }
        if (h!.forma.tipo === 'linha')
          expect(h!.forma.velocidade, `${a} rápido demais`).toBeLessThanOrEqual(9);
      }
    }
  });

  it('quem tem brilho próprio no escuro é um inimigo ou um campeão que existe', async () => {
    const { campeoes, inimigos, visual } = await import('../../src/sim/content');
    const { especies } = visual.luzNaTela.brilhoProprio;
    expect(especies).toContain('moradora_do_13');
    for (const e of especies) expect(inimigos.inimigos[e] ?? campeoes[e], e).toBeDefined();
  });
});
