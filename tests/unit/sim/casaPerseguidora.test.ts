import { describe, expect, it } from 'vitest';
import { conteudo, inimigos, visual } from '../../../src/sim/content';
import { colisaoDoObjeto, meioDoLote } from '../../../src/sim/casaDesperta';
import { passo } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';
import { quadroDaTransformacao } from '../../../src/render/especies';
import { rodar } from './ajuda';

const C = conteudo as ConteudoRun;
const CASA = inimigos.inimigos['casa_perseguidora']!;

function imortal(r: RuaDaRun): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

/** Uma rua com casa térrea na rota (com porta para o caminho). */
function ruaComCasa(): { r: RuaDaRun; objeto: number } {
  for (let s = 1; s < 40; s++) {
    const r = new Run(C, s).novaRua();
    const objeto = r.gerada.rua.objetos.findIndex(
      (o, i) => o.modelo === 'casa_terrea' && !o.grupo && r.regras.portaDoLote(i) !== null,
    );
    if (objeto >= 0) return { r, objeto };
  }
  throw new Error('nenhuma rua com casa térrea');
}

const temObstaculo = (r: RuaDaRun, objeto: number) => {
  const o = r.gerada.rua.objetos[objeto]!;
  return colisaoDoObjeto(o, C.modelos).every((c) =>
    r.mundo.obstaculos.some((x) => Math.abs(x.x0 - c.x0) < 1e-6 && Math.abs(x.y1 - c.y1) < 1e-6),
  );
};

describe('Casa Perseguidora do Elenco v7: a casa do lote que levanta', () => {
  it('acordar tira a casa do lote (colisão, luzes e desenho) e o inimigo nasce no meio dele', () => {
    const { r, objeto } = ruaComCasa();
    imortal(r);
    expect(temObstaculo(r, objeto)).toBe(true);
    r.mundo.eventos = [];
    const e = r.regras.acordarCasa(r.mundo, 'casa_perseguidora', objeto);
    expect(temObstaculo(r, objeto)).toBe(false);
    expect(r.luz.fontes.some((f) => f.objeto === objeto)).toBe(false);
    expect(eventosDo(r.mundo.eventos, 'objetoVirou').map((v) => v.objeto)).toEqual([objeto]);
    const { centro, frente } = meioDoLote(r.gerada.rua.objetos[objeto]!, C.modelos);
    expect(e.pos.x).toBeCloseTo(centro.x);
    expect(e.pos.y).toBeCloseTo(centro.y);
    expect(e.olhar).toEqual(frente);
  });

  it('parada durante a transformação; depois sai pela porta do lote', () => {
    const { r, objeto } = ruaComCasa();
    imortal(r);
    const e = r.regras.acordarCasa(r.mundo, 'casa_perseguidora', objeto);
    const inicio = { ...e.pos };
    rodar(r.mundo, CASA.param['transformacaoS']! - 0.1);
    expect(Math.hypot(e.pos.x - inicio.x, e.pos.y - inicio.y)).toBeLessThan(1e-6);
    rodar(r.mundo, 2);
    const { frente } = meioDoLote(r.gerada.rua.objetos[objeto]!, C.modelos);
    const andou = (e.pos.x - inicio.x) * frente.x + (e.pos.y - inicio.y) * frente.y;
    expect(andou).toBeGreaterThan(1);
  });

  it('a Casa Desperta desiste de quem foge: deita e a casa volta para o lote', () => {
    const { r, objeto } = ruaComCasa();
    imortal(r);
    const e = r.regras.acordarCasa(r.mundo, 'casa_desperta', objeto);
    const p = inimigos.inimigos['casa_desperta']!.param;
    // O jogador bem longe.
    const longe = { x: e.pos.x + p['fugaDistancia']! + 30, y: e.pos.y };
    r.jogador.pos = { ...longe };
    r.jogador.velocidade = 0;
    // Levanta, sai do lote (até uns 3 s até a calçada), espera a fuga e deita.
    rodar(r.mundo, p['transformacaoS']! + 3 + p['fugaS']! + p['transformacaoS']! + 0.5);
    expect(r.mundo.entidades.includes(e)).toBe(false);
    expect(temObstaculo(r, objeto)).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'objetoVoltou').map((v) => v.objeto)).toEqual([objeto]);
  });

  it('a elite sai de uma casa térrea perto da praça, longe do jogador', () => {
    let achou = false;
    for (let s = 1; s < 20 && !achou; s++) {
      const run = new Run(C, s);
      run.estado.ruaNoBairro = 1;
      const r = run.novaRua();
      imortal(r);
      const el = r.regras.estado.elitesPendentes[0];
      if (el?.especie !== 'casa_perseguidora') continue;
      r.regras.estado.tempo = 1e4;
      passo(r.mundo);
      const casa = r.mundo.entidades.find((x) => x.especie === 'casa_perseguidora');
      expect(casa).toBeDefined();
      if (casa?.marcas?.lote === undefined) continue;
      achou = true;
      expect(Number(casa.marcas.transformacaoAte)).toBeGreaterThan(r.mundo.tick);
      const d = Math.hypot(casa.pos.x - r.jogador.pos.x, casa.pos.y - r.jogador.pos.y);
      expect(d).toBeGreaterThanOrEqual(CASA.param['loteLongeDoJogador']!);
    }
    expect(achou).toBe(true);
  }, 60_000);

  it('os quadros da transformação andam em partes iguais e ao contrário na volta', () => {
    const q = visual.malhas.transformacoes['casa_perseguidora']!;
    expect(q.at(-1)).toBe('casa_perseguidora');
    expect(quadroDaTransformacao(q, 0, 100, 0)).toBe(q[0]);
    expect(quadroDaTransformacao(q, 0, 100, 99)).toBe(q.at(-1));
    expect(quadroDaTransformacao(q, 0, 100, 50)).toBe(q[2]);
    expect(quadroDaTransformacao(q, 0, 100, 0, true)).toBe(q.at(-1));
    expect(quadroDaTransformacao(q, 0, 100, 100)).toBeNull();
  });
});
