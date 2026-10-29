import { describe, expect, it } from 'vitest';
import {
  aplicarEstado,
  calcularAtributos,
  causarDano,
  danoFinal,
  atributosBase,
  recargaComPressa,
} from '../../../src/sim/combate';
import { combate, conteudo, ruas } from '../../../src/sim/content';
import { enfileirar, passo } from '../../../src/sim/mundo';
import { criarFicha, darXp, gastarPonto, simularRua } from '../../../src/sim/partida';
import { podeSubirPosto, xpAteNivel, xpParaSubir } from '../../../src/sim/progressao';
import { boneco, BRUXINHA, cena, eventos, perdida, RES_BONECO, rodar, TPS } from './ajuda';

const est = combate.estados;

describe('fórmulas do GDD', () => {
  it('dano final = bruto × 100 / (100 + Resistência)', () => {
    expect(danoFinal(100, 0)).toBe(100);
    expect(danoFinal(100, 100)).toBe(50);
    expect(danoFinal(110, 10)).toBeCloseTo(100, 9);
  });

  it('recarga = base × (1 − Pressa/100), com a Pressa limitada a 40', () => {
    expect(recargaComPressa(10, 20, 40)).toBeCloseTo(8, 9);
    expect(recargaComPressa(10, 90, 40)).toBeCloseTo(6, 9);
  });

  it('modificadores somam e multiplicam sobre a base', () => {
    const a = calcularAtributos(atributosBase({ forca: 10 }), [
      { origem: 'a', atributo: 'forca', soma: 15 },
      { origem: 'b', atributo: 'forca', mult: 0.2 },
      { origem: 'c', atributo: 'velocidade', mult: -0.1 },
    ]);
    expect(a.forca).toBeCloseTo(30, 9);
    expect(a.velocidade).toBeCloseTo(0.9, 9);
  });
});

describe('caminho do dano', () => {
  it('crítico causa 150%', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 });
    causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 100, tipo: 'habilidade', critico: true });
    expect(perdida(b)).toBeCloseTo(danoFinal(150, RES_BONECO), 9);
    expect(eventos(c.mundo, 'dano')[0]?.critico).toBe(true);
  });

  it('a chance de crítico usa o gerador com semente', () => {
    const c = cena();
    c.heroi.combate!.base.critico = 1;
    const b = boneco(c, { x: 9, y: 15 });
    passo(c.mundo);
    causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 10, tipo: 'habilidade', podeCritar: true });
    expect(eventos(c.mundo, 'dano')[0]?.critico).toBe(true);
  });

  it('escudo absorve antes da Coragem', () => {
    const c = cena();
    aplicarEstado(c.heroi, { tipo: 'escudo', valor: 30, restante: 4, origem: 'teste' }, est);
    const antes = c.heroi.combate!.coragem;
    causarDano(c.mundo, c.heroi, { origem: 99, bruto: danoFinal(50, 0) * 0 + 55, tipo: 'ataque' });
    const final = danoFinal(55, BRUXINHA.atributos.resistencia);
    expect(antes - c.heroi.combate!.coragem).toBeCloseTo(final - 30, 9);
    expect(c.heroi.combate!.estados.some((s) => s.tipo === 'escudo')).toBe(false);
  });

  it('marca soma o bônus no próximo dano e some', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 });
    aplicarEstado(b, { tipo: 'marca', restante: 5, bonus: 0.5, origem: c.heroi.id }, est);
    causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 100, tipo: 'habilidade' });
    causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 100, tipo: 'habilidade' });
    expect(perdida(b)).toBeCloseTo(danoFinal(150, RES_BONECO) + danoFinal(100, RES_BONECO), 9);
  });

  it('imune não perde Coragem', () => {
    const c = cena();
    aplicarEstado(c.heroi, { tipo: 'imune', restante: 1 }, est);
    const antes = c.heroi.combate!.coragem;
    causarDano(c.mundo, c.heroi, { origem: 99, bruto: 500, tipo: 'ataque' });
    expect(c.heroi.combate!.coragem).toBe(antes);
  });

  it('roubo de vida devolve Coragem a quem bate', () => {
    const c = cena();
    c.heroi.combate!.base.rouboVida = 0.5;
    passo(c.mundo);
    c.heroi.combate!.coragem = 50;
    const b = boneco(c, { x: 9, y: 15 });
    const valor = causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 40, tipo: 'habilidade' });
    expect(c.heroi.combate!.coragem).toBeCloseTo(50 + valor * 0.5, 9);
  });

  it('dano por segundo pega aos poucos até acabar', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 });
    aplicarEstado(
      b,
      { tipo: 'dot', restante: 2, porSegundo: 30, origem: c.heroi.id, acumulado: 0 },
      est,
    );
    rodar(c.mundo, 2.5);
    expect(perdida(b)).toBeCloseTo(danoFinal(60, RES_BONECO), 6);
  });
});

