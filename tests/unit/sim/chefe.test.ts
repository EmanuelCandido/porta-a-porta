import { describe, expect, it } from 'vitest';
import { CampoDeFluxo } from '../../../src/sim/campoDeFluxo';
import { causarDano, golpearObjeto } from '../../../src/sim/combate';
import { conteudo, gerador, inimigos } from '../../../src/sim/content';
import type { V2 } from '../../../src/sim/geometria';
import {
  adicionarEntidade,
  enfileirar,
  passo,
  type Entidade,
  type Sistema,
} from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';
import { rodar } from './ajuda';

const C = conteudo as ConteudoRun;
const SINDICO = inimigos.inimigos['sindico_zeloso']!;

function praca(semente = 5): { run: Run; r: RuaDaRun } {
  const run = new Run(C, semente);
  for (let k = 0; k < C.run.ruasPorBairro; k++) {
    run.novaRua();
    run.venceuRua();
    if (run.estado.fase === 'portaAPorta') {
      run.novaPorta();
      run.sairDaPorta();
    }
  }
  expect(run.estado.fase).toBe('chefe');
  const r = run.novaArena();
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  return { run, r };
}

const chefe = (r: RuaDaRun) => r.regras.estado.chefe!;

describe('Síndico Zeloso', () => {
  it('a praça tem o Síndico no meio, sem bueiros nem ondas, e o portão fechado', () => {
    const { r } = praca();
    expect(chefe(r).especie).toBe('sindico_zeloso');
    expect(chefe(r).combate!.attr.coragemMax).toBe(SINDICO.coragem);
    expect(r.gerada.bueiros).toHaveLength(0);
    rodar(r.mundo, 12);
    expect(eventosDo(r.mundo.eventos, 'onda')).toHaveLength(0);
    expect(r.regras.estado.portaoAberto).toBe(false);
  });

  it('fase 1: Multa em leque de 3 e, a cada 15 s, um Portão de grades que some em 6 s', () => {
    const { r } = praca();
    rodar(r.mundo, 6);
    const multas = eventosDo(r.mundo.eventos, 'anunciou').filter(
      (a) => a.chave === 'multa_sindico',
    );
    expect(multas.length).toBeGreaterThan(0);
    expect(eventosDo(r.mundo.eventos, 'lancou').some((l) => l.tecla === 'multa_sindico')).toBe(
      true,
    );
    rodar(r.mundo, SINDICO.param['intervaloPortao']! / 2);
    const grades = () => r.mundo.entidades.filter((e) => e.especie === 'grade_sindico');
    expect(grades().length).toBeGreaterThan(3);
    rodar(r.mundo, SINDICO.param['duracaoPortao']! + 0.5);
    expect(grades()).toHaveLength(0);
  });

  it('fase 2: abaixo de 50% chama 2 Guardas e passa a usar a Vistoria, que atordoa', () => {
    const { r } = praca();
    const c = chefe(r).combate!;
    c.coragem = c.attr.coragemMax * 0.45;
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').at(-1)?.fase).toBe(2);
    expect(r.mundo.entidades.filter((e) => e.especie === 'guarda_condominio')).toHaveLength(2);
    rodar(r.mundo, 6);
    const vistoria = eventosDo(r.mundo.eventos, 'anunciou').find(
      (a) => a.chave === 'vistoria_sindico',
    );
    expect(vistoria?.duracao).toBeCloseTo(1.2);
    expect(r.regras.chefeNaTela()?.fase).toBe('Fase 2');
  });

  it('fase 2: fica atrás dos Guardas e, depois da Vistoria, emenda a Multa', () => {
    const { r } = praca();
    const s = chefe(r);
    const c = s.combate!;
    c.coragem = c.attr.coragemMax * 0.45;
    const j = r.jogador.pos;
    let atras = 0;
    let amostras = 0;
    let vistoria = -1;
    let multaDepois = Infinity;
    for (let t = 0; t < 10 * 60; t++) {
      const inicio = r.mundo.eventos.length;
      passo(r.mundo);
      for (const a of eventosDo(r.mundo.eventos.slice(inicio), 'anunciou')) {
        if (a.id !== s.id) continue;
        if (a.chave === 'vistoria_sindico' && vistoria < 0) vistoria = t;
        else if (a.chave === 'multa_sindico' && vistoria >= 0 && multaDepois === Infinity)
          multaDepois = t - vistoria;
      }
      const guardas = r.mundo.entidades.filter(
        (e) => e.especie === 'guarda_condominio' && e.combate!.coragem > 0,
      );
      if (t < 120 || guardas.length === 0) continue;
      const dg = Math.min(...guardas.map((g) => Math.hypot(g.pos.x - j.x, g.pos.y - j.y)));
      amostras++;
      if (Math.hypot(s.pos.x - j.x, s.pos.y - j.y) > dg) atras++;
    }
    expect(atras / amostras).toBeGreaterThan(0.8);
    expect(vistoria).toBeGreaterThanOrEqual(0);
    // A Multa sai logo que a Vistoria acaba (1,2 s de aviso), sem esperar a recarga.
    expect(multaDepois / 60).toBeLessThan(1.6);
  });

  it('o Síndico caído abre o portão; vencer a praça leva ao bairro 2', () => {
    const { run, r } = praca();
    const ch = chefe(r);
    const inicio = r.mundo.eventos.length;
    ch.combate!.coragem = 1;
    // Um golpe de verdade, dentro do tick.
    r.mundo.entidades.forEach((e) => {
      if (e.especie === 'guarda_condominio') e.combate!.coragem = 0;
    });
    r.regras.sistema.depoisDoTick!(r.mundo, []);
    ch.combate!.coragem = 0;
    r.mundo.eventos.push({ tipo: 'derrotado', id: ch.id, por: r.jogador.id, pos: { ...ch.pos } });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    expect(r.regras.estado.portaoAberto).toBe(true);
    run.venceuChefe(r.regras.estado);
    expect(run.estado.bairro).toBe(1);
    expect(run.estado.ruaNoBairro).toBe(0);
    expect(run.estado.fase).toBe('rua');
    expect(run.estado.chefesVencidos).toBe(1);
  });
});

