import type { Audio } from '../../sim/content/esquemas';

type ConfigMusica = Audio['musica'];
type Instrumento = ConfigMusica['instrumentos'][string];
export type NomeDaTrilha = string;

/** Passos (semicolcheias) por compasso. */
export const PASSOS_POR_COMPASSO = 16;
/** Quanto à frente o agendador marca as notas, em segundos (o relógio do navegador falha às vezes). */
const ANTECEDENCIA_S = 0.15;
const INTERVALO_DO_AGENDADOR_MS = 50;
const SILENCIO = 0.0001;

/** Uma nota de um padrão: em que passo começa, a nota MIDI (null = batida) e quantos passos dura. */
export interface NotaDoPadrao {
  passo: number;
  midi: number | null;
  passos: number;
}

/** Semitons de um grau da escala (7 = uma oitava acima; negativos descem). */
export function grauEmSemitons(grau: number, escala: readonly number[]): number {
  const n = escala.length;
  const oitava = Math.floor(grau / n);
  return oitava * 12 + escala[grau - oitava * n]!;
}

export function frequenciaMidi(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Lê os compassos de um padrão: número = grau, "x" = batida, "-" = segura a nota anterior,
 * "." = silêncio. Cada compasso precisa ter 16 passos.
 */
export function compilarPadrao(
  compassos: readonly string[],
  escala: readonly number[],
  tonica: number,
  oitava: number,
): { notas: NotaDoPadrao[]; passos: number } {
  const notas: NotaDoPadrao[] = [];
  let passo = 0;
  let aberta: NotaDoPadrao | null = null;
  for (const c of compassos) {
    const fichas = c.trim().split(/\s+/);
    if (fichas.length !== PASSOS_POR_COMPASSO)
      throw new Error(`compasso com ${fichas.length} passos (precisa de 16): "${c}"`);
    for (const f of fichas) {
      if (f === '-') {
        if (aberta) aberta.passos++;
      } else if (f === '.') {
        aberta = null;
      } else if (f === 'x') {
        aberta = { passo, midi: null, passos: 1 };
        notas.push(aberta);
      } else {
        const grau = Number(f);
        if (!Number.isInteger(grau)) throw new Error(`passo inválido "${f}" em "${c}"`);
        aberta = { passo, midi: tonica + oitava + grauEmSemitons(grau, escala), passos: 1 };
        notas.push(aberta);
      }
      passo++;
    }
  }
  return { notas, passos: passo };
}

interface CamadaTocando {
  instrumento: Instrumento;
  passos: number;
  porPasso: Map<number, NotaDoPadrao[]>;
  intensa: boolean;
  ganho: GainNode;
}

interface TrilhaTocando {
  nome: NomeDaTrilha;
  inicio: number;
  passoS: number;
  proximo: number;
  ganho: GainNode;
  camadas: CamadaTocando[];
  /** Quando já está sumindo: o instante em que para de vez. */
  paraEm: number | null;
}

/**
 * Toca as trilhas de `audio.json` → `musica` num `AudioContext`: cada camada repete o próprio
 * padrão, as camadas intensas entram e saem com o combate e a troca de trilha é um cruzamento.
 */
export class Musica {
  notasTocadas = 0;
  private trilhas: TrilhaTocando[] = [];
  private intensidade = 0;
  private relogio: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly saida: AudioNode,
    private readonly ruido: AudioBuffer,
    private readonly cfg: ConfigMusica,
  ) {}

  get trilhaAtual(): NomeDaTrilha | null {
    return this.trilhas.find((t) => t.paraEm === null)?.nome ?? null;
  }

  /** Troca a trilha (null = silêncio). A mesma trilha continua de onde estava. */
  tocar(nome: NomeDaTrilha | null): void {
    if (nome === this.trilhaAtual) return;
    const agora = this.ctx.currentTime;
    const t = this.cfg.transicaoS;
    for (const tr of this.trilhas) {
      if (tr.paraEm !== null) continue;
      tr.ganho.gain.cancelScheduledValues(agora);
      tr.ganho.gain.setValueAtTime(tr.ganho.gain.value, agora);
      tr.ganho.gain.linearRampToValueAtTime(0, agora + t);
      tr.paraEm = agora + t;
    }
    const def = nome ? this.cfg.trilhas[nome] : undefined;
    if (def) {
      const ganho = this.ctx.createGain();
      ganho.gain.setValueAtTime(0, agora);
      ganho.gain.linearRampToValueAtTime(1, agora + t);
      ganho.connect(this.saida);
      const camadas = def.camadas.map((c): CamadaTocando => {
        const instrumento = this.cfg.instrumentos[c.instrumento]!;
        const { notas, passos } = compilarPadrao(
          c.padrao,
          this.cfg.escala,
          this.cfg.tonica,
          instrumento.oitava,
        );
        const porPasso = new Map<number, NotaDoPadrao[]>();
        for (const n of notas) porPasso.set(n.passo, [...(porPasso.get(n.passo) ?? []), n]);
        const g = this.ctx.createGain();
        g.gain.value = c.intensa ? this.intensidade : 1;
        g.connect(ganho);
        return { instrumento, passos, porPasso, intensa: c.intensa, ganho: g };
      });
      this.trilhas.push({
        nome: nome!,
        inicio: agora + 0.05,
        passoS: 60 / def.bpm / 4,
        proximo: 0,
        ganho,
        camadas,
        paraEm: null,
      });
    }
    this.relogio ??= setInterval(() => this.agendar(), INTERVALO_DO_AGENDADOR_MS);
    this.agendar();
  }

  /** 0 = rua calma, 1 = combate: as camadas intensas sobem ou descem devagar. */
  definirIntensidade(alvo: number): void {
    if (alvo === this.intensidade) return;
    this.intensidade = alvo;
    const agora = this.ctx.currentTime;
    for (const tr of this.trilhas)
      for (const c of tr.camadas) {
        if (!c.intensa) continue;
        c.ganho.gain.cancelScheduledValues(agora);
        c.ganho.gain.setValueAtTime(c.ganho.gain.value, agora);
        c.ganho.gain.linearRampToValueAtTime(alvo, agora + this.cfg.transicaoS);
      }
  }

  private agendar(): void {
    const agora = this.ctx.currentTime;
    this.trilhas = this.trilhas.filter((tr) => {
      if (tr.paraEm !== null && agora > tr.paraEm) {
        tr.ganho.disconnect();
        return false;
      }
      return true;
    });
    if (this.trilhas.length === 0 && this.relogio !== null) {
      clearInterval(this.relogio);
      this.relogio = null;
      return;
    }
    for (const tr of this.trilhas) {
      // Uma aba escondida volta muito atrasada: pula para o presente em vez de tocar tudo junto.
      const atraso = agora - (tr.inicio + tr.proximo * tr.passoS);
      if (atraso > 1) tr.proximo += Math.floor(atraso / tr.passoS);
      while (tr.inicio + tr.proximo * tr.passoS < agora + ANTECEDENCIA_S) {
        const t = Math.max(agora, tr.inicio + tr.proximo * tr.passoS);
        for (const c of tr.camadas) {
          const notas = c.porPasso.get(tr.proximo % c.passos);
          if (!notas) continue;
          // Camada intensa em silêncio: não gasta osciladores.
          if (c.intensa && this.intensidade === 0 && c.ganho.gain.value < 0.01) continue;
          for (const n of notas) this.nota(c, n, t, n.passos * tr.passoS);
        }
        tr.proximo++;
      }
    }
  }

  private nota(c: CamadaTocando, n: NotaDoPadrao, t0: number, duracaoS: number): void {
    const ins = c.instrumento;
    const ctx = this.ctx;
    const fim = t0 + (n.midi === null ? 0 : duracaoS) + ins.soltarS;
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENCIO, t0);
    env.gain.linearRampToValueAtTime(ins.volume, t0 + Math.max(0.001, ins.ataqueS));
    if (n.midi !== null) env.gain.setValueAtTime(ins.volume, t0 + Math.max(duracaoS, ins.ataqueS));
    env.gain.exponentialRampToValueAtTime(SILENCIO, fim);
    env.connect(c.ganho);
    let destino: AudioNode = env;
    if (ins.filtro || ins.onda === 'ruido') {
      const f = ctx.createBiquadFilter();
      f.type = ins.onda === 'ruido' && (ins.freqBatida ?? 0) > 4000 ? 'highpass' : 'lowpass';
      f.frequency.value = ins.onda === 'ruido' ? (ins.freqBatida ?? 3000) : ins.filtro!;
      f.connect(env);
      destino = f;
    }
    let fonte: AudioScheduledSourceNode;
    if (ins.onda === 'ruido') {
      const r = ctx.createBufferSource();
      r.buffer = this.ruido;
      fonte = r;
    } else {
      const o = ctx.createOscillator();
      o.type = ONDAS[ins.onda];
      const freq = n.midi === null ? (ins.freqBatida ?? 100) : frequenciaMidi(n.midi);
      o.frequency.setValueAtTime(freq, t0);
      if (ins.queda) o.frequency.exponentialRampToValueAtTime(freq * ins.queda, fim);
      fonte = o;
    }
    fonte.connect(destino);
    fonte.start(t0);
    fonte.stop(fim + 0.02);
    fonte.onended = () => env.disconnect();
    this.notasTocadas++;
  }
}

const ONDAS: Record<Exclude<Instrumento['onda'], 'ruido'>, OscillatorType> = {
  seno: 'sine',
  quadrada: 'square',
  triangulo: 'triangle',
  serra: 'sawtooth',
};
