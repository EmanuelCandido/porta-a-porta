import { describe, expect, it } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import {
  conteudo,
  exploracao as cfg,
  gerador,
  luz as cfgLuz,
  modelos,
  noite,
} from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import { girar, type V2 } from '../../../src/sim/geometria';
import { Minijogo, type TipoMinijogo } from '../../../src/sim/minijogos';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import type { Bolso, OpcoesRua } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';
import { rodar } from './ajuda';

function novaRua(semente = 3, extra: Partial<OpcoesRua> = {}): RuaDeLuta {
  const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro: 0 });
  const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('bruxinha', conteudo), conteudo, semente, bolso, {
    bairro: 0,
    ...extra,
  });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  return r;
}

function levar(r: RuaDeLuta, p: V2): void {
  r.jogador.pos = { ...p };
  r.jogador.posAnterior = { ...p };
}

function interagir(r: RuaDeLuta): void {
  enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
  passo(r.mundo);
}

/**
 * Joga o minijogo da porta (a rua fica parada): com a resposta certa (perfeito) ou sem responder
 * (erro). O passo seguinte aplica o resultado.
 */
function jogarMinijogo(r: RuaDeLuta, acertar = true): void {
  const m = r.regras.exploracao!.minijogo!;
  for (let k = 0; k < 60 * 20 && !m.terminou; k++) {
    const e = acertar ? m.respostaCerta() : null;
    if (e) m.entrar(e);
    m.passo();
  }
  passo(r.mundo);
}

/** O minijogo que a campainha `c` abriria no nível `nivel` (para comparar a dificuldade). */
function minijogoNoNivel(
  r: RuaDeLuta,
  c: { minijogo: TipoMinijogo; semente: number },
  nivel: number,
  folga = 1,
): Minijogo {
  return new Minijogo(c.minijogo, cfg.desconfiada.minijogos, c.semente, r.mundo.dt, {
    bairro: nivel,
    folga,
    fantasia: r.jogador.especie,
    fantasias: Object.keys(conteudo.campeoes),
  });
}

/** Tira os inimigos do mapa (para os testes de exploração não virarem luta). */
function semInimigos(r: RuaDeLuta): void {
  for (const e of r.mundo.entidades)
    if (e.tipo === 'inimigo' && e.especie !== 'poste_corrompido') e.pos = { x: 0.5, y: 0.5 };
}

describe('névoa do mapa', () => {
  it('começa revelada só em volta da entrada e abre por onde o jogador anda', () => {
    const r = novaRua();
    const ex = r.regras.exploracao!;
    const inicio = ex.fracao();
    expect(inicio).toBeGreaterThan(0);
    expect(inicio).toBeLessThan(0.05);
    expect(ex.revelado(r.jogador.pos)).toBe(true);
    const longe = r.gerada.rota.at(-2)!;
    expect(ex.revelado(longe)).toBe(false);
    for (const p of r.gerada.rota.slice(1, 5)) {
      levar(r, p);
      rodar(r.mundo, 0.2);
    }
    expect(ex.fracao()).toBeGreaterThan(inicio * 2);
  });

  it('revelar uma fração do bairro dá doces e XP (marcos de descoberta)', () => {
    const r = novaRua();
    const ex = r.regras.exploracao!;
    ex.revelar({ x: r.gerada.rua.largura / 2, y: r.gerada.rua.profundidade / 2 }, 500);
    rodar(r.mundo, 0.2);
    expect(eventosDo(r.mundo.eventos, 'descoberta')).toHaveLength(cfg.marcos.length);
    expect(eventosDo(r.mundo.eventos, 'ganhouXp').some((e) => e.motivo === 'descoberta')).toBe(
      true,
    );
  });
});

