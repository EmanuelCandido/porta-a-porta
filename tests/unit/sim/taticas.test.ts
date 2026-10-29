import { ondasPorTempo } from './ajuda';
import { describe, expect, it } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import {
  conteudo,
  gerador,
  habilidades,
  inimigos,
  luz as cfgLuz,
  modelos,
} from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import type { Projetil } from '../../../src/sim/habilidades';
import { passo, type Entidade } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import type { Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';
import { esquivar, flanquear, mirarAdiante, separar, sorteioFixo } from '../../../src/sim/taticas';

const taticas = inimigos.reacoes.taticas;
const defs = inimigos.inimigos;

/** Uma rua gerada sem ninguém por perto (os inimigos da rua vão para longe) e o jogador imune. */
function rua(semente = 3, bairro = 0): RuaDeLuta {
  const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro });
  const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('fantasma', conteudo), conteudo, semente, bolso, { bairro });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  for (const e of r.mundo.entidades)
    if (e.tipo === 'inimigo' && e.especie !== 'poste_corrompido') e.pos = { x: 0.5, y: 0.5 };
  return r;
}

function livre(r: RuaDeLuta, p: { x: number; y: number }) {
  const g = r.campo.grade;
  return g.ehLivre(p) ? p : g.centro(g.livreMaisPerto(p));
}