/** A praça do chefe do bairro `bairro` (0, 1 ou 2), vencendo as ruas e os chefes de antes. */
function pracaDoBairro(bairro: number, semente = 5): { run: Run; r: RuaDaRun } {
  const run = new Run(C, semente);
  for (let b = 0; b <= bairro; b++) {
    for (let k = 0; k < C.run.ruasPorBairro; k++) {
      run.novaRua();
      run.venceuRua();
      if (run.estado.fase === 'portaAPorta') {
        run.novaPorta();
        run.sairDaPorta();
      }
    }
    if (b < bairro) {
      run.novaArena();
      run.venceuChefe();
    }
  }
  expect(run.estado.fase).toBe('chefe');
  const r = run.novaArena();
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  return { run, r };
}

const VIUVA = inimigos.inimigos['viuva_do_mirante']!;

describe('Viúva do Mirante', () => {
  it('a praça do bairro 2 tem o mirante a oeste e a Viúva na sacada, com a Coragem do GDD', () => {
    const { run, r } = pracaDoBairro(1);
    expect(run.chefeDoBairro).toBe('viuva_do_mirante');
    const v = chefe(r);
    expect(v.especie).toBe('viuva_do_mirante');
    // Chefe não cresce com a escala do bairro: os 4.000 já são do bairro 2.
    expect(v.combate!.attr.coragemMax).toBe(VIUVA.coragem);
    const lugar = r.gerada.lugarDoChefe!;
    expect(r.gerada.rua.objetos[lugar.casa!]!.modelo).toBe('mirante');
    expect(v.pos.x).toBeCloseTo(lugar.pos.x);
    rodar(r.mundo, 5);
    expect(v.pos).toEqual(lugar.pos);
    expect(v.marcas?.alturaPx).toBe(VIUVA.param['alturaNoMirante']);
    expect(r.regras.chefeNaTela()?.fase).toBe('No mirante');
  });

  it('fase 1: rajadas de 5 Lágrimas que caem onde o jogador está, cada uma anunciada', () => {
    const { r } = pracaDoBairro(1);
    const j = r.jogador;
    const inicio = r.mundo.eventos.length;
    // O jogador anda de um lado para o outro da praça: as Lágrimas vão atrás.
    for (let t = 0; t < 8 * 60; t++) {
      j.direcao = { x: 0, y: Math.floor(t / 90) % 2 === 0 ? 1 : -1 };
      passo(r.mundo);
    }
    const lagrimas = eventosDo(r.mundo.eventos.slice(inicio), 'anunciou').filter(
      (a) => a.chave === 'lagrimas_viuva',
    );
    expect(lagrimas.length).toBeGreaterThanOrEqual(VIUVA.param['lagrimasPorRajada']!);
    expect(lagrimas.every((a) => a.duracao >= 0.4)).toBe(true);
    expect(new Set(lagrimas.map((a) => a.alvo.y.toFixed(1))).size).toBeGreaterThan(2);
  });

  it('fase 2: abaixo de 60% apaga a praça (menos a casa dela) e chama Sombras, até 3', () => {
    const { r } = pracaDoBairro(1);
    const v = chefe(r);
    const casa = r.gerada.lugarDoChefe!.casa;
    const acesas = () =>
      r.luz.fontes.filter(
        (f) => (f.tipo === 'poste' || f.tipo === 'janela') && f.desligadaAte === null,
      );
    expect(acesas().some((f) => f.tipo === 'poste')).toBe(true);
    v.combate!.coragem = v.combate!.attr.coragemMax * 0.55;
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').at(-1)?.fase).toBe(2);
    // Só a casa dela pode ficar acesa (as janelas não jogam luz no chão, então nem ela).
    expect(acesas().every((f) => f.objeto === casa)).toBe(true);
    expect(acesas().some((f) => f.tipo === 'poste')).toBe(false);
    expect(r.regras.chefeNaTela()?.fase).toBe('Escuridão');
    // Todas as que apareceram em 45 s (o jogador pode derrubar alguma) e nunca mais que o máximo vivas.
    const vistas = new Set<number>();
    for (let t = 0; t < 45 * 60; t++) {
      passo(r.mundo);
      const vivas = r.mundo.entidades.filter((e) => e.especie === 'sombra_da_viuva');
      for (const e of vivas) vistas.add(e.id);
      expect(vivas.length).toBeLessThanOrEqual(VIUVA.param['sombrasMax']!);
    }
    expect(vistas.size).toBeGreaterThanOrEqual(2);
  });

  it('no escuro, uma das rajadas é o cerco: Lágrimas em volta e a última no meio', () => {
    const { r } = pracaDoBairro(1);
    const v = chefe(r);
    v.combate!.coragem = v.combate!.attr.coragemMax * 0.55;
    const j = r.jogador.pos;
    const inicio = r.mundo.eventos.length;
    rodar(r.mundo, 20);
    const lagrimas = eventosDo(r.mundo.eventos.slice(inicio), 'anunciou').filter(
      (a) => a.chave === 'lagrimas_viuva',
    );
    // O jogador fica parado: em cima e adiantada caem nele; o cerco cai a `raioDoCerco` dele.
    const emVolta = lagrimas.filter(
      (a) =>
        Math.abs(Math.hypot(a.alvo.x - j.x, a.alvo.y - j.y) - VIUVA.param['raioDoCerco']!) < 0.1,
    );
    expect(emVolta.length).toBeGreaterThanOrEqual(VIUVA.param['lagrimasPorRajada']! - 1);
    expect(lagrimas.some((a) => Math.hypot(a.alvo.x - j.x, a.alvo.y - j.y) < 0.05)).toBe(true);
  });

  it('no chão, o véu leva a Viúva para as costas do jogador', () => {
    const { r } = pracaDoBairro(1);
    const v = chefe(r);
    v.combate!.coragem = v.combate!.attr.coragemMax * 0.2;
    passo(r.mundo);
    const j = r.jogador;
    j.olhar = { x: 1, y: 0 };
    let visto = false;
    for (let t = 0; t < 12 * 60 && !visto; t++) {
      const antes = v.combate!.estados.some((s) => s.tipo === 'invisivel');
      passo(r.mundo);
      const agora = v.combate!.estados.some((s) => s.tipo === 'invisivel');
      if (!antes && agora) {
        visto = true;
        const d = Math.hypot(v.pos.x - j.pos.x, v.pos.y - j.pos.y);
        expect(d).toBeLessThan(VIUVA.param['atrasDoJogador']! + 0.6);
        // Atrás: do lado oposto ao que o jogador olha.
        expect(v.pos.x).toBeLessThan(j.pos.x);
      }
    }
    expect(visto).toBe(true);
  });

  it('fase 3: abaixo de 25% desce, bate de perto e some no véu por 2 s', () => {
    const { r } = pracaDoBairro(1);
    const v = chefe(r);
    const x0 = v.pos.x;
    v.combate!.coragem = v.combate!.attr.coragemMax * 0.2;
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').some((f) => f.fase === 3)).toBe(true);
    expect(v.marcas?.alturaPx).toBe(0);
    expect(v.pos.x).toBeCloseTo(x0 + VIUVA.param['desce']!, 1);
    expect(r.regras.chefeNaTela()?.fase).toBe('No chão');
    const inicio = r.mundo.eventos.length;
    let invisivel = 0;
    for (let t = 0; t < 12 * 60; t++) {
      passo(r.mundo);
      if (v.combate!.estados.some((s) => s.tipo === 'invisivel')) invisivel++;
    }
    const ataques = new Set(
      eventosDo(r.mundo.eventos.slice(inicio), 'anunciou')
        .filter((a) => a.id === v.id)
        .map((a) => a.chave),
    );
    expect(ataques.has('garras_viuva') || ataques.has('investida_viuva')).toBe(true);
    expect(invisivel).toBeGreaterThan(0);
    expect(invisivel / 60).toBeLessThanOrEqual(2 * Math.ceil(12 / VIUVA.param['veuACadaS']!));
  });

  it('a Viúva caída abre o portão e leva ao bairro 3', () => {
    const { run, r } = pracaDoBairro(1);
    const v = chefe(r);
    const inicio = r.mundo.eventos.length;
    v.combate!.coragem = 0;
    r.mundo.eventos.push({ tipo: 'derrotado', id: v.id, por: r.jogador.id, pos: { ...v.pos } });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    expect(r.regras.estado.portaoAberto).toBe(true);
    run.venceuChefe(r.regras.estado);
    expect(run.estado.bairro).toBe(2);
    expect(run.estado.fase).toBe('rua');
  });
});

