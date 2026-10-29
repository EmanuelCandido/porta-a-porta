import { describe, expect, it } from 'vitest';
import { causarDano, danoFinal } from '../../../src/sim/combate';
import {
  conteudo,
  gerador,
  inimigos,
  luz as cfgLuz,
  modelos,
  ondas,
  susto as cfgSusto,
} from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import { distanciaNaLinha } from '../../../src/sim/geometria';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import { quantos, type Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';
import { rodar, ondasPorTempo } from './ajuda';

function novaRua(semente = 3, bairro = 0): RuaDeLuta {
  const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro });
  const bolso: Bolso = { doces: 0, consumiveis: [{ id: 'doce_isca', qtd: 2 }], susto: novoSusto() };
  const ficha = criarFicha('bruxinha', conteudo);
  return montarRua(g, ficha, conteudo, semente, bolso, { bairro });
}

const vivos = (r: RuaDeLuta, especie: string) =>
  r.mundo.entidades.filter((e) => e.especie === especie && e.combate && e.combate.coragem > 0);

/** Causa dano como se fosse dentro de um tick (as regras leem os eventos do tick). */
function golpear(r: RuaDeLuta, alvo: Entidade, bruto: number): void {
  const inicio = r.mundo.eventos.length;
  causarDano(r.mundo, alvo, { origem: r.jogador.id, bruto, tipo: 'habilidade', verdadeiro: true });
  r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
}

/** Deixa o jogador imune para observar as regras sem morrer. */
function imortal(r: RuaDeLuta): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

describe('ondas', () => {
  ondasPorTempo();
  it('a primeira onda chega aos 10 s, só com lençóis, e depois uma a cada 25 s', () => {
    const r = novaRua();
    imortal(r);
    rodar(r.mundo, ondas.primeiraEm - 0.1);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(0);
    rodar(r.mundo, 2);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(1);
    const nascidos = eventosDo(r.mundo.eventos, 'invocou');
    expect(nascidos).toHaveLength(ondas.porBairro[0]!);
    expect(new Set(nascidos.map((n) => n.especie))).toEqual(new Set(['pestinha_lencol']));
    rodar(r.mundo, ondas.intervalo);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(2);
  });

  it(`são ${ondas.total} ondas no total, e as pestinhas vão atrás do jogador`, () => {
    const r = novaRua();
    imortal(r);
    const inicio = { ...r.jogador.pos };
    // Alguma pestinha chega a encostar no jogador enquanto as ondas vêm.
    let chegou = false;
    const total = ondas.primeiraEm + (ondas.total - 1) * ondas.intervalo + 3;
    for (let t = 0; t < total; t += 5) {
      rodar(r.mundo, 5);
      chegou ||= vivos(r, 'pestinha_lencol').some(
        (e) => Math.hypot(e.pos.x - inicio.x, e.pos.y - inicio.y) < 3,
      );
    }
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(ondas.total);
    expect(chegou).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'dano').some((d) => d.alvo === r.jogador.id)).toBe(true);
  }, 30_000);
});

