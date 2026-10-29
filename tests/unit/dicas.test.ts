import { describe, expect, it } from 'vitest';
import { DicasDaRua } from '../../src/game/dicas';
import { dicas } from '../../src/sim/content';
import type { Evento } from '../../src/sim/eventos';

const cfg = dicas.rua;
const parado = { x: 5, y: 5 };
const inicio = cfg.esperaInicialS + 0.1;

describe('dicas da rua 1-1', () => {
  it('a primeira é andar, depois da espera, e some quando o jogador anda', () => {
    const d = new DicasDaRua(cfg);
    expect(d.atualizar(0, parado)).toBeNull();
    expect(d.atualizar(inicio, parado)).toBe(cfg.passos[0]!.texto);
    expect(d.passo).toBe('andar');
    d.atualizar(inicio + 1, { x: parado.x + cfg.andarTiles, y: parado.y });
    expect(d.passo).toBe('atacar');
  });

  it('uma ação feita antes da vez dela pula a dica', () => {
    const d = new DicasDaRua(cfg);
    d.atualizar(0, parado);
    const eventos: Evento[] = [
      { tipo: 'ataqueAuto', id: 1, alvo: 2 },
      { tipo: 'lancou', id: 1, tecla: 'Q', alvo: parado, fortalecida: false },
      { tipo: 'rolou', id: 1, x: 1, y: 0 },
    ];
    d.consumir(eventos, 1);
    d.atualizar(inicio, { x: 9, y: 9 });
    expect(d.passo).toBe('lanterna');
    // Rolar conta só para o próprio jogador.
    const semRolar = new DicasDaRua(cfg);
    semRolar.consumir([{ tipo: 'rolou', id: 7, x: 1, y: 0 }], 1);
    expect(semRolar['feitos'].has('rolar')).toBe(false);
    // Ações de outro (um inimigo lançando Q) não contam.
    const outra = new DicasDaRua(cfg);
    outra.consumir([{ tipo: 'lancou', id: 7, tecla: 'Q', alvo: parado, fortalecida: false }], 1);
    expect(outra['feitos'].has('q')).toBe(false);
  });

  it('cada dica sai sozinha depois do tempo dela, na ordem, e nada passa da duração total', () => {
    const d = new DicasDaRua(cfg);
    d.atualizar(0, parado);
    const vistos: string[] = [];
    for (let t = inicio; t < inicio + cfg.duracaoS + 5; t += 0.5) {
      d.atualizar(t, parado);
      if (d.passo && vistos.at(-1) !== d.passo) vistos.push(d.passo);
    }
    expect(vistos).toEqual(cfg.passos.map((p) => p.id).slice(0, vistos.length));
    expect(vistos.length).toBeGreaterThanOrEqual(Math.min(cfg.passos.length, 5));
    expect(d.terminou).toBe(true);
    expect(d.atualizar(inicio + cfg.duracaoS + 10, parado)).toBeNull();
  });
});