const DONO = inimigos.inimigos['dono_do_bairro']!;

/** A praça do Dono com estes preços já pagos na run (na ordem). */
function pracaDoDono(precos: string[] = []): { run: Run; r: RuaDaRun } {
  const run = new Run(C, 5);
  for (let b = 0; b <= 2; b++) {
    for (let k = 0; k < C.run.ruasPorBairro; k++) {
      run.novaRua();
      run.venceuRua();
      if (run.estado.fase === 'portaAPorta') {
        run.novaPorta();
        run.sairDaPorta();
      }
    }
    if (b < 2) {
      run.novaArena();
      run.venceuChefe();
    }
  }
  run.estado.precos = precos.map((id) => ({ id, trato: 'relogio_de_bolso' }));
  const r = run.novaArena();
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  return { run, r };
}

describe('O Dono do Bairro', () => {
  it('é a própria casa: fica parado no lugar da casa oeste, com a Coragem do GDD', () => {
    const { run, r } = pracaDoDono();
    expect(run.chefeDoBairro).toBe('dono_do_bairro');
    const d = chefe(r);
    expect(d.especie).toBe('dono_do_bairro');
    expect(d.combate!.attr.coragemMax).toBe(DONO.coragem);
    const lugar = r.gerada.lugarDoChefe!;
    expect(lugar.casa).toBeNull();
    rodar(r.mundo, 5);
    expect(d.pos).toEqual(lugar.pos);
    expect(r.regras.chefeNaTela()?.fase).toBe('Andar 1');
  });

  it('a fachada fecha a praça: sem cerca diante dele, e a Vassoura acerta a casa', () => {
    const { r } = pracaDoDono();
    const d = chefe(r);
    const corpo = r.gerada.bloqueado;
    expect(corpo).toHaveLength(1);
    const c0 = corpo[0]!;
    const cercaNaFrente = r.gerada.rua.objetos.filter(
      (o) => o.modelo === 'cerca' && o.y + 0.5 > c0.y0 && o.y + 0.5 < c0.y1 && o.x < c0.x1 + 1,
    );
    expect(cercaNaFrente).toHaveLength(0);
    // Diante da casa, a Vassoura (projétil que para em paredes) atinge o Dono.
    const j = r.jogador;
    j.pos = { x: c0.x1 + 3, y: d.pos.y + 0.3 };
    j.posAnterior = { ...j.pos };
    j.lancador!.slots['Q']!.posto = 1;
    const inicio = r.mundo.eventos.length;
    enfileirar(r.mundo, { tipo: 'lancar', id: j.id, tecla: 'Q', alvo: { ...d.pos } });
    rodar(r.mundo, 1.5);
    const acertou = eventosDo(r.mundo.eventos.slice(inicio), 'dano').some(
      (e) => e.alvo === d.id && e.golpe === 'habilidade',
    );
    expect(acertou).toBe(true);
  });

  it('ninguém contorna a casa: da frente da fachada não se passa para trás da cerca oeste', () => {
    const { r } = pracaDoDono();
    const g = r.campo.grade;
    const cercaOeste = r.gerada.ruaX[0];
    const c0 = r.gerada.bloqueado[0]!;
    const cy = (c0.y0 + c0.y1) / 2;
    const pontos = (x0: number, x1: number, y0: number, y1: number): V2[] => {
      const lista: V2[] = [];
      for (let x = x0; x <= x1; x += 0.25)
        for (let y = y0; y <= y1; y += 0.25) if (g.ehLivre({ x, y })) lista.push({ x, y });
      return lista;
    };
    // Diante da fachada (dentro da praça) e atrás da cerca, em volta da casa.
    const frente = pontos(cercaOeste + 0.3, cercaOeste + 2, cy - 4, cy + 4);
    const atras = pontos(cercaOeste - 5, cercaOeste - 0.5, cy - 5, cy + 5);
    expect(frente.length).toBeGreaterThan(0);
    const vazou = frente.flatMap((a) => atras.filter((b) => g.linhaLivre(a, b)).map((b) => [a, b]));
    expect(vazou).toEqual([]);
    // O caminho da grade também não chega lá.
    const campo = new CampoDeFluxo(g);
    campo.calcular(r.gerada.praca!);
    expect(atras.filter((p) => Number.isFinite(campo.distanciaDe(p)))).toEqual([]);
    // As portas soltam as pestinhas dentro da praça.
    const d = chefe(r);
    rodar(r.mundo, DONO.param['pestinhasACadaS']! / 2 + 0.5);
    const daCasa = r.mundo.entidades.filter((e) => e.marcas?.daCasa);
    expect(daCasa.length).toBeGreaterThan(0);
    for (const p of daCasa) expect(p.pos.x).toBeGreaterThan(cercaOeste);
    expect(d.pos.x + d.raio).toBeGreaterThan(cercaOeste);
  });

  it('andar 1: varridas de 5 feixes em ângulos diferentes e pestinhas pelas portas', () => {
    const { r } = pracaDoDono();
    const d = chefe(r);
    const inicio = r.mundo.eventos.length;
    rodar(r.mundo, 10);
    const feixes = eventosDo(r.mundo.eventos.slice(inicio), 'anunciou').filter(
      (a) => a.chave === 'feixe_dono',
    );
    expect(feixes.length).toBeGreaterThanOrEqual(DONO.param['feixesPorVarrida']!);
    expect(feixes.every((a) => a.duracao >= 0.4)).toBe(true);
    const angulos = feixes
      .slice(0, 5)
      .map((a) => Math.atan2(a.alvo.y - d.pos.y, a.alvo.x - d.pos.x).toFixed(2));
    expect(new Set(angulos).size).toBe(5);
    const pestinhas = r.mundo.entidades.filter((e) => e.marcas?.daCasa);
    expect(pestinhas.length).toBeGreaterThanOrEqual(DONO.param['pestinhasPorVez']!);
  });

  it('andar 2: tijolos perto do jogador e a rampa empurra quem está diante da casa', () => {
    const { r } = pracaDoDono();
    const d = chefe(r);
    d.combate!.coragem = d.combate!.attr.coragemMax * 0.6;
    const j = r.jogador;
    const frente = { x: d.pos.x + d.raio + DONO.param['rampaAFrente']!, y: d.pos.y };
    j.pos = { ...frente };
    j.posAnterior = { ...frente };
    const inicio = r.mundo.eventos.length;
    rodar(r.mundo, 3);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').some((f) => f.fase === 2)).toBe(true);
    expect(r.regras.chefeNaTela()?.fase).toBe('Andar 2');
    const anuncios = eventosDo(r.mundo.eventos.slice(inicio), 'anunciou');
    expect(anuncios.some((a) => a.chave === 'rampa_dono')).toBe(true);
    // Empurrado para longe da casa (para +x).
    expect(j.pos.x).toBeGreaterThan(frente.x + 0.5);
    rodar(r.mundo, 6);
    const tijolos = eventosDo(r.mundo.eventos.slice(inicio), 'anunciou').filter(
      (a) => a.chave === 'tijolo_dono',
    );
    expect(tijolos.length).toBeGreaterThanOrEqual(DONO.param['tijolosPorChuva']!);
  });

  it('andar 3: o rosto e a Cobrança, um eco por preço pago, na ordem', () => {
    const { r } = pracaDoDono(['casa_perseguidora', 'poste_apagado', 'banco_quebrado']);
    const d = chefe(r);
    d.combate!.coragem = d.combate!.attr.coragemMax * 0.3;
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').some((f) => f.fase === 3)).toBe(true);
    expect(d.marcas?.visual).toBe('dono_do_bairro_rosto');
    const postesAcesos = () =>
      r.luz.fontes.filter((f) => f.tipo === 'poste' && f.desligadaAte === null).length;
    const postes0 = postesAcesos();
    const sombras0 = r.luz.sombras.length;
    rodar(r.mundo, 2.5);
    expect(r.mundo.entidades.some((e) => e.especie === 'casa_perseguidora')).toBe(true);
    rodar(r.mundo, DONO.param['cobrancaACadaS']!);
    expect(postesAcesos()).toBe(postes0 - 1);
    rodar(r.mundo, DONO.param['cobrancaACadaS']!);
    expect(r.luz.sombras.length).toBe(sombras0 + 1);
    const gritos = eventosDo(r.mundo.eventos, 'grito').map((g) => g.texto);
    expect(gritos).toContain('Cobrança: Casa Perseguidora!');
    expect(gritos).toContain('Cobrança: Poste Apagado!');
    expect(gritos).toContain('Cobrança: Banco Quebrado!');
  });

  it('sem preços pagos, a Cobrança não invoca nada', () => {
    const { r } = pracaDoDono();
    const d = chefe(r);
    d.combate!.coragem = d.combate!.attr.coragemMax * 0.3;
    rodar(r.mundo, 20);
    expect(r.mundo.entidades.some((e) => e.marcas?.cobranca)).toBe(false);
    expect(eventosDo(r.mundo.eventos, 'grito').some((g) => g.texto.startsWith('Cobrança'))).toBe(
      false,
    );
  });

  it('o Dono caído abre o portão; vencer a praça encerra a run com vitória', () => {
    const { run, r } = pracaDoDono();
    const d = chefe(r);
    const inicio = r.mundo.eventos.length;
    d.combate!.coragem = 0;
    r.mundo.eventos.push({ tipo: 'derrotado', id: d.id, por: r.jogador.id, pos: { ...d.pos } });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    expect(r.regras.estado.portaoAberto).toBe(true);
    run.venceuChefe(r.regras.estado);
    expect(run.estado.fase).toBe('vitoria');
    expect(run.estado.chefesVencidos).toBe(3);
  });
});

