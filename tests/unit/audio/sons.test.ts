import { describe, expect, it } from 'vitest';
import { fatorDeSemitons } from '../../../src/game/audio/mixer';
import { SequenciaDeAcertos, sonsDosEventos } from '../../../src/game/audio/sons';
import { audio, campeoes } from '../../../src/sim/content';
import type { Evento } from '../../../src/sim/eventos';

const dano: Extract<Evento, { tipo: 'dano' }> = {
  tipo: 'dano',
  origem: 1,
  alvo: 2,
  valor: 20,
  absorvido: 0,
  critico: false,
  golpe: 'habilidade',
  comAviso: false,
  pos: { x: 0, y: 0 },
};
const ctx = (agoraS = 0, campeao = 'bruxinha') => ({ jogador: 1, campeao, agoraS });
const sons = (eventos: Evento[], seq = new SequenciaDeAcertos(), agoraS = 0) =>
  sonsDosEventos(eventos, ctx(agoraS), seq, audio);

describe('sons dos eventos', () => {
  it('uma área que acerta vários inimigos toca um acerto só, e o crítico toma o lugar dele', () => {
    expect(sons([dano, { ...dano, alvo: 3 }, { ...dano, alvo: 4 }])).toEqual([
      { som: 'acerto', semitons: 0 },
    ]);
    expect(sons([dano, { ...dano, alvo: 3, critico: true }]).map((s) => s.som)).toEqual([
      'critico',
    ]);
  });

  it('acertos seguidos em até 2 s sobem de tom, até 3 degraus, e uma pausa volta ao começo', () => {
    const seq = new SequenciaDeAcertos();
    const { janelaS, degraus, semitonsPorDegrau } = audio.acertoSeguido;
    const tons = [0, 0.5, 1, 1.5, 2].map((t) => sons([dano], seq, t)[0]!.semitons);
    expect(tons).toEqual([0, 1, 2, 3, 3].map((d) => Math.min(d, degraus) * semitonsPorDegrau));
    expect(sons([dano], seq, 2 + janelaS + 0.1)[0]!.semitons).toBe(0);
  });

  it('dano no jogador, auto-ataque e golpe que não feriu', () => {
    expect(sons([{ ...dano, origem: 2, alvo: 1 }]).map((s) => s.som)).toEqual(['danoJogador']);
    expect(sons([{ ...dano, golpe: 'autoAtaque' }]).map((s) => s.som)).toEqual(['acertoAuto']);
    expect(sons([{ ...dano, valor: 0 }])).toEqual([]);
  });

  it('cada campeão tem o próprio timbre ao lançar, e cada tecla muda o tom', () => {
    for (const id of Object.keys(campeoes)) expect(audio.sons[`lancar_${id}`], id).toBeDefined();
    const lancou = (tecla: string, eco = false): Evento => ({
      tipo: 'lancou',
      id: 1,
      tecla,
      alvo: { x: 0, y: 0 },
      fortalecida: false,
      eco,
    });
    const r = sonsDosEventos([lancou('R')], ctx(0, 'fantasma'), new SequenciaDeAcertos(), audio);
    expect(r).toEqual([{ som: 'lancar_fantasma', semitons: audio.semitonsPorTecla.R }]);
    // O eco de um trato não toca de novo.
    expect(sons([lancou('Q', true)])).toEqual([]);
  });

  it('Poste caindo, doce, Frenesi, aviso vermelho, nível e portão têm som', () => {
    const r = sons([
      { tipo: 'posteCaiu', id: 9, pos: { x: 0, y: 0 }, indice: 0 },
      { tipo: 'pegouDoce', valor: 3, pos: { x: 0, y: 0 } },
      { tipo: 'frenesi', ativo: true },
      { tipo: 'anunciou', id: 7, chave: 'pancada', alvo: { x: 0, y: 0 }, duracao: 0.6 },
      { tipo: 'nivel', id: 1, nivel: 2 },
      { tipo: 'portaoAbriu', pos: { x: 0, y: 0 } },
    ]);
    expect(r.map((s) => s.som)).toEqual([
      'posteCaiu',
      'doce',
      'frenesi',
      'aviso',
      'nivel',
      'portao',
    ]);
    // O fim do Frenesi e o anúncio do próprio jogador ficam quietos.
    expect(
      sons([
        { tipo: 'frenesi', ativo: false },
        { tipo: 'anunciou', id: 1, chave: 'q', alvo: { x: 0, y: 0 }, duracao: 0.5 },
      ]),
    ).toEqual([]);
  });

  it('todos os sons pedidos existem no conteúdo, inclusive os da interface', () => {
    for (const nome of ['trato', 'compra', 'clique', 'danoJogador', 'critico', 'acertoAuto'])
      expect(audio.sons[nome], nome).toBeDefined();
    expect(fatorDeSemitons(12)).toBeCloseTo(2);
    expect(fatorDeSemitons(0)).toBe(1);
  });
});