describe('ondas nos pontos da rua (modo pontos)', () => {
  it('parado na entrada, nada nasce dos bueiros, por mais que o tempo passe', () => {
    const r = novaRua();
    imortal(r);
    const semMorcegos = () =>
      r.mundo.entidades.filter((e) => e.tipo === 'inimigo' && e.especie !== ondas.enxame.especie)
        .length;
    const antes = semMorcegos();
    rodar(r.mundo, ondas.primeiraEm + ondas.intervalo * 3);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(0);
    // Dos bueiros, só os morceguinhos (que vêm por tempo) podem ter saído.
    expect(semMorcegos()).toBe(antes);
    const pontos = r.regras.estado.pontosDeOnda!;
    // Um bueiro a cada `aCada` pela rota, nenhum colado na entrada.
    const bueiros = r.gerada.bueiros.length + r.gerada.bueirosFlanco.length;
    expect(pontos.length).toBeGreaterThanOrEqual(Math.floor(bueiros / ondas.pontos!.aCada) - 1);
    for (const p of pontos)
      expect(distanciaNaLinha(r.gerada.rota, p.pos)).toBeGreaterThanOrEqual(
        ondas.pontos!.longeDaEntrada,
      );
  });

  it('os pontos seguem a rota sem buracos grandes: o próximo grupo nunca fica muito longe', () => {
    for (let s = 1; s <= 5; s++) {
      const r = novaRua(s);
      passo(r.mundo);
      const ds = r.regras.estado.pontosDeOnda!.map((p) => distanciaNaLinha(r.gerada.rota, p.pos));
      for (let k = 1; k < ds.length; k++) expect(ds[k]! - ds[k - 1]!).toBeLessThan(60);
      expect(ds[0]!).toBeLessThan(60);
    }
  });

  it('parado, os morceguinhos ainda aparecem do nada, por tempo', () => {
    const r = novaRua();
    imortal(r);
    // Para no primeiro enxame em vez de rodar os 12 sorteios inteiros (com a semente 3 ele vem no
    // 7º, aos 160 s de jogo, ~9600 ticks).
    const temEnxame = () => r.mundo.entidades.some((e) => e.especie === ondas.enxame.especie);
    const limite = ondas.primeiraEm + ondas.intervalo * 12;
    for (let t = 0; t < limite && !temEnxame(); t++) rodar(r.mundo, 1);
    expect(r.regras.estado.enxamesSorteados).toBeGreaterThan(ondas.enxame.desdeOnda);
    expect(temEnxame()).toBe(true);
    // Mesmo encurtado são minutos de jogo simulados: ~1 s sozinho e várias vezes isso com a
    // suíte paralela disputando os núcleos, perto dos 5 s padrão do Vitest.
  }, 30_000);

  it('chegar perto de um ponto solta o grupo dele uma vez só, do próprio bueiro', () => {
    const r = novaRua();
    imortal(r);
    passo(r.mundo);
    const p = r.regras.estado.pontosDeOnda![0]!;
    r.jogador.pos = { x: p.pos.x + 2, y: p.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    rodar(r.mundo, 3);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(1);
    expect(p.acordado).toBe(true);
    const nascidos = eventosDo(r.mundo.eventos, 'invocou');
    expect(nascidos.length).toBeGreaterThanOrEqual(ondas.porBairro[0]!);
    for (const n of nascidos)
      expect(Math.hypot(n.pos.x - p.pos.x, n.pos.y - p.pos.y)).toBeLessThan(1);
    rodar(r.mundo, 5);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(1);
  });

  it('os pontos ficam espalhados pela rota (não todos juntos)', () => {
    const r = novaRua();
    passo(r.mundo);
    const ps = r.regras.estado.pontosDeOnda!.map((p) => p.pos);
    let maior = 0;
    for (const a of ps)
      for (const b of ps) maior = Math.max(maior, Math.hypot(a.x - b.x, a.y - b.y));
    expect(maior).toBeGreaterThan(20);
  });
});

describe('Postes Corrompidos e portão', () => {
  it('derrubar os dois abre o portão, e passar por ele vence a rua', () => {
    const r = novaRua();
    imortal(r);
    expect(r.regras.estado.postes).toHaveLength(2);
    for (const p of r.regras.estado.postes) golpear(r, p, 1e6);
    passo(r.mundo);
    expect(r.regras.estado.portaoAberto).toBe(true);
    // O portão de saída (a rua interditada do 1º Poste abre junto, com o grupo dela).
    expect(eventosDo(r.mundo.eventos, 'portaoAbriu').filter((e) => !e.grupo)).toHaveLength(1);
    // Anda reto até a saída.
    const s = r.gerada.saida;
    r.jogador.pos = { x: (s.x0 + s.x1) / 2, y: r.gerada.ySaida + 1 };
    enfileirar(r.mundo, { tipo: 'moverPara', id: r.jogador.id, x: (s.x0 + s.x1) / 2, y: 0.5 });
    rodar(r.mundo, 2);
    expect(r.regras.estado.venceu).toBe(true);
  });

  it('com o portão fechado, ninguém passa', () => {
    const r = novaRua();
    imortal(r);
    const s = r.gerada.saida;
    r.jogador.pos = { x: (s.x0 + s.x1) / 2, y: r.gerada.ySaida + 1 };
    enfileirar(r.mundo, { tipo: 'moverPara', id: r.jogador.id, x: (s.x0 + s.x1) / 2, y: 0.5 });
    rodar(r.mundo, 2);
    expect(r.jogador.pos.y).toBeGreaterThan(r.gerada.ySaida);
    expect(r.regras.estado.venceu).toBe(false);
  });

  it('o Poste atira no jogador que está na luz e no alcance', () => {
    const r = novaRua();
    const poste = r.regras.estado.postes[0]!;
    r.jogador.pos = { x: poste.pos.x + 3, y: poste.pos.y };
    r.luz.adicionar({
      tipo: 'poste',
      x: r.jogador.pos.x,
      y: r.jogador.pos.y,
      raio: 1,
      cura: false,
    });
    rodar(r.mundo, 1.5);
    expect(eventosDo(r.mundo.eventos, 'anunciou').some((a) => a.id === poste.id)).toBe(true);
  });

  it('na sombra, o Poste só enxerga o jogador a até 2 tiles', () => {
    const r = novaRua();
    const poste = r.regras.estado.postes[0]!;
    r.luz.fontes = [];
    r.jogador.pos = { x: poste.pos.x + 3.5, y: poste.pos.y };
    rodar(r.mundo, 1.5);
    expect(eventosDo(r.mundo.eventos, 'anunciou').some((a) => a.id === poste.id)).toBe(false);
    r.jogador.pos = { x: poste.pos.x + 1.6, y: poste.pos.y };
    rodar(r.mundo, 1.5);
    expect(eventosDo(r.mundo.eventos, 'anunciou').some((a) => a.id === poste.id)).toBe(true);
  });

  it('o Poste mira primeiro a Doce-isca e depois o jogador', () => {
    const r = novaRua();
    imortal(r);
    const poste = r.regras.estado.postes[0]!;
    r.jogador.pos = { x: poste.pos.x + 3, y: poste.pos.y };
    r.luz.adicionar({ tipo: 'poste', x: poste.pos.x, y: poste.pos.y, raio: 8, cura: false });
    const isca = { x: poste.pos.x + 1, y: poste.pos.y + 1.5 };
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'consumivel:0', ...isca });
    // Um tiro já anunciado antes da isca cair pode sair; conta só os de depois.
    rodar(r.mundo, 0.5);
    r.mundo.eventos = [];
    rodar(r.mundo, 2);
    const tiros = eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === poste.id);
    expect(tiros.length).toBeGreaterThan(0);
    for (const t of tiros)
      expect(Math.hypot(t.alvo.x - isca.x, t.alvo.y - isca.y)).toBeLessThan(0.6);
    expect(quantos(r.regras.bolso, 'doce_isca')).toBe(1);
    // A isca dura 4 s; depois o Poste volta para o jogador.
    r.mundo.eventos = [];
    rodar(r.mundo, inimigos.doceIsca.duracao);
    const depois = eventosDo(r.mundo.eventos, 'anunciou')
      .filter((a) => a.id === poste.id)
      .at(-1)!;
    expect(
      Math.hypot(depois.alvo.x - r.jogador.pos.x, depois.alvo.y - r.jogador.pos.y),
    ).toBeLessThan(0.6);
  });

  it('com 3 pestinhas perto, o Poste recebe 50% menos dano', () => {
    const r = novaRua();
    const poste = r.regras.estado.postes[0]!;
    const perto: Entidade[] = [];
    for (let i = 0; i < 3; i++) {
      perto.push(
        r.regras.criarInimigo(r.mundo, 'pestinha_lencol', {
          x: poste.pos.x + 1 + i * 0.8,
          y: poste.pos.y + 1,
        }),
      );
    }
    for (const p of perto) p.ia = undefined;
    // A IA marca a proteção num tick; os atributos são recalculados no seguinte.
    passo(r.mundo);
    passo(r.mundo);
    const antes = poste.combate!.coragem;
    causarDano(r.mundo, poste, { origem: r.jogador.id, bruto: 100, tipo: 'habilidade' });
    const res = inimigos.inimigos['poste_corrompido']!.resistencia;
    expect(antes - poste.combate!.coragem).toBeCloseTo(danoFinal(50, res), 6);
  });
});