describe('Síndico Zeloso: pátio do condomínio', () => {
  const SINDICO = inimigos.inimigos['sindico_zeloso']!;
  const patio = gerador.arena.patio['sindico_zeloso']!;

  it('o pátio é maior, com guarita, canteiros quebráveis e cancela no portão', () => {
    const { r } = pracaDoBairro(0);
    const objs = r.gerada.rua.objetos;
    expect(r.gerada.ruaX[1] - r.gerada.ruaX[0]).toBeCloseTo(patio.largura, 6);
    expect(objs.filter((o) => o.modelo === 'guarita')).toHaveLength(1);
    expect(objs.filter((o) => o.modelo === 'cancela' && o.grupo === 'portao')).toHaveLength(1);
    const canteiros = r.mundo.entidades.filter((e) => e.especie === 'canteiro');
    expect(canteiros).toHaveLength(patio.canteiros.length);
    expect(canteiros.every((c) => c.marcas?.quebravel)).toBe(true);
  });

  it('Regulamento: protegido com canteiros; cada um quebrado tira a proteção por um tempo', () => {
    const { r } = pracaDoBairro(0);
    const s = r.regras.estado.chefe!;
    passo(r.mundo);
    expect(s.marcas?.protegido).toBe(true);
    expect(s.combate!.attr.danoRecebido).toBeCloseTo(1 - SINDICO.param['protecao']!, 6);
    const canteiros = r.mundo.entidades.filter((e) => e.especie === 'canteiro');
    const quebrar = (c: (typeof canteiros)[number]) => {
      const sis = r.mundo.sistemas as { antesDeMover?: (m: typeof r.mundo) => void }[];
      const golpe = {
        antesDeMover: () =>
          causarDano(r.mundo, c, { origem: r.jogador.id, bruto: 1e6, tipo: 'autoAtaque' }),
      };
      sis.unshift(golpe);
      passo(r.mundo);
      sis.shift();
      passo(r.mundo);
    };
    quebrar(canteiros[0]!);
    expect(s.marcas?.protegido).toBe(false);
    expect(eventosDo(r.mundo.eventos, 'grito').some((g) => g.texto === 'Meu canteiro!')).toBe(true);
    for (let t = 0; t < (SINDICO.param['desprotegidoS']! + 0.2) * 60; t++) passo(r.mundo);
    expect(s.marcas?.protegido).toBe(true);
    for (const c of canteiros.slice(1)) quebrar(c);
    for (let t = 0; t < (SINDICO.param['desprotegidoS']! + 0.2) * 60; t++) passo(r.mundo);
    expect(s.marcas?.protegido).toBe(false);
    expect(s.combate!.attr.danoRecebido).toBeCloseTo(1, 6);
  });
});