describe('campainhas', () => {
  it('cada campainha toca uma vez, apaga a luz da varanda e dá um resultado', () => {
    const r = novaRua();
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const c = ex.estado.campainhas.find((x) => x.luz >= 0)!;
    const luzes = r.luz.fontes.length;
    levar(r, c);
    interagir(r);
    // F abre o minijogo: a campainha já conta como tocada e a varanda apaga.
    expect(ex.minijogo).not.toBeNull();
    expect(c.tocada).toBe(true);
    expect(r.luz.fontes.length).toBe(luzes - 1);
    jogarMinijogo(r);
    const ev = eventosDo(r.mundo.eventos, 'campainha');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.objeto).toBe(c.objeto);
    interagir(r);
    expect(ex.minijogo).toBeNull();
    expect(eventosDo(r.mundo.eventos, 'campainha')).toHaveLength(1);
  });

  it('F abre um minijogo fácil (o nível do doce, com folga); errar deixa a porta fechada', () => {
    const r = novaRua(3);
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const c = ex.estado.campainhas[0]!;
    levar(r, c);
    interagir(r);
    const mj = cfg.campainha.minijogo;
    const facil = minijogoNoNivel(r, c, mj.nivelDoce, mj.folgaDoce);
    expect(ex.minijogo!.vista).toEqual(facil.vista);
    expect(ex.minijogo!.restanteS).toBeCloseTo(facil.restanteS);
    const doces = r.regras.estado.docesPorFonte['campainha'] ?? 0;
    jogarMinijogo(r, false);
    const ev = eventosDo(r.mundo.eventos, 'campainha').at(-1)!;
    expect(ev.resultado).toBe('fechada');
    expect(ev.texto).toBe(mj.textoFechada);
    expect(r.regras.estado.docesPorFonte['campainha'] ?? 0).toBe(doces);
    // A casa não acorda: isso é só da Casa Desconfiada.
    expect(r.mundo.entidades.some((e) => e.especie === cfg.desconfiada.especie)).toBe(false);
  });

  it('perfeito no F: doces garantidos, vezes multPerfeito', () => {
    const r = novaRua(3);
    semInimigos(r);
    const c = r.regras.exploracao!.estado.campainhas[0]!;
    levar(r, c);
    interagir(r);
    jogarMinijogo(r);
    expect(eventosDo(r.mundo.eventos, 'campainha').at(-1)!.resultado).toBe('doces');
    expect(r.regras.estado.docesPorFonte['campainha']).toBeGreaterThanOrEqual(
      Math.round(cfg.campainha.doces[0] * cfg.campainha.minijogo.multPerfeito),
    );
  });

  it('só acende a varanda da porta que a câmera vê (luz sem fonte à vista parece erro)', () => {
    let fundos = 0;
    for (let s = 1; s <= 8; s++) {
      const r = novaRua(s);
      for (const c of r.regras.exploracao!.estado.campainhas) {
        const casa = r.gerada.rua.objetos[c.objeto]!;
        const frente = girar({ x: 1, y: 0 }, casa.rot);
        const aVista = frente.x + frente.y > 0;
        expect(c.luz >= 0).toBe(aVista);
        if (!aVista) fundos++;
      }
    }
    expect(fundos).toBeGreaterThan(0);
  });

  it('F pede doce: acertando, doces ou histórias, sem pestinhas', () => {
    const vistos = new Set<string>();
    for (let s = 1; s <= 6 && vistos.size < 2; s++) {
      const r = novaRua(s);
      semInimigos(r);
      for (const c of r.regras.exploracao!.estado.campainhas) {
        levar(r, c);
        interagir(r);
        // Com um inimigo por perto (o Poste), a porta não abre.
        if (!r.regras.exploracao!.minijogo) continue;
        jogarMinijogo(r);
        vistos.add(eventosDo(r.mundo.eventos, 'campainha').at(-1)!.resultado);
      }
    }
    // Acertando: doces ou uma história (o perfeito sempre dá doces), nunca as pestinhas.
    expect(vistos.has('doces')).toBe(true);
    expect([...vistos].every((v) => v === 'doces' || v === 'historia')).toBe(true);
  });

  it('G abre um minijogo difícil; acertar dá o prêmio da travessura sem briga', () => {
    const r = novaRua(3);
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const c = ex.estado.campainhas[0]!;
    levar(r, c);
    const antes = r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length;
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'travessura', x: 0, y: 0 });
    passo(r.mundo);
    const dificil = minijogoNoNivel(r, c, cfg.campainha.minijogo.nivelTravessura);
    expect(ex.estado.desafio!.origem).toBe('travessura');
    expect(ex.minijogo!.vista).toEqual(dificil.vista);
    jogarMinijogo(r);
    const venceu = eventosDo(r.mundo.eventos, 'travessuraVencida');
    expect(venceu).toHaveLength(1);
    expect(venceu[0]!.doces).toBeGreaterThanOrEqual(
      cfg.campainha.doces[0] * cfg.campainha.travessura.multDoces,
    );
    rodar(r.mundo, cfg.campainha.travessura.atrasoS + 0.1);
    expect(r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length).toBe(antes);
  });

  it('G e errou o minijogo: as pestinhas saem da porta e, vencidas, dão item e doces a mais', () => {
    const r = novaRua(3);
    semInimigos(r);
    const c = r.regras.exploracao!.estado.campainhas[0]!;
    levar(r, c);
    const antes = r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol').length;
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'travessura', x: 0, y: 0 });
    passo(r.mundo);
    jogarMinijogo(r, false);
    expect(eventosDo(r.mundo.eventos, 'campainha').at(-1)!.resultado).toBe('travessura');
    rodar(r.mundo, cfg.campainha.travessura.atrasoS + 0.1);
    const pestinhas = r.mundo.entidades.filter((e) => e.especie === 'pestinha_lencol');
    expect(pestinhas.length - antes).toBe(cfg.campainha.travessura.pestinhas);
    expect(eventosDo(r.mundo.eventos, 'travessuraVencida')).toHaveLength(0);
    for (const p of pestinhas) p.combate!.coragem = 0;
    passo(r.mundo);
    const venceu = eventosDo(r.mundo.eventos, 'travessuraVencida');
    expect(venceu).toHaveLength(1);
    expect(venceu[0]!.doces).toBeGreaterThanOrEqual(
      cfg.campainha.doces[0] * cfg.campainha.travessura.multDoces,
    );
    // Paga uma vez só.
    rodar(r.mundo, 1);
    expect(eventosDo(r.mundo.eventos, 'travessuraVencida')).toHaveLength(1);
  });

  it('G longe de uma campainha não faz nada (não religa poste nem sobe no mirante)', () => {
    const r = novaRua(3);
    semInimigos(r);
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'travessura', x: 0, y: 0 });
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'campainha')).toHaveLength(0);
    expect(r.regras.exploracao!.estado.canal).toBeNull();
  });
});

