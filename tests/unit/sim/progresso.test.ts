import { describe, expect, it } from 'vitest';
import {
  album,
  campeoes,
  entreRuns,
  evolucoes,
  habilidades,
  inimigos,
  itens,
  luaCheia,
  noite,
  precos,
  tratos,
} from '../../../src/sim/content';
import { idsDoDiario } from '../../../src/sim/diario';
import {
  campeaoLiberado,
  comprar,
  entradasDoAlbum,
  escolherCor,
  escreverProgresso,
  fracaoDoAlbum,
  lerProgresso,
  matizDaFantasia,
  opcoesDaRun,
  precoDaCompra,
  progressoNovo,
  registrarFim,
  sementeDoDia,
  tratosDoAlbum,
  type ConteudoDoProgresso,
  type Progresso,
} from '../../../src/sim/progresso';
import type { ResumoDaRun } from '../../../src/sim/run';

const C = { campeoes, itens, tratos };
const DIARIO = { tratos, precos, inimigos, noite, evolucoes, campeoes, habilidades, entreRuns };
const CP: ConteudoDoProgresso = {
  album,
  luaCheia,
  entreRuns,
  campeoes,
  tratos,
  diario: idsDoDiario(DIARIO),
};

function resumo(r: Partial<ResumoDaRun> = {}): ResumoDaRun {
  return {
    venceu: false,
    campeao: 'Bruxinha',
    campeaoId: 'bruxinha',
    onde: 'Rua 1',
    faltou: null,
    nivel: 3,
    evolucoes: [],
    tratos: [],
    conjuntos: [],
    precos: [],
    itens: [],
    medalhas: 0,
    ruasVencidas: 2,
    chefesVencidos: 0,
    derrotados: 40,
    docesGanhos: 500,
    relogio: '21:40',
    tempoS: 600,
    danoCausado: 9000,
    tratoIds: [],
    recusados: [],
    vistos: {
      tratos: [],
      precos: [],
      conjuntos: [],
      inimigos: [],
      condicoes: [],
      encontros: [],
      evolucoes: [],
    },
    xpTotal: 0,
    ofendido: null,
    lua: 0,
    moradora: null,
    docesGuardados: 50,
    ...r,
  };
}

function rico(): Progresso {
  const p = progressoNovo(album);
  p.docesGuardados = 100_000;
  return p;
}

describe('save do progresso', () => {
  it('começa do zero e volta igual depois de gravado', () => {
    const p = progressoNovo(album);
    p.docesGuardados = 123;
    p.paginas.push('pagina_luz');
    const lido = lerProgresso(escreverProgresso(p), album);
    expect(lido).toEqual(p);
  });

  it('texto ausente, quebrado, inválido ou de outra versão começa do zero', () => {
    const novo = progressoNovo(album);
    expect(lerProgresso(null, album)).toEqual(novo);
    expect(lerProgresso('{não é json', album)).toEqual(novo);
    expect(lerProgresso('{"versao": 1}', album)).toEqual(novo);
    const outra = { ...progressoNovo(album), versao: album.save.versao + 1, docesGuardados: 9 };
    expect(lerProgresso(JSON.stringify(outra), album)).toEqual(novo);
  });
});

