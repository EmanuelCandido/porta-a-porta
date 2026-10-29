import { describe, expect, it } from 'vitest';
import {
  compilarPadrao,
  frequenciaMidi,
  grauEmSemitons,
  PASSOS_POR_COMPASSO,
} from '../../../src/game/audio/musica';
import { audio } from '../../../src/sim/content';

const { musica } = audio;
const MENOR = [0, 2, 3, 5, 7, 8, 11];

describe('música sintetizada', () => {
  it('graus da escala viram semitons, com oitavas para cima e para baixo', () => {
    expect(grauEmSemitons(0, MENOR)).toBe(0);
    expect(grauEmSemitons(4, MENOR)).toBe(7);
    expect(grauEmSemitons(7, MENOR)).toBe(12);
    expect(grauEmSemitons(9, MENOR)).toBe(15);
    expect(grauEmSemitons(-1, MENOR)).toBe(-1);
    expect(frequenciaMidi(69)).toBeCloseTo(440, 6);
    expect(frequenciaMidi(57)).toBeCloseTo(220, 6);
  });

  it('o padrão lê notas, batidas, notas seguradas e silêncio', () => {
    const { notas, passos } = compilarPadrao(['0 - - . x . 4 . . . . . . . . 7'], MENOR, 45, 12);
    expect(passos).toBe(16);
    expect(notas).toEqual([
      { passo: 0, midi: 57, passos: 3 },
      { passo: 4, midi: null, passos: 1 },
      { passo: 6, midi: 64, passos: 1 },
      { passo: 15, midi: 69, passos: 1 },
    ]);
    expect(() => compilarPadrao(['0 . .'], MENOR, 45, 0)).toThrow(/precisa de 16/);
    expect(() => compilarPadrao(['0 . . . . . . . . . . . . . . y'], MENOR, 45, 0)).toThrow();
  });

  it('toda trilha do conteúdo compila, usa instrumentos que existem e fica audível', () => {
    expect(Object.keys(musica.trilhas).sort()).toEqual(['chefe', 'rua', 'titulo']);
    for (const [nome, t] of Object.entries(musica.trilhas)) {
      for (const c of t.camadas) {
        const ins = musica.instrumentos[c.instrumento];
        expect(ins, `${nome}: ${c.instrumento}`).toBeDefined();
        const { notas, passos } = compilarPadrao(
          c.padrao,
          musica.escala,
          musica.tonica,
          ins!.oitava,
        );
        expect(passos % PASSOS_POR_COMPASSO).toBe(0);
        expect(notas.length).toBeGreaterThan(0);
        for (const n of notas) {
          if (n.midi === null)
            expect(ins!.freqBatida, `${nome}: batida sem frequência`).toBeDefined();
          else expect(frequenciaMidi(n.midi)).toBeGreaterThan(40);
          if (n.midi !== null) expect(frequenciaMidi(n.midi)).toBeLessThan(4200);
        }
      }
    }
    // A rua tem a parte calma e a de combate; o chefe toca tudo sempre.
    expect(musica.trilhas.rua!.camadas.some((c) => c.intensa)).toBe(true);
    expect(musica.trilhas.rua!.camadas.some((c) => !c.intensa)).toBe(true);
    expect(musica.trilhas.chefe!.camadas.every((c) => !c.intensa)).toBe(true);
  });
});
