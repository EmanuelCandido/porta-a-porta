import { ondasPorTempo } from './ajuda';
import { describe, expect, it } from 'vitest';
import { alvosDeGolpe, causarDano, vivo } from '../../../src/sim/combate';
import {
  conteudo,
  gerador,
  inimigos,
  luz as cfgLuz,
  modelos,
  ondas,
} from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import { passo, type Entidade } from '../../../src/sim/mundo';
import { criarFicha, eventosDo, type Conteudo } from '../../../src/sim/partida';
import type { Bolso, OpcoesRua } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';

const MORCEGO = inimigos.inimigos['morceguinho']!;
const SACO = inimigos.inimigos['saco_surpresa']!;

function rua(c: Conteudo = conteudo, opcoes: Partial<OpcoesRua> = {}, semente = 3): RuaDeLuta {
  const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro: 0 });
  const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('fantasma', c), c, semente, bolso, {
    bairro: 0,
    semEncantos: true,
    ...opcoes,
  });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  for (const e of r.mundo.entidades)
    if (
      e.tipo === 'inimigo' &&
      !['poste_corrompido', 'saco_surpresa', 'espantalho'].includes(e.especie)
    )
      e.pos = { x: 0.5, y: 0.5 };
  return r;
}

function rodar(r: RuaDeLuta, s: number, aCada?: () => void): void {
  for (let t = 0; t < s * 60; t++) {
    passo(r.mundo);
    aCada?.();
  }
}

function livre(r: RuaDeLuta, p: { x: number; y: number }) {
  const g = r.campo.grade;
  return g.ehLivre(p) ? p : g.centro(g.livreMaisPerto(p));
}

describe('Morceguinho', () => {
  it('voa alto sem levar golpe, mergulha anunciado e fica baixo um tempo antes de subir', () => {
    const r = rua();
    const j = r.jogador.pos;
    const m = r.regras.criarInimigo(r.mundo, 'morceguinho', livre(r, { x: j.x + 3, y: j.y }));
    passo(r.mundo);
    expect(m.marcas?.voando).toBe(true);
    expect(alvosDeGolpe(r.mundo, 'jogador')).not.toContain(m);
    let anunciou = false;
    let baixo = false;
    let subiuDeNovo = false;
    rodar(r, 8, () => {
      if (eventosDo(r.mundo.eventos, 'anunciou').some((a) => a.id === m.id)) anunciou = true;
      const ia = m.ia as { estado?: string };
      if (ia.estado === 'baixo') {
        baixo = true;
        expect(alvosDeGolpe(r.mundo, 'jogador')).toContain(m);
      }
      if (baixo && ia.estado === 'alto') subiuDeNovo = true;
    });
    expect(anunciou).toBe(true);
    expect(baixo).toBe(true);
    expect(subiuDeNovo).toBe(true);
    expect(MORCEGO.param['baixoS']).toBeGreaterThan(0.4);
  });
});