describe('estados', () => {
  it('atordoado não anda nem lança', () => {
    const c = cena();
    aplicarEstado(c.heroi, { tipo: 'atordoado', restante: 0.5 }, est);
    enfileirar(c.mundo, { tipo: 'direcao', id: c.heroi.id, x: 1, y: 0 });
    enfileirar(c.mundo, { tipo: 'lancar', id: c.heroi.id, tecla: 'Q', alvo: { x: 9, y: 15 } });
    rodar(c.mundo, 0.4);
    expect(c.heroi.pos.x).toBe(5);
    expect(eventos(c.mundo, 'recusado')[0]?.motivo).toBe('controle');
    rodar(c.mundo, 0.5);
    expect(c.heroi.pos.x).toBeGreaterThan(5);
  });

  it('enraizado não anda, mas lança', () => {
    const c = cena();
    aplicarEstado(c.heroi, { tipo: 'enraizado', restante: 1 }, est);
    enfileirar(c.mundo, { tipo: 'direcao', id: c.heroi.id, x: 1, y: 0 });
    enfileirar(c.mundo, { tipo: 'lancar', id: c.heroi.id, tecla: 'E', alvo: { x: 9, y: 15 } });
    rodar(c.mundo, 0.1);
    expect(eventos(c.mundo, 'lancou')).toHaveLength(1);
  });

  it('medo faz o alvo fugir de quem assustou', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 }, 2);
    aplicarEstado(b, { tipo: 'medo', restante: 1, de: { x: 7, y: 15 } }, est);
    rodar(c.mundo, 0.5);
    expect(b.pos.x).toBeGreaterThan(9.5);
    rodar(c.mundo, 1);
    const x = b.pos.x;
    rodar(c.mundo, 0.5);
    expect(b.pos.x).toBe(x);
  });

  it('chefes trocam atordoamento por lentidão de 50% pela metade do tempo', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 }, 2);
    b.combate!.chefe = true;
    aplicarEstado(b, { tipo: 'atordoado', restante: 2 }, est);
    expect(b.combate!.estados).toEqual([
      { tipo: 'lentidao', valor: est.chefeLentidao, restante: 2 * est.chefeFracaoDuracao },
    ]);
  });

  it('fora de combate por 4 s, o jogador anda 20% mais rápido', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 });
    causarDano(c.mundo, b, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
    enfileirar(c.mundo, { tipo: 'direcao', id: c.heroi.id, x: 0, y: 1 });
    passo(c.mundo);
    expect(c.heroi.multVelocidade).toBeCloseTo(1, 9);
    rodar(c.mundo, combate.foraDeCombate.segundos + 0.1);
    expect(c.heroi.multVelocidade).toBeCloseTo(1 + combate.foraDeCombate.bonusVelocidade, 9);
  });
});

describe('níveis', () => {
  const niveis = combate.niveis;

  it('XP para subir: 100 + 60 × (nível − 1); do 1 ao 12 são 4.400', () => {
    expect(xpParaSubir(1, niveis)).toBe(100);
    expect(xpParaSubir(11, niveis)).toBe(700);
    expect(xpAteNivel(12, niveis)).toBe(4400);
  });

  it('cada nível dá 1 ponto, +8% de Coragem e +2 no atributo principal', () => {
    const p = simularRua(ruas[0]!, conteudo, 1);
    const f = p.ficha;
    expect(f.progresso).toMatchObject({ nivel: 1, pontos: 1 });
    darXp(p.mundo, p.jogador, f, 100, combate);
    expect(f.progresso).toMatchObject({ nivel: 2, pontos: 2 });
    expect(f.combate.attr.coragemMax).toBeCloseTo(BRUXINHA.coragem * 1.08, 9);
    expect(f.combate.attr.feitico).toBeCloseTo(2, 9);
    expect(eventos(p.mundo, 'nivel')).toHaveLength(1);
  });

  it('o R só sobe nos níveis 4, 8 e 12; Q, W e E vão até o posto 5', () => {
    const f = criarFicha('bruxinha', conteudo);
    expect(podeSubirPosto(f.lancador, f.progresso, 'R', niveis)).toBe(false);
    expect(gastarPonto(f, 'Q', combate)).toBe(true);
    f.progresso.nivel = 4;
    f.progresso.pontos = 10;
    expect(gastarPonto(f, 'R', combate)).toBe(true);
    expect(gastarPonto(f, 'R', combate)).toBe(false);
    for (let i = 0; i < 4; i++) gastarPonto(f, 'Q', combate);
    expect(f.lancador.slots.Q!.posto).toBe(5);
    expect(gastarPonto(f, 'Q', combate)).toBe(false);
  });

  it('derrubar um boneco de treino dá XP', () => {
    const p = simularRua(ruas[0]!, conteudo, 1);
    const b = p.bonecos[0]!;
    b.pos = { x: p.jogador.pos.x + 2, y: p.jogador.pos.y };
    b.combate!.coragem = 1;
    // Ataque manual: a Bruxinha atira para a direita (botão esquerdo).
    enfileirar(p.mundo, { tipo: 'golpear', id: p.jogador.id, x: 1, y: 0 });
    rodar(p.mundo, 1.5);
    expect(p.ficha.progresso.xp).toBe(combate.bonecoTreino.xp);
  });
});