describe('luz', () => {
  it('postes amigos curam 2% por segundo a quem está na luz deles', () => {
    const r = novaRua();
    const poste = r.gerada.luzes.find((l) => l.tipo === 'poste')!;
    r.jogador.pos = { x: poste.x, y: poste.y + 0.8 };
    const c = r.jogador.combate!;
    c.coragem = 50;
    rodar(r.mundo, 1);
    expect(c.coragem).toBeCloseTo(50 + c.attr.coragemMax * cfgLuz.cura.postePorS, 1);
  });

  it('a lanterna gasta 25 de Luz e ilumina 3 tiles por 2 s em volta do jogador', () => {
    const r = novaRua();
    r.luz.fontes = [];
    const ponto = { x: r.jogador.pos.x + 2.5, y: r.jogador.pos.y };
    expect(r.luz.iluminado(ponto)).toBe(false);
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'lanterna', x: 0, y: 0 });
    passo(r.mundo);
    expect(r.jogador.combate!.luz).toBe(100 - conteudo.combate.luz.custoPulso);
    expect(r.luz.iluminado(ponto)).toBe(true);
    rodar(r.mundo, conteudo.combate.luz.duracaoPulso + 0.1);
    expect(r.luz.iluminado(ponto)).toBe(false);
  });
});