describe('Álbum de Fantasias', () => {
  it('o Álbum cobre os 30 tratos (12 iniciais e 18 em páginas) e os itens que não são iniciais', () => {
    const nasPaginas = album.paginas.flatMap((g) => g.tratos);
    const todos = [...album.tratosIniciais, ...nasPaginas];
    expect(album.tratosIniciais).toHaveLength(12);
    expect(new Set(todos).size).toBe(todos.length);
    expect([...todos].sort()).toEqual(Object.keys(tratos.tratos).sort());
    const naoIniciais = Object.entries(itens.itens)
      .filter(([, d]) => d.tipo === 'item' && !d.inicial)
      .map(([id]) => id);
    expect(Object.keys(album.itens).sort()).toEqual(naoIniciais.sort());
    for (const id of Object.keys(album.campeoes))
      expect(campeoes[id]?.desbloqueio).not.toBe('inicial');
    for (const [id, cores] of Object.entries(album.cores)) {
      expect(campeoes[id]).toBeDefined();
      expect(cores).toHaveLength(2);
    }
  });

  it('só a Bruxinha começa liberada; comprar no Álbum libera antes do marco', () => {
    const p = rico();
    expect(Object.keys(campeoes).filter((id) => campeaoLiberado(p, campeoes, id))).toEqual([
      'bruxinha',
    ]);
    expect(comprar(p, album, { tipo: 'campeao', id: 'esqueleto' })).toBe(true);
    expect(campeaoLiberado(p, campeoes, 'esqueleto')).toBe(true);
    expect(precoDaCompra(p, album, { tipo: 'campeao', id: 'esqueleto' })).toBeNull();
  });

  it('comprar desconta os Doces Guardados e falha sem doces ou repetido', () => {
    const p = progressoNovo(album);
    const pagina = album.paginas[0]!;
    p.docesGuardados = pagina.preco - 1;
    expect(comprar(p, album, { tipo: 'pagina', id: pagina.id })).toBe(false);
    p.docesGuardados = pagina.preco + 10;
    expect(comprar(p, album, { tipo: 'pagina', id: pagina.id })).toBe(true);
    expect(p.docesGuardados).toBe(10);
    expect(comprar(p, album, { tipo: 'pagina', id: pagina.id })).toBe(false);
    expect(tratosDoAlbum(p, album)).toEqual([...album.tratosIniciais, ...pagina.tratos]);
  });

  it('cada bônus inicial sobe até o máximo, com um preço por nível', () => {
    const p = rico();
    const max = album.bonus.coragem.precos.length;
    for (let k = 0; k < max; k++)
      expect(comprar(p, album, { tipo: 'bonus', id: 'coragem' })).toBe(true);
    expect(comprar(p, album, { tipo: 'bonus', id: 'coragem' })).toBe(false);
    expect(p.bonus.coragem).toBe(max);
    const o = opcoesDaRun(p, CP, 'run', 'bruxinha');
    expect(o.bonus?.coragem).toBeCloseTo(album.bonus.coragem.mult * max);
  });

  it('a cor comprada pode ser escolhida e gira o matiz da fantasia', () => {
    const p = rico();
    const cor = album.cores['bruxinha']![0]!;
    expect(escolherCor(p, album, 'bruxinha', cor.id)).toBe(false);
    comprar(p, album, { tipo: 'cor', id: cor.id });
    expect(escolherCor(p, album, 'bruxinha', cor.id)).toBe(true);
    expect(matizDaFantasia(p, album, 'bruxinha')).toBe(cor.matiz);
    expect(escolherCor(p, album, 'fantasma', cor.id)).toBe(false);
    escolherCor(p, album, 'bruxinha', null);
    expect(matizDaFantasia(p, album, 'bruxinha')).toBe(0);
  });

  it('as linhas da tela listam tudo, e a fração cresce com as compras', () => {
    const p = rico();
    const linhas = entradasDoAlbum(p, album, C);
    const n =
      Object.keys(album.campeoes).length +
      album.paginas.length +
      Object.keys(album.itens).length +
      Object.keys(album.bonus).length +
      Object.values(album.cores).flat().length;
    expect(linhas).toHaveLength(n);
    expect(fracaoDoAlbum(p, album, C)).toBe(0);
    for (const l of linhas) while (comprar(p, album, l.compra));
    expect(fracaoDoAlbum(p, album, C)).toBe(1);
    expect(entradasDoAlbum(p, album, C).every((l) => l.preco === null)).toBe(true);
  });
});

describe('opções da run', () => {
  it('a run normal usa o Álbum; a semente da noite é igual para todos', () => {
    const p = rico();
    comprar(p, album, { tipo: 'item', id: 'ampulheta' });
    comprar(p, album, { tipo: 'bonus', id: 'doces' });
    p.luaLiberada = 3;
    p.luaEscolhida = 5;
    const run = opcoesDaRun(p, CP, 'run', 'bruxinha');
    expect(run.tratos).toEqual(album.tratosIniciais);
    expect(run.itensExtras).toEqual(['ampulheta']);
    expect(run.bonus?.doces).toBe(album.bonus.doces.soma);
    expect(run.lua).toBe(3);
    const noite = opcoesDaRun(p, CP, 'noite', 'bruxinha');
    expect(noite.tratos).toBeUndefined();
    expect(noite.itensExtras).toEqual(Object.keys(album.itens));
    expect(noite.bonus).toBeUndefined();
    expect(noite.lua).toBe(0);
  });
});