describe('Arena da Viúva: o jardim em duas alturas e as velas', () => {
  function interagir(r: RuaDaRun): void {
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
    passo(r.mundo);
  }
  function levar(r: RuaDaRun, p: V2): void {
    r.jogador.pos = { ...p };
    r.jogador.posAnterior = { ...p };
  }
  const fases = (r: RuaDaRun) => (fracao: number) => {
    const v = chefe(r);
    v.combate!.coragem = v.combate!.attr.coragemMax * fracao;
    passo(r.mundo);
  };

  it('o jardim tem o patamar de pedra e 4 velas apagadas', () => {
    const { r } = pracaDoBairro(1);
    const objs = r.gerada.rua.objetos;
    expect(objs.some((o) => o.modelo === 'patamar')).toBe(true);
    const velas = r.gerada.velasDaArena!;
    expect(velas).toHaveLength(4);
    for (const v of velas) expect(objs[v.objeto]).toMatchObject({ modelo: 'vela', apagada: true });
  });

  it('F acende a vela: vira uma luz no mapa (que não cura)', () => {
    const { r } = pracaDoBairro(1);
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    const velas = r.regras.velasDaViuva!;
    const v = velas.velas[0]!;
    levar(r, { x: v.pos.x + 0.8, y: v.pos.y });
    interagir(r);
    expect(v.acesa).toBe(true);
    const luz = r.luz.fontes.find((f) => f.id === v.luz)!;
    expect(luz.cura).toBe(false);
    expect(r.luz.iluminado(v.pos)).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'vela').at(-1)).toMatchObject({ acesa: true });
  });

  it('a noite (fase 2) apaga as velas; na fase 3 só uma fica acesa por vez', () => {
    const { r } = pracaDoBairro(1);
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    const velas = r.regras.velasDaViuva!;
    const [a, b] = velas.velas as [
      NonNullable<(typeof velas.velas)[0]>,
      NonNullable<(typeof velas.velas)[0]>,
    ];
    levar(r, { x: a.pos.x + 0.8, y: a.pos.y });
    interagir(r);
    expect(a.acesa).toBe(true);
    const fase = fases(r);
    fase(0.5);
    rodar(r.mundo, 0.1);
    expect(a.acesa).toBe(false);
    // Na noite, várias podem ficar acesas.
    interagir(r);
    levar(r, { x: b.pos.x + 0.8, y: b.pos.y });
    interagir(r);
    expect(a.acesa && b.acesa).toBe(true);
    fase(0.2);
    rodar(r.mundo, 0.1);
    expect(velas.velas.every((v) => !v.acesa)).toBe(true);
    expect(velas.umaPorVez).toBe(true);
    interagir(r);
    expect(b.acesa).toBe(true);
    levar(r, { x: a.pos.x + 0.8, y: a.pos.y });
    interagir(r);
    expect(a.acesa).toBe(true);
    expect(b.acesa).toBe(false);
    expect(velas.velas.filter((v) => v.acesa)).toHaveLength(1);
  });
});

