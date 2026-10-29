import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { audio } from '../../src/sim/content';
import {
  escolherVariacao,
  ganhosDaIntensidade,
  semitonsDoSom,
  SorteioDoAudio,
} from '../../src/game/audio/gravados';

describe('áudio gravado (arquivos CC0)', () => {
  it('todo arquivo citado no audio.json existe em public/', () => {
    const a = audio.arquivos!;
    for (const som of Object.values(a.sons))
      for (const arq of som.arquivos)
        expect(existsSync(`public/${a.pasta}${arq}${a.extensao}`), arq).toBe(true);
    const m = audio.musica.gravada!;
    for (const arq of [...Object.values(m.trilhas), m.combate!, ...Object.values(m.vinhetas)])
      expect(existsSync(`public/${m.pasta}${arq}`), arq).toBe(true);
  });

  it('todo som gravado tem o sintetizado de reserva (para quando o arquivo não carregar)', () => {
    for (const nome of Object.keys(audio.arquivos!.sons))
      expect(audio.sons[nome], nome).toBeDefined();
  });

  it('a variação nunca repete a anterior, e todas aparecem', () => {
    const s = new SorteioDoAudio();
    let anterior: number | null = null;
    const vistas = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const k = escolherVariacao(5, anterior, s);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(5);
      expect(k).not.toBe(anterior);
      vistas.add(k);
      anterior = k;
    }
    expect(vistas.size).toBe(5);
    expect(escolherVariacao(1, 0, s)).toBe(0);
  });

  it('o tom fica dentro da variação em volta do tom de base e do combo', () => {
    const s = new SorteioDoAudio(7);
    for (let i = 0; i < 100; i++) {
      const t = semitonsDoSom(-2, 3, 1.5, s);
      expect(t).toBeGreaterThanOrEqual(-0.5);
      expect(t).toBeLessThanOrEqual(2.5);
    }
  });

  it('na luta, a camada de combate entra e a rua baixa sem sumir', () => {
    const mix = audio.musica.gravada!.mixagem;
    expect(ganhosDaIntensidade(0, mix)).toEqual({ rua: 1, combate: 0 });
    const luta = ganhosDaIntensidade(1, mix);
    expect(luta.combate).toBe(mix.combate);
    expect(luta.rua).toBeGreaterThan(0);
    expect(luta.rua).toBeLessThan(0.5);
  });

  it('a energia da música sobe quando a luta começa (Codex: caía 9 dB)', () => {
    // Volume médio medido das faixas (dB): rua -21,6; combate -31,5.
    const RUA = -21.6;
    const COMBATE = -31.5;
    const mix = audio.musica.gravada!.mixagem;
    const luta = ganhosDaIntensidade(1, mix);
    const energia = (db: number, g: number) => 10 ** (db / 10) * g * g;
    const naLuta = 10 * Math.log10(energia(RUA, luta.rua) + energia(COMBATE, luta.combate));
    expect(naLuta).toBeGreaterThan(RUA);
  });
});