describe('Abóboras Douradas', () => {
  it('encostar pega a abóbora; achar todas faz o baú dos segredos aparecer', () => {
    const r = novaRua(3, {
      bauDosSegredos: { tipo: 'raro', doces: 50, item: null, rerolls: 1 },
    });
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const baus = r.regras.estado.baus.length;
    for (const sg of ex.estado.segredos) {
      levar(r, sg);
      passo(r.mundo);
      expect(sg.achado).toBe(true);
    }
    const ev = eventosDo(r.mundo.eventos, 'segredo');
    expect(ev.map((e) => e.achados)).toEqual([1, 2, 3]);
    expect(r.mundo.entidades.some((e) => e.especie === 'abobora_dourada')).toBe(false);
    expect(r.regras.estado.baus.length).toBe(baus + 1);
    expect(r.regras.estado.baus.at(-1)!.tipo).toBe('raro');
  });

  it('de longe ela não aparece no mapa; de perto vira conhecida', () => {
    const r = novaRua();
    semInimigos(r);
    const sg = r.regras.exploracao!.estado.segredos[0]!;
    expect(sg.conhecido).toBe(false);
    levar(r, { x: sg.x + cfg.segredo.raioVer - 0.5, y: sg.y });
    passo(r.mundo);
    expect(sg.conhecido).toBe(true);
    expect(sg.achado).toBe(false);
  });
});