function rodar(r: RuaDeLuta, s: number, aCada?: (t: number) => void): void {
  for (let t = 0; t < s * 60; t++) {
    passo(r.mundo);
    aCada?.(t);
  }
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('táticas de todos', () => {
  it('sorteioFixo é determinístico e fica em [0, 1)', () => {
    expect(sorteioFixo(3, 7)).toBe(sorteioFixo(3, 7));
    expect(sorteioFixo(3, 7)).not.toBe(sorteioFixo(7, 3));
    for (let i = 0; i < 200; i++) {
      const v = sorteioFixo(i, i * 13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('separação: dois colados indo para o mesmo lado se afastam um do outro', () => {
    const r = rua();
    const j = r.jogador.pos;
    const a = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', livre(r, { x: j.x + 6, y: j.y }));
    const b = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: a.pos.x, y: a.pos.y + 0.3 });
    passo(r.mundo);
    const dir = { x: -1, y: 0 };
    const da = separar(r.mundo, a, dir, taticas.separacao);
    const db = separar(r.mundo, b, dir, taticas.separacao);
    // `a` está acima (y menor): vai mais para cima; `b`, para baixo. Os dois ainda avançam.
    expect(da.y).toBeLessThan(0);
    expect(db.y).toBeGreaterThan(0);
    expect(da.x).toBeLessThan(0);
    expect(db.x).toBeLessThan(0);
  });

  it('flanco: de longe, cada lado curva para um lado; de perto, todos vão reto', () => {
    const corpo = (id: number): Entidade =>
      ({ id, especie: 'pestinha_lencol', pos: { x: 8, y: 0 } }) as Entidade;
    const dir = { x: -1, y: 0 };
    const sempre = () => true;
    const lados = [0, 1, 2].map(
      (id) => flanquear(corpo(id), { x: 0, y: 0 }, dir, taticas.flanco, sempre).y,
    );
    expect(new Set(lados.map((y) => Math.sign(Math.round(y * 100))))).toEqual(new Set([-1, 0, 1]));
    const perto = { ...corpo(0), pos: { x: taticas.flanco.ate - 0.1, y: 0 } } as Entidade;
    expect(flanquear(perto, { x: 0, y: 0 }, dir, taticas.flanco, sempre)).toEqual(dir);
  });

  it('mira adiantada: o ponto anda com o alvo, na fração pedida', () => {
    const ovo = habilidades.find((h) => h.id === 'ovo')!;
    const alvo = {
      pos: { x: 5, y: 0 },
      posAnterior: { x: 5, y: -0.05 },
      velocidade: 3,
    } as Entidade;
    const parado = mirarAdiante(
      { x: 0, y: 0 },
      { ...alvo, posAnterior: alvo.pos } as Entidade,
      ovo,
      1,
      1 / 60,
    );
    expect(parado).toEqual(alvo.pos);
    const ponto = mirarAdiante({ x: 0, y: 0 }, alvo, ovo, 1, 1 / 60);
    const forma = ovo.forma as { velocidade: number };
    const t = ovo.lancamento + 5 / forma.velocidade;
    expect(ponto.x).toBeCloseTo(5, 6);
    expect(ponto.y).toBeCloseTo(3 * t, 6);
    expect(mirarAdiante({ x: 0, y: 0 }, alvo, ovo, 0.5, 1 / 60).y).toBeCloseTo(1.5 * t, 6);
  });

  it('esquiva: o projétil do jogador vindo reto vira um pulo de lado (uma vez por projétil)', () => {
    const r = rua();
    const j = r.jogador.pos;
    const e = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', livre(r, { x: j.x + 6, y: j.y }));
    passo(r.mundo);
    const pr = {
      id: 999,
      lado: 'jogador',
      pos: { x: e.pos.x - 2, y: e.pos.y },
      dir: { x: 1, y: 0 },
      velocidade: 10,
      largura: 0.4,
      restante: 6,
      golpe: null,
      alvo: null,
    } as unknown as Projetil;
    const cfg = { ...taticas.esquiva, chance: { pestinha_lencol: 1 } };
    const antes = { ...e.pos };
    expect(esquivar(r.mundo, e, [pr], cfg, () => true)).toBe(true);
    expect(e.forcado).toBeTruthy();
    expect(Math.abs(e.forcado!.dir.y)).toBeCloseTo(1, 6);
    expect(eventosDo(r.mundo.eventos, 'esquivou').some((ev) => ev.id === e.id)).toBe(true);
    rodar(r, 0.5);
    expect(Math.abs(e.pos.y - antes.y)).toBeGreaterThan(taticas.esquiva.distancia * 0.6);
    // Já sorteado: o mesmo projétil não faz pular de novo, e a recarga segura os próximos.
    expect(esquivar(r.mundo, e, [pr], cfg, () => true)).toBe(false);
    // Com chance 0, nunca.
    const outro = r.regras.criarInimigo(
      r.mundo,
      'pestinha_lencol',
      livre(r, { x: j.x + 4, y: j.y + 2 }),
    );
    passo(r.mundo);
    const pr2 = { ...pr, id: 1000, pos: { x: outro.pos.x - 2, y: outro.pos.y } } as Projetil;
    expect(esquivar(r.mundo, outro, [pr2], { ...cfg, chance: {} }, () => true)).toBe(false);
  });
});

describe('inimigos com estratégia', () => {
  ondasPorTempo();
  it('o Arremessador não fica parado: anda de lado na distância dele e continua atirando', () => {
    const r = rua();
    const j = r.jogador.pos;
    const p = defs['arremessador']!.param;
    const e = r.regras.criarInimigo(
      r.mundo,
      'arremessador',
      livre(r, { x: j.x + p['distancia']!, y: j.y }),
    );
    let andou = 0;
    let parado = 0;
    let amostras = 0;
    let ant = { ...e.pos };
    rodar(r, 6, (t) => {
      if (t % 10 !== 0) return;
      const d = dist(e.pos, ant);
      andou += d;
      if (d < 0.02) parado++;
      amostras++;
      ant = { ...e.pos };
    });
    expect(andou).toBeGreaterThan(3);
    expect(parado / amostras).toBeLessThan(0.5);
    expect(
      eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === e.id).length,
    ).toBeGreaterThan(1);
    expect(Math.abs(dist(e.pos, j) - p['distancia']!)).toBeLessThan(2.5);
  });

  it('a Abóbora-Canhão rola até o jogador de meia distância, com aviso', () => {
    const r = rua();
    const j = r.jogador.pos;
    const e = r.regras.criarInimigo(r.mundo, 'abobora_canhao', livre(r, { x: j.x + 4.5, y: j.y }));
    const d0 = dist(e.pos, j);
    rodar(r, 1.5);
    const avisos = eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === e.id);
    expect(avisos.some((a) => a.chave === 'rolada_abobora')).toBe(true);
    expect(dist(e.pos, j)).toBeLessThan(d0 - 2.5);
  });

  it('a Pestinha de Vela foge de quem chega perto', () => {
    const r = rua();
    const j = r.jogador.pos;
    const e = r.regras.criarInimigo(r.mundo, 'pestinha_vela', livre(r, { x: j.x + 1.5, y: j.y }));
    rodar(r, 1.5);
    expect(dist(e.pos, j)).toBeGreaterThan(defs['pestinha_vela']!.param['fugaDe']!);
  });

  it('o Poste Corrompido apanha no escuro e responde: alerta, tiros e pulso de perto', () => {
    const r = rua();
    const poste = r.regras.estado.postes[0]!;
    const p = defs['poste_corrompido']!.param;
    const longe = { x: poste.pos.x + p['visaoNaSombra']! + 0.6, y: poste.pos.y };
    r.jogador.pos = livre(r, longe);
    expect(r.luz.iluminado(r.jogador.pos)).toBe(false);
    rodar(r, 2);
    expect(eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === poste.id)).toHaveLength(0);
    // Apanhou de longe: agora atira em quem bateu, mesmo no escuro.
    causarDano(r.mundo, poste, { origem: r.jogador.id, bruto: 5, tipo: 'habilidade' });
    r.mundo.eventos = [];
    rodar(r, 3);
    const tiros = eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === poste.id);
    expect(tiros.filter((a) => a.chave === 'tiro_poste').length).toBeGreaterThanOrEqual(2);
    expect(eventosDo(r.mundo.eventos, 'grito').some((g) => g.id === poste.id)).toBe(true);
    // De perto, o pulso em volta dele.
    r.jogador.pos = livre(r, { x: poste.pos.x + 1.4, y: poste.pos.y });
    r.mundo.eventos = [];
    rodar(r, 2);
    expect(
      eventosDo(r.mundo.eventos, 'anunciou').some(
        (a) => a.id === poste.id && a.chave === 'pulso_poste',
      ),
    ).toBe(true);
  });

  it('abaixo da metade, o Poste chama pestinhas uma vez', () => {
    const r = rua();
    const poste = r.regras.estado.postes[0]!;
    const c = poste.combate!;
    const antes = r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length;
    c.coragem = c.attr.coragemMax * 0.4;
    rodar(r, 0.2);
    const depois = r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length;
    expect(depois - antes).toBe(defs['poste_corrompido']!.param['pestinhasAjuda']);
    rodar(r, 1);
    expect(r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length).toBe(depois);
  });

  it('as ondas chegam espalhadas em volta do jogador, não em fila', () => {
    let soma = 0;
    let n = 0;
    for (const semente of [3, 7, 11]) {
      const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro: 1 });
      const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
      const r = montarRua(g, criarFicha('bruxinha', conteudo), conteudo, semente, bolso, {
        bairro: 1,
      });
      r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
      rodar(r, 70, (t) => {
        if (t % 10 !== 0) return;
        const j = r.jogador.pos;
        const perto = r.mundo.entidades.filter(
          (e) => e.especie === 'pestinha_lencol' && e.combate!.coragem > 0 && dist(e.pos, j) < 5,
        );
        if (perto.length < 3) return;
        const setores = new Set(
          perto.map((e) =>
            Math.floor(((Math.atan2(e.pos.y - j.y, e.pos.x - j.x) + Math.PI) / (2 * Math.PI)) * 8),
          ),
        );
        soma += setores.size / Math.min(8, perto.length);
        n++;
      });
    }
    expect(n).toBeGreaterThan(100);
    expect(soma / n).toBeGreaterThan(0.78);
  }, 120_000);
});