describe('fim da run', () => {
  it('guarda os doces; vencer os bairros 1 e 2 libera Fantasma e Esqueleto', () => {
    const p = progressoNovo(album);
    const a = registrarFim(p, resumo({ chefesVencidos: 1 }), CP, 'run');
    expect(p.docesGuardados).toBe(50);
    expect(a.campeoes).toEqual(['fantasma']);
    const b = registrarFim(p, resumo({ chefesVencidos: 2 }), CP, 'run');
    expect(b.campeoes).toEqual(['esqueleto']);
    expect(campeaoLiberado(p, campeoes, 'vampirinho')).toBe(false);
    expect(p.runs).toBe(2);
    expect(p.ultimoCampeao).toBe('bruxinha');
  });

  it('a primeira vitória libera o Vampirinho e a Lua Cheia 1; vencer no topo libera a próxima', () => {
    const p = progressoNovo(album);
    const v = registrarFim(p, resumo({ venceu: true, chefesVencidos: 3 }), CP, 'run');
    expect(v.campeoes).toEqual(['fantasma', 'esqueleto', 'vampirinho']);
    expect(v.lua).toBe(1);
    // Vencer abaixo do topo não libera nada novo.
    expect(registrarFim(p, resumo({ venceu: true, lua: 0 }), CP, 'run').lua).toBe(null);
    expect(registrarFim(p, resumo({ venceu: true, lua: 1 }), CP, 'run').lua).toBe(2);
    p.luaLiberada = luaCheia.niveis.length;
    expect(registrarFim(p, resumo({ venceu: true, lua: p.luaLiberada }), CP, 'run').lua).toBe(null);
    expect(p.luaLiberada).toBe(luaCheia.niveis.length);
  });

  it('a Noite curta conta o chefe vencido, mas não é a vitória da run', () => {
    const p = progressoNovo(album);
    const n = registrarFim(p, resumo({ venceu: true, chefesVencidos: 1 }), CP, 'curta');
    expect(n.campeoes).toEqual(['fantasma']);
    expect(p.vitorias).toBe(0);
    expect(n.lua).toBe(null);
    expect(campeaoLiberado(p, campeoes, 'vampirinho')).toBe(false);
  });

  it('a semente da noite guarda as 5 melhores tentativas do dia e só as últimas 7 noites', () => {
    const p = progressoNovo(album);
    const dia = '2026-10-15';
    for (let k = 0; k < 7; k++)
      registrarFim(p, resumo({ danoCausado: 1000 * k }), CP, 'noite', dia);
    const melhor = registrarFim(
      p,
      resumo({ chefesVencidos: 1, danoCausado: 10 }),
      CP,
      'noite',
      dia,
    );
    expect(melhor.lugarNaNoite).toBe(1);
    expect(p.noites[dia]).toHaveLength(5);
    expect(p.noites[dia]!.slice(1).map((x) => x.danoCausado)).toEqual([6000, 5000, 4000, 3000]);
    const pior = registrarFim(p, resumo({ danoCausado: 1 }), CP, 'noite', dia);
    expect(pior.lugarNaNoite).toBeNull();
    for (let d = 1; d <= 9; d++) registrarFim(p, resumo(), CP, 'noite', `2026-11-0${d}`);
    expect(Object.keys(p.noites)).toHaveLength(7);
    expect(p.noites[dia]).toBeUndefined();
  });

  it('a semente do dia é a mesma para a mesma data e muda de um dia para o outro', () => {
    expect(sementeDoDia('2026-10-15')).toBe(sementeDoDia('2026-10-15'));
    expect(sementeDoDia('2026-10-15')).not.toBe(sementeDoDia('2026-10-16'));
    expect(sementeDoDia('2026-10-15')).toBeGreaterThanOrEqual(0);
    expect(sementeDoDia('2026-10-15')).toBeLessThan(1_000_000);
  });
});
