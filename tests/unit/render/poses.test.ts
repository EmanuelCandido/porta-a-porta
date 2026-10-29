import { describe, expect, it } from 'vitest';
import { chaveDeTextura } from '../../../src/render/catalogo';
import { criarIso } from '../../../src/render/iso';
import {
  angulosDaPose,
  chaveDaPose,
  dadosDaMalha,
  esqueletoDaMalha,
  girarNaParte,
  modeloDaMalha,
  partesDosTriangulos,
  passoDaFase,
  pivoDaParte,
  POSE_PARADA,
  posesDoCorpo,
} from '../../../src/render/malhas';
import { visual } from '../../../src/sim/content';
import type { NomeModelo } from '../../../src/sim/content/esquemas';

const ctx = { iso: criarIso(visual.tile), visual };
const esqueletos = visual.malhas.esqueletos;

/** Pontos das faces do modelo, na ordem em que a malha guarda os triângulos. */
function pontos(nome: NomeModelo, pose = POSE_PARADA) {
  return modeloDaMalha(ctx, nome, pose).partes.flatMap((p) => p.faces.flatMap((f) => f.pts));
}

describe('corpo animado das malhas prontas (E5)', () => {
  it('todo esqueleto é de uma malha que existe e cada parte pega triângulos', () => {
    // Só as malhas prontas com braços, pernas ou patas (E5); o lençol, o baú e o doce não andam assim.
    expect(Object.keys(esqueletos).sort()).toEqual(
      [
        'arremessador',
        'bruxinha',
        'cao_de_guarda',
        'cobrador',
        'gato_preto',
        'guarda_condominio',
        'sindico_zeloso',
        'vizinho_curioso',
        // Os jogáveis e os personagens montados em peças (Design Codex v6 e v7).
        'fantasma',
        'esqueleto',
        'vampirinho',
        'morador_ofendido',
        'viuva_do_mirante',
        'sombra_da_viuva',
        'pestinha_vela',
        'morceguinho',
        'espantalho',
        'saco_surpresa',
      ].sort(),
    );
    for (const [nome, partes] of Object.entries(esqueletos)) {
      const d = dadosDaMalha(nome);
      expect(d, nome).toBeDefined();
      const de = partesDosTriangulos(d!, partes);
      partes.forEach((p, i) => {
        const n = de.filter((k) => k === i).length;
        expect(n, `${nome}.${p.parte}`).toBeGreaterThan(10);
      });
      // O corpo (o que não gira) fica com uma boa parte (no cão, a cabeça e as patas são quase tudo).
      expect(de.filter((k) => k === -1).length, nome).toBeGreaterThan(d!.cores.length / 4);
    }
  });

  it('nas malhas em peças, o braço pega as peças do lado dele e gira no topo da manga', () => {
    const d = dadosDaMalha('vampirinho')!;
    const partes = esqueletos.vampirinho!;
    const de = partesDosTriangulos(d, partes);
    const e = partes.findIndex((p) => p.parte === 'bracoE');
    const dir = partes.findIndex((p) => p.parte === 'bracoD');
    for (let i = 0; i < d.cores.length; i++) {
      const peca = d.pecas![d.pecaDe![i]!]!;
      const y = (peca.min[1]! + peca.max[1]!) / 2;
      if (peca.n === 'Manga') expect(de[i]).toBe(y > 0 ? e : dir);
      if (peca.n === 'Cabeca') expect(de[i]).toBe(-1);
    }
    const manga = d.pecas!.filter((p) => p.n === 'Manga' && p.max[1]! > 0)[0]!;
    const pivo = pivoDaParte(d, partes[e]!);
    expect(pivo[2]).toBeCloseTo(manga.max[2]!, 9);
    expect(pivo[1]).toBeGreaterThan(0);
  });

  it('as asas do Morceguinho batem de lado (para cima e para baixo) e as duas sobem juntas', () => {
    const parada = pontos('morceguinho');
    const cima = pontos('morceguinho', { passo: 1, golpe: false });
    const d = dadosDaMalha('morceguinho')!;
    const de = partesDosTriangulos(d, esqueletos.morceguinho!);
    const asas = esqueletos.morceguinho!.flatMap((p, i) => (p.plano === 'lado' ? [i] : []));
    expect(asas).toHaveLength(2);
    // Na ponta das asas (longe do corpo), as duas sobem no passo 1.
    let subiram = 0;
    let longe = 0;
    for (let i = 0; i < d.cores.length; i++) {
      if (!asas.includes(de[i]!)) continue;
      const y = d.triangulos[i * 9 + 1]!;
      if (Math.abs(y) < 1.2) continue;
      longe++;
      if (cima[i * 3]!.z > parada[i * 3]!.z) subiram++;
    }
    expect(longe).toBeGreaterThan(0);
    expect(subiram).toBe(longe);
  });

  it('o reflexo da Moradora usa o esqueleto da fantasia que ele copia', () => {
    for (const f of ['bruxinha', 'fantasma', 'esqueleto', 'vampirinho']) {
      const nome = `moradora_13_${f}`;
      expect(esqueletoDaMalha(visual.malhas, nome)).toBe(esqueletos[f]);
      const passo = pontos(nome as NomeModelo, { passo: 1, golpe: false });
      const parada = pontos(nome as NomeModelo);
      expect(passo.some((p, i) => p.x !== parada[i]!.x)).toBe(true);
    }
  });

  it('a vassoura vai junto com o braço que a segura', () => {
    const d = dadosDaMalha('bruxinha')!;
    const partes = esqueletos.bruxinha!;
    const de = partesDosTriangulos(d, partes);
    const braco = partes.findIndex((p) => p.parte === 'bracoD');
    for (let i = 0; i < d.cores.length; i++) {
      const y =
        (d.triangulos[i * 9 + 1]! + d.triangulos[i * 9 + 4]! + d.triangulos[i * 9 + 7]!) / 3;
      if (y < -0.45) expect(de[i]).toBe(braco);
    }
  });

  it('girar leva o que está embaixo do pivô para a frente, sem mudar a distância', () => {
    const pivo = [0, 0, 1] as const;
    const [x, z] = girarNaParte(0, 0, pivo, 30);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
    expect(Math.hypot(x, z - 1)).toBeCloseTo(1, 9);
    expect(girarNaParte(0, 1, pivo, 50)).toEqual([0, 1]);
    const [xt] = girarNaParte(0, 0, pivo, -30);
    expect(xt).toBeLessThan(0);
  });

  it('o passo segue a fase em degraus e é 0 parado', () => {
    const d = visual.malhas.degrausDoPasso;
    const vistos = new Set<number>();
    for (let f = 0; f < Math.PI * 4; f += 0.05) {
      const p = passoDaFase(f, d);
      expect(Math.abs(p)).toBeLessThanOrEqual(1);
      expect(Number.isInteger(p * d)).toBe(true);
      vistos.add(p);
    }
    expect(vistos.size).toBe(2 * d + 1);
    expect(passoDaFase(0, d)).toBe(1);
    expect(passoDaFase(Math.PI, d)).toBe(-1);
  });

  it('em todo esqueleto, as pernas de um lado vão contra as do outro', () => {
    for (const [nome, partes] of Object.entries(esqueletos)) {
      const a = angulosDaPose(partes, { passo: 1, golpe: false });
      const de = (n: string) => a[partes.findIndex((p) => p.parte === n)];
      const pares = [
        ['pernaE', 'pernaD'],
        ['frenteE', 'frenteD'],
        ['trasE', 'trasD'],
        ['frenteE', 'trasE'],
      ];
      for (const [e, d] of pares) {
        if (de(e!) === undefined || de(d!) === undefined) continue;
        expect(Math.sign(de(e!)!), `${nome}: ${e} × ${d}`).toBe(-Math.sign(de(d!)!));
      }
    }
  });

  it('no passo as pernas vão para lados opostos e os braços ao contrário delas', () => {
    const partes = esqueletos.bruxinha!;
    const a = angulosDaPose(partes, { passo: 1, golpe: false });
    const de = (n: string) => a[partes.findIndex((p) => p.parte === n)]!;
    expect(Math.sign(de('pernaE'))).toBe(-Math.sign(de('pernaD')));
    expect(Math.sign(de('bracoE'))).toBe(-Math.sign(de('pernaE')));
    expect(Math.sign(de('bracoD'))).toBe(-Math.sign(de('pernaD')));
    // No golpe o braço livre sobe para a frente.
    expect(de('bracoE')).not.toBe(0);
    const g = angulosDaPose(partes, { passo: 0, golpe: true });
    expect(g[partes.findIndex((p) => p.parte === 'bracoE')]).toBeGreaterThan(30);
    expect(angulosDaPose(partes, POSE_PARADA).every((x) => x === 0)).toBe(true);
  });

  it('a pose move só as partes e mantém os triângulos', () => {
    const parada = pontos('bruxinha');
    const passo = pontos('bruxinha', { passo: 1, golpe: false });
    expect(passo.length).toBe(parada.length);
    const mexeu = parada.filter((p, i) => p.x !== passo[i]!.x || p.z !== passo[i]!.z).length;
    expect(mexeu).toBeGreaterThan(parada.length * 0.05);
    expect(mexeu).toBeLessThan(parada.length * 0.6);
    // Nada anda de lado: o giro é só para a frente e para trás.
    parada.forEach((p, i) => expect(passo[i]!.y).toBeCloseTo(p.y, 9));
    // Sem esqueleto, a pose não muda nada.
    expect(pontos('pestinha_lencol', { passo: 1, golpe: true })).toEqual(pontos('pestinha_lencol'));
  });

  it('toda pose que o andar ou o golpe pedem está entre as que se assam antes', () => {
    const d = visual.malhas.degrausDoPasso;
    const lista = posesDoCorpo(d).map((p) => chaveDaPose(p));
    expect(new Set(lista).size).toBe(lista.length);
    expect(lista).not.toContain('');
    for (let f = 0; f < Math.PI * 2; f += 0.03) {
      const passo = passoDaFase(f, d);
      if (passo !== 0) expect(lista).toContain(chaveDaPose({ passo, golpe: false }));
    }
    expect(lista).toContain(chaveDaPose({ passo: 0, golpe: true }));
  });

  it('cada pose tem a sua textura; a parada é a de sempre', () => {
    expect(chaveDaPose(POSE_PARADA)).toBe('');
    expect(chaveDaPose(undefined)).toBe('');
    const base = { modelo: 'bruxinha' as const, x: 0, y: 0, rot: 0 as const };
    const chaves = new Set(
      [
        POSE_PARADA,
        { passo: 1, golpe: false },
        { passo: -1, golpe: false },
        { passo: 0.5, golpe: false },
        { passo: 0, golpe: true },
        { passo: 1, golpe: true },
      ].map((pose) => chaveDeTextura({ ...base, pose })),
    );
    expect(chaves.size).toBe(6);
    expect(chaveDeTextura({ ...base, pose: POSE_PARADA })).toBe(chaveDeTextura(base));
  });
});