describe('postes apagados e mirante', () => {
  it('religar exige ficar parado; ao terminar, a luz acende e cura', () => {
    const r = novaRua();
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const p = ex.estado.postes[0]!;
    expect(r.luz.postesQueCuram(p.centro)).toBe(0);
    // Andar cancela.
    levar(r, p);
    interagir(r);
    expect(eventosDo(r.mundo.eventos, 'canal')).toHaveLength(1);
    levar(r, { x: p.x + 0.5, y: p.y });
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'canalCancelado')).toHaveLength(1);
    expect(p.aceso).toBe(false);
    // Parado até o fim, acende.
    levar(r, p);
    interagir(r);
    rodar(r.mundo, cfg.poste.canalS + 0.1);
    expect(p.aceso).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'posteReligado')).toHaveLength(1);
    expect(r.luz.postesQueCuram(p.centro)).toBeGreaterThan(0);
  });

  it('dano no jogador interrompe o canal', () => {
    const r = novaRua();
    semInimigos(r);
    r.jogador.combate!.estados = [];
    const p = r.regras.exploracao!.estado.postes[0]!;
    levar(r, p);
    interagir(r);
    const inicio = r.mundo.eventos.length;
    causarDano(r.mundo, r.jogador, { origem: 0, bruto: 5, tipo: 'habilidade' });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    expect(r.regras.exploracao!.estado.canal).toBeNull();
  });

  it('o mirante revela boa parte do mapa e mostra as Abóboras Douradas', () => {
    const r = novaRua();
    semInimigos(r);
    const ex = r.regras.exploracao!;
    const m = ex.estado.mirante!;
    const antes = ex.fracao();
    levar(r, m);
    interagir(r);
    rodar(r.mundo, cfg.mirante.canalS + 0.1);
    expect(m.usado).toBe(true);
    expect(ex.fracao()).toBeGreaterThan(antes + 0.12);
    expect(ex.estado.segredos.every((s) => s.conhecido)).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'mirante')).toHaveLength(1);
  });
});

describe('rota', () => {
  it('a rua interditada do 1º Poste só abre quando ele cai', () => {
    const r = novaRua();
    const b = r.gerada.bloqueios[0]!;
    const meio = { x: (b.area.x0 + b.area.x1) / 2, y: (b.area.y0 + b.area.y1) / 2 };
    expect(r.campo.grade.ehLivre(meio)).toBe(false);
    const p1 = r.regras.estado.postes[0]!;
    const inicio = r.mundo.eventos.length;
    causarDano(r.mundo, p1, {
      origem: r.jogador.id,
      bruto: 1e7,
      tipo: 'habilidade',
      verdadeiro: true,
    });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    const ev = eventosDo(r.mundo.eventos, 'portaoAbriu');
    expect(ev.map((e) => e.grupo)).toEqual([b.grupo]);
    expect(r.campo.grade.ehLivre(meio)).toBe(true);
    expect(r.regras.estado.portaoAberto).toBe(false);
  });

  it('os grupos dormindo pelo caminho só acordam quando o jogador chega perto', () => {
    const r = novaRua();
    const dormindo = (): Entidade[] => r.mundo.entidades.filter((e) => e.marcas?.adormecido);
    const grupo = r.gerada.encontros[0]!;
    const n = dormindo().length;
    expect(n).toBe(r.gerada.encontros.reduce((s, e) => s + e.n, 0));
    const pos = dormindo().map((e) => ({ ...e.pos }));
    rodar(r.mundo, 3);
    expect(dormindo().map((e) => e.pos)).toEqual(pos);
    levar(r, { x: grupo.pos.x + 3, y: grupo.pos.y });
    rodar(r.mundo, 0.5);
    expect(dormindo().length).toBeLessThan(n);
  });

  it('a régua de progresso segue o caminho da rota (0 na entrada, 1 na saída)', () => {
    const r = novaRua();
    expect(r.regras.progressoDe(r.gerada.rota[0]!)).toBeCloseTo(0, 6);
    expect(r.regras.progressoDe(r.gerada.rota.at(-1)!)).toBeCloseTo(1, 6);
    const meio = r.regras.progressoDe(r.gerada.rota[Math.floor(r.gerada.rota.length / 2)]!);
    expect(meio).toBeGreaterThan(0.2);
    expect(meio).toBeLessThan(0.8);
  });

  it('os pedidos de exploração se cumprem pela exploração', () => {
    const r = novaRua(3, {
      pedido: { id: 'campainhas', def: noite.pedidos['campainhas']! },
    });
    semInimigos(r);
    const ex = r.regras.exploracao!;
    for (const c of ex.estado.campainhas.slice(0, noite.pedidos['campainhas']!.n!)) {
      levar(r, c);
      interagir(r);
      jogarMinijogo(r);
    }
    passo(r.mundo);
    expect(r.regras.estado.pedido).toBe('cumprido');
  });
});