describe('Saco-Surpresa', () => {
  it('a rua troca algumas lixeiras por sacos disfarçados (longe da entrada)', () => {
    const r = rua();
    const sacos = r.mundo.entidades.filter((e) => e.especie === 'saco_surpresa');
    expect(sacos.length).toBeGreaterThanOrEqual(inimigos.sacosPorRua[0]);
    expect(sacos.length).toBeLessThanOrEqual(inimigos.sacosPorRua[1]);
    for (const s of sacos) {
      expect(s.marcas?.disfarcado).toBe(true);
      expect(s.marcas?.visual).toBe('lixeira');
    }
    expect(eventosDo(r.mundo.eventos, 'objetoVirou').length).toBe(sacos.length);
  });

  it('acorda com o jogador perto, morde, foge e se disfarça de novo', () => {
    const r = rua();
    const j = r.jogador.pos;
    const s = r.regras.criarInimigo(r.mundo, 'saco_surpresa', livre(r, { x: j.x + 5, y: j.y }));
    rodar(r, 1);
    expect((s.ia as { estado?: string }).estado).toBe('disfarce');
    r.jogador.pos = { x: s.pos.x - 1.2, y: s.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    passo(r.mundo);
    expect((s.ia as { estado?: string }).estado).toBe('ataque');
    expect(s.marcas?.visual).toBe('saco_surpresa');
    let fugiu = false;
    rodar(r, SACO.param['ataqueS']! + SACO.param['fugaS']! + 1, () => {
      if ((s.ia as { estado?: string }).estado === 'fuga') fugiu = true;
    });
    expect(fugiu).toBe(true);
    expect((s.ia as { estado?: string }).estado).toBe('disfarce');
    expect(s.marcas?.disfarcado).toBe(true);
  });

  it('um golpe no disfarce acorda o saco', () => {
    const r = rua();
    const j = r.jogador.pos;
    const s = r.regras.criarInimigo(r.mundo, 'saco_surpresa', livre(r, { x: j.x + 5, y: j.y }));
    passo(r.mundo);
    causarDano(r.mundo, s, { origem: r.jogador.id, bruto: 5, tipo: 'autoAtaque' });
    passo(r.mundo);
    expect((s.ia as { estado?: string }).estado).toBe('ataque');
  });
});

describe('inimigos encantados', () => {
  const comEncanto = (tipo: string): Conteudo => ({
    ...conteudo,
    inimigos: {
      ...inimigos,
      encantos: { ...inimigos.encantos, chance: 1, pesos: { [tipo]: 1 } },
    },
  });
  const nascer = (r: RuaDeLuta, x = 3): Entidade =>
    r.regras.criarInimigo(
      r.mundo,
      'pestinha_lencol',
      livre(r, { x: r.jogador.pos.x + x, y: r.jogador.pos.y }),
    );

  it('Encouraçado: o escudo aguenta os primeiros golpes inteiros', () => {
    const r = rua(comEncanto('encouracado'), { semEncantos: false });
    const p = nascer(r);
    expect(p.marcas?.encanto).toBe('encouracado');
    const cheia = p.combate!.coragem;
    for (let i = 0; i < inimigos.encantos.encouracado.golpes; i++)
      causarDano(r.mundo, p, { origem: r.jogador.id, bruto: 10, tipo: 'autoAtaque' });
    expect(p.combate!.coragem).toBe(cheia);
    expect(eventosDo(r.mundo.eventos, 'escudoBateu')).toHaveLength(
      inimigos.encantos.encouracado.golpes,
    );
    causarDano(r.mundo, p, { origem: r.jogador.id, bruto: 10, tipo: 'autoAtaque' });
    expect(p.combate!.coragem).toBeLessThan(cheia);
  });

  it('Apressado: anda mais rápido', () => {
    const r = rua(comEncanto('apressado'), { semEncantos: false });
    const p = nascer(r);
    expect(p.combate!.attr.velocidade).toBeCloseTo(1 + inimigos.encantos.apressado.velocidade, 6);
  });

  it('Explosivo: ao cair, avisa em vermelho e estoura no jogador perto', () => {
    const r = rua(comEncanto('explosivo'), { semEncantos: false });
    r.jogador.combate!.estados = [];
    const p = nascer(r, 1);
    p.velocidade = 0;
    const antes = r.jogador.combate!.coragem;
    p.combate!.coragem = 0.01;
    // O golpe sai dentro de um tick (as regras veem a queda).
    const sistemas = r.mundo.sistemas as { antesDeMover?: (m: typeof r.mundo) => void }[];
    const s = {
      antesDeMover: () =>
        causarDano(r.mundo, p, { origem: r.jogador.id, bruto: 5, tipo: 'autoAtaque' }),
    };
    sistemas.unshift(s);
    passo(r.mundo);
    sistemas.shift();
    const aviso = eventosDo(r.mundo.eventos, 'avisoExplosao').at(-1)!;
    expect(aviso.lado).toBe('inimigo');
    expect(aviso.segundos).toBeGreaterThanOrEqual(0.4);
    rodar(r, inimigos.encantos.explosivo.avisoS + 0.1);
    expect(r.jogador.combate!.coragem).toBeLessThan(antes);
  });

  it('Chamador: ao ver o jogador, chama aliados uma vez só', () => {
    const r = rua(comEncanto('chamador'), { semEncantos: false });
    const p = nascer(r, 3);
    p.velocidade = 0;
    const contar = () =>
      r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol' && vivo(e)).length;
    const antes = contar();
    rodar(r, 0.5);
    expect(p.marcas?.chamou).toBe(true);
    expect(contar()).toBeGreaterThanOrEqual(antes + inimigos.encantos.chamador.n);
    const depois = contar();
    rodar(r, 1);
    expect(contar()).toBeLessThanOrEqual(depois);
  });
});

describe('enxame de morceguinhos nas ondas', () => {
  ondasPorTempo();
  it('com a chance cheia, a onda traz o enxame', () => {
    const c: Conteudo = {
      ...conteudo,
      ondas: {
        ...ondas,
        primeiraEm: 0.1,
        enxame: { ...ondas.enxame, desdeOnda: 1, chancePorBairro: [1] },
      },
    };
    const r = rua(c);
    rodar(r, 3);
    const morcegos = r.mundo.entidades.filter((e) => e.especie === 'morceguinho');
    expect(morcegos.length).toBeGreaterThanOrEqual(ondas.enxame.n);
  });
});

describe('Espantalho de Quintal', () => {
  const ESPANTALHO = inimigos.inimigos['espantalho']!;

  it('fincado, joga palha anunciada que deixa lento em quem chega à vista', () => {
    const r = rua();
    const j = r.jogador.pos;
    const e = r.regras.criarInimigo(r.mundo, 'espantalho', livre(r, { x: j.x + 4, y: j.y }));
    const inicio = { ...e.pos };
    r.jogador.combate!.estados = [];
    let anunciou = false;
    let lento = false;
    rodar(r, 4, () => {
      if (eventosDo(r.mundo.eventos, 'anunciou').some((a) => a.id === e.id)) anunciou = true;
      if (r.jogador.combate!.estados.some((s) => s.tipo === 'lentidao')) lento = true;
    });
    expect(anunciou).toBe(true);
    expect(lento).toBe(true);
    expect(e.pos).toEqual(inicio);
    expect(ESPANTALHO.velocidade).toBe(0);
  });

  it('quando apanha, troca de lugar com o outro espantalho', () => {
    const r = rua();
    const j = r.jogador.pos;
    const a = r.regras.criarInimigo(r.mundo, 'espantalho', livre(r, { x: j.x + 3, y: j.y }));
    const b = r.regras.criarInimigo(r.mundo, 'espantalho', livre(r, { x: j.x - 3, y: j.y }));
    const pa = { ...a.pos };
    const pb = { ...b.pos };
    passo(r.mundo);
    causarDano(r.mundo, a, { origem: r.jogador.id, bruto: 10, tipo: 'autoAtaque' });
    passo(r.mundo);
    expect(a.pos).toEqual(pb);
    expect(b.pos).toEqual(pa);
    // Logo depois, outro golpe não troca de novo (espera `trocaS`).
    causarDano(r.mundo, a, { origem: r.jogador.id, bruto: 10, tipo: 'autoAtaque' });
    passo(r.mundo);
    expect(a.pos).toEqual(pb);
  });

  it('a rua às vezes põe um par de espantalhos num quintal', () => {
    let achou = 0;
    for (let s = 1; s <= 8; s++) {
      const r = rua(conteudo, {}, s);
      const qs = r.gerada.quintais;
      const es = r.mundo.entidades.filter((e) => e.especie === 'espantalho');
      if (es.length === 0) continue;
      achou++;
      expect(es).toHaveLength(ondas.espantalhos.n);
      const dentro = (p: { x: number; y: number }) =>
        qs.some(
          (q) => p.x >= q.area.x0 && p.x <= q.area.x1 && p.y >= q.area.y0 && p.y <= q.area.y1,
        );
      expect(es.every((e) => dentro(e.pos))).toBe(true);
    }
    expect(achou).toBeGreaterThan(0);
  });
});

describe('Pestinha de Vela', () => {
  const VELA = inimigos.inimigos['pestinha_vela']!;

  it('carrega uma luz e deixa os aliados perto mais fortes; caída, a aura e a luz somem', () => {
    const r = rua();
    const j = r.jogador.pos;
    const v = r.regras.criarInimigo(r.mundo, 'pestinha_vela', livre(r, { x: j.x + 5, y: j.y }));
    const aliado = r.regras.criarInimigo(
      r.mundo,
      'pestinha_lencol',
      livre(r, { x: v.pos.x + 1, y: v.pos.y }),
    );
    const longe = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: 0.5, y: 0.5 });
    const danoBase = longe.combate!.attr.dano;
    passo(r.mundo);
    expect(aliado.marcas?.iluminado).toBe(true);
    expect(aliado.combate!.attr.dano).toBeCloseTo(danoBase * (1 + VELA.param['danoAura']!));
    expect(longe.marcas?.iluminado).toBeFalsy();
    expect(r.regras.luz.fontes.some((f) => f.segue === v.id)).toBe(true);
    v.combate!.coragem = 0;
    rodar(r, 0.5);
    expect(aliado.marcas?.iluminado).toBe(false);
    expect(aliado.combate!.attr.dano).toBeCloseTo(danoBase);
    expect(r.regras.luz.fontes.some((f) => f.segue === v.id)).toBe(false);
  });

  it('não ataca e fica longe do jogador, atrás do grupo', () => {
    const r = rua();
    const j = r.jogador.pos;
    const v = r.regras.criarInimigo(r.mundo, 'pestinha_vela', livre(r, { x: j.x + 1.5, y: j.y }));
    rodar(r, 3);
    const d = Math.hypot(v.pos.x - r.jogador.pos.x, v.pos.y - r.jogador.pos.y);
    expect(d).toBeGreaterThan(VELA.param['distancia']! - 1.5);
    expect(eventosDo(r.mundo.eventos, 'dano').some((x) => x.origem === v.id)).toBe(false);
  });
});