describe('Arena do Dono: tijolos de cobertura e postes que apagam por andar', () => {
  function dono(): { r: RuaDaRun; d: ReturnType<typeof chefe> } {
    const { r } = pracaDoBairro(2);
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    return { r, d: chefe(r) };
  }
  const pilhas = (r: RuaDaRun) => r.mundo.entidades.filter((e) => e.especie === 'pilha_tijolos');
  /** Um golpe do jogador dentro de um tick (as regras veem o `derrotado` do mesmo tick). */
  function bater(r: RuaDaRun, alvo: Entidade, bruto: number): void {
    const s: Sistema = {
      antesDeMover(m) {
        golpearObjeto(m, alvo, { origem: r.jogador.id, bruto, tipo: 'autoAtaque' });
      },
    };
    const sistemas = r.mundo.sistemas as Sistema[];
    sistemas.unshift(s);
    passo(r.mundo);
    sistemas.splice(sistemas.indexOf(s), 1);
  }

  it('a rua diante da casa é larga (24 × 14)', () => {
    const { r } = dono();
    const pat = gerador.arena.patio['dono_do_bairro']!;
    expect(pat.largura).toBe(24);
    expect(r.gerada.ruaX[1] - r.gerada.ruaX[0]).toBeCloseTo(24, 6);
  });

  it('o tijolo que cai vira uma pilha de cobertura, que quebra em 3 golpes', () => {
    const { r, d } = dono();
    const alvo = { x: d.pos.x + 6, y: d.pos.y + 1 };
    r.regras.executor.pedir(r.mundo, d, 'tijolo_dono', alvo);
    for (let t = 0; t < 4 * 60 && pilhas(r).length === 0; t++) passo(r.mundo);
    const [p] = pilhas(r);
    expect(p).toBeDefined();
    expect(p!.marcas?.cobertura).toBe(true);
    // Golpe forte ou fraco, cada um tira só 1.
    for (let k = 0; k < 2; k++) {
      bater(r, p!, 500);
      expect(pilhas(r)).toHaveLength(1);
    }
    bater(r, p!, 1);
    expect(pilhas(r)).toHaveLength(0);
  });

  it('o feixe do Dono para na pilha: quem está atrás dela não leva o golpe', () => {
    const { r, d } = dono();
    r.jogador.combate!.estados = [];
    const j = r.jogador;
    j.pos = { x: d.pos.x + 7, y: d.pos.y };
    j.posAnterior = { ...j.pos };
    adicionarEntidade(r.mundo, {
      tipo: 'neutro',
      especie: 'pilha_tijolos',
      pos: { x: d.pos.x + 4.5, y: d.pos.y },
      raio: 0.45,
      velocidade: 0,
      marcas: { cobertura: true },
    });
    const antes = j.combate!.coragem;
    r.regras.executor.pedir(r.mundo, d, 'feixe_dono', { ...j.pos });
    let linha: { ate: V2 } | undefined;
    for (let t = 0; t < 4 * 60 && !linha; t++) {
      passo(r.mundo);
      linha = eventosDo(r.mundo.eventos, 'golpeLinha').find((e) => e.dono === d.id);
    }
    expect(linha).toBeDefined();
    expect(linha!.ate.x).toBeLessThan(d.pos.x + 4.6);
    expect(j.combate!.coragem).toBe(antes);
  });

  it('a cada andar, um poste da rua apaga', () => {
    const { r, d } = dono();
    const acesos = () =>
      r.luz.fontes.filter((f) => f.tipo === 'poste' && f.desligadaAte === null).length;
    const antes = acesos();
    d.combate!.coragem = d.combate!.attr.coragemMax * 0.5;
    rodar(r.mundo, 0.2);
    expect(acesos()).toBe(antes - 1);
    d.combate!.coragem = d.combate!.attr.coragemMax * 0.2;
    rodar(r.mundo, 0.2);
    expect(acesos()).toBe(antes - 2);
  });
});
