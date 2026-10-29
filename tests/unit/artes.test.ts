import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  campeoes,
  evolucoes,
  habilidades,
  itens,
  noite,
  precos,
  tratos,
  visual,
} from '../../src/sim/content';

// As artes de interface do Design Codex (content/visual.json, `interface.artes`): cada id existe
// no conteúdo e tem o PNG em public/<pasta> (scripts/recortar-artes.mjs).

const { artes } = visual.interface;
const arquivo = (pasta: string, id: string) => `public/${artes.pasta}/${pasta}/${id}.png`;

describe('artes de interface do Codex', () => {
  it('cada id aponta para algo do conteúdo', () => {
    const evolucoesIds = Object.values(evolucoes).flatMap((l) => l.map((e) => e.id));
    const tratosIds = [...Object.keys(tratos.tratos), ...Object.keys(tratos.especiais)];
    const esperado: [readonly string[], readonly string[]][] = [
      [artes.itens, Object.keys(itens.itens)],
      [artes.habilidades, habilidades.map((h) => h.id)],
      [artes.retratos, Object.keys(campeoes)],
      [Object.keys(artes.passivas), Object.keys(campeoes)],
      [artes.evolucoes, evolucoesIds],
      [artes.tratos, tratosIds],
      [artes.precos, Object.keys(precos.precos)],
      [artes.marcas, Object.keys(tratos.conjuntos)],
      [artes.condicoes, Object.keys(noite.condicoes)],
    ];
    for (const [ids, validos] of esperado) {
      for (const id of ids) expect(validos, id).toContain(id);
    }
  });

  it('todo campeão tem retrato, passiva e as 4 habilidades em arte', () => {
    for (const [id, c] of Object.entries(campeoes)) {
      expect(artes.retratos).toContain(id);
      expect(artes.passivas[id], id).toBeDefined();
      for (const h of Object.values(c.habilidades)) expect(artes.habilidades).toContain(h);
    }
  });

  it('toda evolução, trato comum, preço e condição tem arte', () => {
    for (const l of Object.values(evolucoes))
      for (const e of l) expect(artes.evolucoes).toContain(e.id);
    for (const id of Object.keys(tratos.tratos)) expect(artes.tratos).toContain(id);
    for (const id of Object.keys(precos.precos)) expect(artes.precos).toContain(id);
    for (const id of Object.keys(noite.condicoes)) expect(artes.condicoes).toContain(id);
  });

  it('os PNGs existem em public/', () => {
    const grupos: [string, readonly string[]][] = [
      ['itens', artes.itens],
      ['poderes', [...artes.habilidades, ...Object.values(artes.passivas)]],
      ['retratos', artes.retratos],
      ['evolucoes', artes.evolucoes],
      ['tratos', artes.tratos],
      ['precos', artes.precos],
      ['marcas', artes.marcas],
      ['condicoes', artes.condicoes],
      ['hud', artes.hud],
    ];
    for (const [pasta, ids] of grupos)
      for (const id of ids) expect(existsSync(arquivo(pasta, id)), `${pasta}/${id}`).toBe(true);
  });
});