describe('Arremessador', () => {
  it('recua mais devagar do que avança, para quem chega perto conseguir alcançá-lo', () => {
    const r = novaRua();
    imortal(r);
    const def = inimigos.inimigos['arremessador']!;
    const j = r.jogador;
    const perto = r.regras.criarInimigo(r.mundo, 'arremessador', { x: j.pos.x + 2, y: j.pos.y });
    const longe = r.regras.criarInimigo(r.mundo, 'arremessador', { x: j.pos.x + 12, y: j.pos.y });
    passo(r.mundo);
    passo(r.mundo);
    const lentidao = def.param['lentidaoNoRecuo']!;
    expect(lentidao).toBeGreaterThan(0);
    // Os dois ganham os mesmos bônus (fora de combate); só o que recua fica mais lento.
    const razao = perto.combate!.attr.velocidade / longe.combate!.attr.velocidade;
    expect(razao).toBeCloseTo(1 - lentidao, 5);
  });
});

describe('doces', () => {
  it('inimigos derrotados soltam doces que o jogador pega encostando', () => {
    const r = novaRua();
    const p = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', {
      x: r.jogador.pos.x + 1,
      y: r.jogador.pos.y,
    });
    p.ia = undefined;
    golpear(r, p, 1e6);
    rodar(r.mundo, 1);
    expect(r.regras.bolso.doces).toBe(inimigos.inimigos['pestinha_lencol']!.doces);
  });
});

describe('Susto e Frenesi', () => {
  it('acertos enchem, transborda em Frenesi e depois volta a 0', () => {
    const r = novaRua();
    const s = r.regras.bolso.susto;
    for (let i = 0; i < 100; i++) r.mundo.eventos.push({ tipo: 'quaseAcerto', id: r.jogador.id });
    // Os eventos fora do tick não contam; simula pelo próprio medidor.
    r.mundo.eventos = [];
    r.regras.susto.tick(
      r.mundo,
      Array.from({ length: 20 }, () => ({ tipo: 'quaseAcerto' as const, id: r.jogador.id })),
    );
    expect(s.frenesi).toBeCloseTo(cfgSusto.frenesi.duracao, 1);
    expect(s.frenesisNaRua).toBe(1);
    expect(r.jogador.combate!.mods.some((m) => m.atributo === 'custoHabilidade')).toBe(true);
    rodar(r.mundo, cfgSusto.frenesi.duracao + 0.1);
    expect(s.frenesi).toBe(0);
    expect(s.valor).toBe(0);
  });

  it('ser atingido por ataque anunciado tira metade do Susto; golpe de pestinha não tira', () => {
    const r = novaRua();
    const s = r.regras.bolso.susto;
    s.valor = 40;
    r.regras.susto.tick(r.mundo, [
      {
        tipo: 'dano',
        origem: 99,
        alvo: r.jogador.id,
        valor: 8,
        absorvido: 0,
        critico: false,
        golpe: 'autoAtaque',
        comAviso: false,
        pos: r.jogador.pos,
      },
    ]);
    expect(s.valor).toBe(40);
    r.regras.susto.tick(r.mundo, [
      {
        tipo: 'dano',
        origem: 99,
        alvo: r.jogador.id,
        valor: 25,
        absorvido: 0,
        critico: false,
        golpe: 'ataque',
        comAviso: true,
        pos: r.jogador.pos,
      },
    ]);
    expect(s.valor).toBe(20);
  });

  it('3 s sem acertar, esvazia 8 por segundo', () => {
    const r = novaRua();
    imortal(r);
    const s = r.regras.bolso.susto;
    s.valor = 30;
    rodar(r.mundo, cfgSusto.esvaziaDepoisDe + 1);
    expect(s.valor).toBeCloseTo(30 - cfgSusto.esvaziaPorS * 1, 0);
  });

  it('a faixa Pavor dá +10% de velocidade', () => {
    const r = novaRua();
    r.regras.bolso.susto.valor = 49;
    r.regras.susto.tick(r.mundo, [{ tipo: 'acertoAuto', dono: r.jogador.id, alvo: 1 }]);
    expect(r.jogador.combate!.mods).toContainEqual({
      origem: 'susto',
      atributo: 'velocidade',
      mult: 0.1,
    });
  });
});