describe('auto-ataque', () => {
  const auto = BRUXINHA.autoAtaque;

  it('parado, ataca sozinho quem estiver no alcance, depois do preparo de 0,2 s', () => {
    const c = cena([], { autoAtaque: true });
    const b = boneco(c, { x: 9, y: 15 });
    rodar(c.mundo, auto.preparo - 2 / TPS);
    expect(eventos(c.mundo, 'ataqueAuto')).toHaveLength(0);
    rodar(c.mundo, 2 / TPS + 1);
    expect(eventos(c.mundo, 'ataqueAuto').length).toBeGreaterThanOrEqual(1);
    const acertos = eventos(c.mundo, 'acertoAuto').filter((e) => e.alvo === b.id).length;
    expect(acertos).toBeGreaterThanOrEqual(1);
    expect(perdida(b)).toBeCloseTo(acertos * danoFinal(auto.base, RES_BONECO), 6);
  });

  it('ataca no ritmo de golpes por segundo, com o preparo antes de cada golpe', () => {
    const c = cena([], { autoAtaque: true });
    boneco(c, { x: 9, y: 15 });
    rodar(c.mundo, 3.1);
    const ciclo = 1 / auto.porSegundo + auto.preparo;
    expect(eventos(c.mundo, 'ataqueAuto')).toHaveLength(
      Math.floor((3.1 - auto.preparo) / ciclo + 1e-6) + 1,
    );
  });

  it('mexer durante o preparo cancela o golpe', () => {
    const c = cena([], { autoAtaque: true });
    const b = boneco(c, { x: 9, y: 15 });
    rodar(c.mundo, 0.1);
    enfileirar(c.mundo, { tipo: 'direcao', id: c.heroi.id, x: 0, y: 1 });
    rodar(c.mundo, 0.5);
    expect(eventos(c.mundo, 'ataqueAuto')).toHaveLength(0);
    expect(perdida(b)).toBe(0);
  });

  it('não ataca sozinho fora do alcance; com alvo clicado, anda até ele', () => {
    const c = cena([], { autoAtaque: true });
    const b = boneco(c, { x: 15, y: 15 });
    rodar(c.mundo, 1);
    expect(perdida(b)).toBe(0);
    enfileirar(c.mundo, { tipo: 'atacar', id: c.heroi.id, alvo: b.id });
    rodar(c.mundo, 3);
    expect(c.heroi.pos.x).toBeGreaterThan(9);
    expect(perdida(b)).toBeGreaterThan(0);
  });

  it('atacar e mover pega o inimigo do caminho', () => {
    const c = cena([], { autoAtaque: true });
    const b = boneco(c, { x: 14, y: 16 });
    enfileirar(c.mundo, { tipo: 'atacarMover', id: c.heroi.id, x: 25, y: 15 });
    rodar(c.mundo, 4);
    expect(perdida(b)).toBeGreaterThan(0);
    expect(c.heroi.pos.x).toBeLessThan(14);
  });

  it('acertar um inimigo durante o aviso dele cancela o ataque', () => {
    const c = cena();
    const b = boneco(c, { x: 9, y: 15 });
    b.lancador = {
      slots: {
        pisao: {
          def: {
            id: 'pisao',
            nome: 'Pisão',
            tecla: 'ataque',
            descricao: '',
            forma: {
              tipo: 'area',
              alcance: 0,
              raio: 2,
              atraso: 0,
              pulsos: 1,
              intervalo: 0,
              centradaNoLancador: true,
              acompanha: false,
              segueCursor: false,
              quadrada: false,
            },
            custo: 0,
            recarga: [5],
            lancamento: 1,
            efeitos: [],
            cor: 'perigo',
            aviso: true,
            cargas: 1,
            empurraAoAcertar: 0,
            aoFechar: [],
            afetaAliados: [],
            confina: false,
            sombra: false,
            velocidadeSeguir: 4,
            curaPorDano: 0,
            reiniciaAoAbater: false,
            medoAntes: 0,
          },
          posto: 1,
          recarga: 0,
          recargaTotal: 0,
          cargas: 1,
          evolucao: null,
          gratis: false,
          retornoAte: -1,
          retornoDe: null,
          relancarAte: -1,
        },
      },
      lancando: null,
      interrompido: false,
      guardado: null,
      passiva: null,
      contagemPassiva: 0,
      lancadas: 0,
    };
    c.executor.pedir(c.mundo, b, 'pisao', b.pos);
    expect(b.lancador.lancando).not.toBeNull();
    enfileirar(c.mundo, { tipo: 'lancar', id: c.heroi.id, tecla: 'Q', alvo: { x: 9, y: 15 } });
    rodar(c.mundo, 0.6);
    expect(b.lancador.lancando).toBeNull();
    expect(eventos(c.mundo, 'interrompeu')).toHaveLength(1);
  });
});