describe('sons próprios da Bruxinha', () => {
  const lancou = (tecla: string): Evento => ({
    tipo: 'lancou',
    id: 1,
    tecla,
    alvo: { x: 0, y: 0 },
    fortalecida: false,
    eco: false,
  });

  it('cada feitiço tem o seu som; quem não tem som próprio usa o timbre do campeão', () => {
    for (const t of ['Q', 'W', 'E', 'R'])
      expect(sons([lancou(t)]).map((s) => s.som)).toEqual([`bruxinha_lancar_${t}`]);
    const fantasma = sonsDosEventos(
      [lancou('Q')],
      ctx(0, 'fantasma'),
      new SequenciaDeAcertos(),
      audio,
    );
    expect(fantasma.map((s) => s.som)).toEqual(['lancar_fantasma']);
  });

  it('estouro da Vassoura, pouso do Salto e cada onda da Chuva', () => {
    const estouro = (chave: string): Evento => ({
      tipo: 'estouro',
      dono: 1,
      chave,
      lado: 'jogador',
      centro: { x: 0, y: 0 },
      raio: 1,
    });
    expect(sons([estouro('Q')])[0]!.som).toBe('bruxinha_estouro_Q');
    expect(sons([estouro('E')])[0]!.som).toBe('bruxinha_estouro_E');
    const onda: Evento = {
      tipo: 'pulso',
      tecla: 'R',
      lado: 'jogador',
      centro: { x: 0, y: 0 },
      raio: 3,
      dono: 1,
      final: false,
    };
    expect(sons([onda])[0]!.som).toBe('bruxinha_pulso_R');
  });

  it('o golpe é um plim que sobe de tom no combo', () => {
    const golpe = (combo: number): Evento => ({
      tipo: 'golpeou',
      id: 1,
      combo,
      final: combo === 2,
      x: 1,
      y: 0,
      acertos: 0,
    });
    expect(sons([golpe(0)])).toEqual([{ som: 'bruxinha_golpe', semitons: 0 }]);
    expect(sons([golpe(1)])).toEqual([{ som: 'bruxinha_golpe', semitons: audio.semitonsPorGolpe }]);
    expect(sons([golpe(2)])[0]!.som).toBe('bruxinha_golpeFinal');
  });
});

describe('sons dos objetos quebráveis', () => {
  it('o golpe num objeto toca o material, não o acerto; quebrar tem som próprio', () => {
    const atingido: Evento = {
      tipo: 'objetoAtingido',
      id: 5,
      objeto: 0,
      material: 'metal',
      pos: { x: 0, y: 0 },
    };
    expect(sons([{ ...dano, objeto: true }, atingido]).map((s) => s.som)).toEqual(['bater_metal']);
    for (const material of ['metal', 'madeira', 'abobora', 'plastico']) {
      expect(audio.sons[`bater_${material}`], material).toBeDefined();
      const q: Evento = {
        tipo: 'quebrou',
        id: 5,
        objeto: 0,
        especie: 'lixeira',
        material,
        pos: { x: 0, y: 0 },
      };
      expect(sons([q])[0]!.som).toBe(`quebrar_${material}`);
    }
  });
});

describe('sons que faltavam (Codex: campainha, lanterna, baú, chefes e avisos por ameaça)', () => {
  const nomes = (evs: Evento[], familia?: (id: number, chave: string) => string | null) =>
    sonsDosEventos(
      evs,
      { jogador: 1, campeao: 'bruxinha', agoraS: 0, familiaDoAtaque: familia },
      new SequenciaDeAcertos(),
      audio,
    ).map((p) => p.som);
  const p = { x: 0, y: 0 };

  it('campainha, lanterna, baú raro, baú aberto, Abóbora Dourada e fase de chefe', () => {
    expect(
      nomes([
        { tipo: 'campainha', indice: 0, objeto: 0, pos: p, resultado: 'doces', texto: '' },
        { tipo: 'pulsoLanterna', pos: p, raio: 3 },
        { tipo: 'bauRevelado', id: 9, tipoBau: 'raro', pos: p },
        { tipo: 'bauAberto', id: 9, pos: p, doces: 10, item: null },
        { tipo: 'segredo', indice: 0, pos: p, achados: 1, total: 3 },
        { tipo: 'faseChefe', fase: 2, nome: 'Síndico' },
      ] as Evento[]),
    ).toEqual(['campainha', 'lanterna', 'bauRaro', 'bauAberto', 'segredo', 'faseChefe']);
  });

  it('inimigo derrotado e ataque interrompido têm som; a morte do jogador não usa o do inimigo', () => {
    expect(nomes([{ tipo: 'derrotado', id: 5, por: 1, pos: p }])).toEqual(['derrotado']);
    expect(nomes([{ tipo: 'derrotado', id: 1, por: 5, pos: p }])).toEqual([]);
    expect(nomes([{ tipo: 'interrompeu', por: 1, id: 5, pos: p }])).toEqual(['interrompeu']);
  });

  it('cada família de ameaça tem o próprio aviso; sem família, o aviso comum', () => {
    const anuncio = (chave: string): Evento =>
      ({ tipo: 'anunciou', id: 5, chave, alvo: p, duracao: 0.5 }) as Evento;
    const familias: Record<string, string> = {
      a: 'area',
      b: 'linha',
      c: 'investida',
      d: 'golpe',
      e: 'chefe',
    };
    for (const [chave, familia] of Object.entries(familias))
      expect(nomes([anuncio(chave)], (_id, k) => familias[k] ?? null)).toEqual([
        `aviso_${familia}`,
      ]);
    expect(nomes([anuncio('x')])).toEqual(['aviso']);
  });

  it('nenhum som de ação usa um arquivo que é de outra coisa (moedas, faca, tecido, interface)', () => {
    const arquivos = audio.arquivos!.sons;
    const proibidos: Record<string, RegExp> = {
      doce: /Coins/,
      bruxinha_lancar_Q: /Knife/,
      bruxinha_lancar_W: /cloth/,
      bruxinha_golpe: /glass_/,
      lancar_fantasma: /maximize/,
      lancar_vampirinho: /Knife/,
      trato: /confirmation/,
    };
    for (const [som, re] of Object.entries(proibidos))
      for (const f of arquivos[som]?.arquivos ?? []) expect(f, som).not.toMatch(re);
  });
});
