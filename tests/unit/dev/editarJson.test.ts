import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { destinoDoAjuste, editarJson } from '../../../src/game/dev/editarJson';
import { gravarAjustes } from '../../../vite.ajustes';

const exemplo = `{
  "nome": "Bruxinha",
  "coragem": 126,
  "rolamento": { "distancia": 2.5, "velocidade": 12 },
  "habilidades": [
    { "id": "a", "recarga": [6, 6, 6], "efeitos": [{ "tipo": "dano", "base": [60, 90] }] },
    { "id": "b", "recarga": [12, 12] }
  ]
}
`;

describe('editarJson (gravar os ajustes do modo dev no content)', () => {
  it('troca só o número pedido e deixa o resto do texto igual', () => {
    const novo = editarJson(exemplo, ['rolamento', 'distancia'], 3)!;
    expect(novo).toBe(exemplo.replace('"distancia": 2.5', '"distancia": 3'));
  });

  it('acha itens de lista pelo id e troca listas de números', () => {
    const novo = editarJson(exemplo, ['habilidades', 'b', 'recarga'], [3, 3])!;
    expect(JSON.parse(novo).habilidades[1].recarga).toEqual([3, 3]);
    expect(JSON.parse(novo).habilidades[0].recarga).toEqual([6, 6, 6]);
    const dano = editarJson(exemplo, ['habilidades', 'a', 'efeitos', '0', 'base'], [70, 95])!;
    expect(JSON.parse(dano).habilidades[0].efeitos[0].base).toEqual([70, 95]);
  });

  it('um campo que o esquema completa com o padrão entra no objeto', () => {
    const novo = editarJson(exemplo, ['habilidades', 'b', 'cargas'], 2)!;
    expect(JSON.parse(novo).habilidades[1]).toEqual({ id: 'b', recarga: [12, 12], cargas: 2 });
  });

  it('caminho que não existe não grava nada', () => {
    expect(editarJson(exemplo, ['habilidades', 'z', 'recarga'], 1)).toBeNull();
    expect(editarJson(exemplo, ['rolamento'], 1)).toBeNull();
  });

  it('cada raiz do painel aponta para o arquivo certo', () => {
    expect(destinoDoAjuste({ raiz: 'habilidades', caminho: ['bruxinha_q', 'custo'] })).toEqual({
      arquivo: 'habilidades.json',
      caminho: ['habilidades', 'bruxinha_q', 'custo'],
    });
  });
});

describe('gravarAjustes (servidor do npm run dev)', () => {
  let pasta = '';
  afterEach(async () => {
    if (pasta) await rm(pasta, { recursive: true, force: true });
  });

  it('grava no content e só a linha do número muda (formatação do projeto)', async () => {
    pasta = await mkdtemp(join(tmpdir(), 'porta-dev-'));
    await mkdir(join(pasta, 'content'));
    const original = join(process.cwd(), 'content', 'habilidades.json');
    const copia = join(pasta, 'content', 'habilidades.json');
    await copyFile(original, copia);
    // A formatação do projeto (largura 100) vem do .prettierrc.json da raiz.
    await copyFile(join(process.cwd(), '.prettierrc.json'), join(pasta, '.prettierrc.json'));
    const r = await gravarAjustes(pasta, [
      { raiz: 'habilidades', caminho: ['bruxinha_q', 'recarga'], valor: [4, 4, 4, 4, 4] },
    ]);
    expect(r.falhas).toEqual([]);
    expect(r.arquivos).toEqual(['content/habilidades.json']);
    const antes = (await readFile(original, 'utf8')).split('\n');
    const depois = (await readFile(copia, 'utf8')).split('\n');
    expect(depois).toHaveLength(antes.length);
    const diferentes = depois.filter((l, i) => l !== antes[i]);
    expect(diferentes).toEqual(['      "recarga": [4, 4, 4, 4, 4],']);
  });
});
