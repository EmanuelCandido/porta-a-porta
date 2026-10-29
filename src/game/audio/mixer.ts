import { audio } from '../../sim/content';
import type { Audio, SomDoJogo } from '../../sim/content/esquemas';

type CamadaDeSom = SomDoJogo['camadas'][number];
import { BancoDeAudio, escolherVariacao, semitonsDoSom, SorteioDoAudio } from './gravados';
import { Musica, type NomeDaTrilha } from './musica';
import { MusicaGravada } from './musicaGravada';
import type { SomPedido } from './sons';

type Canal = SomDoJogo['canal'];
type Onda = SomDoJogo['camadas'][number]['onda'];

const TIPO_DE_FILTRO: Record<CamadaDeSom['filtroTipo'], BiquadFilterType> = {
  baixa: 'lowpass',
  alta: 'highpass',
  banda: 'bandpass',
};

const OSCILADOR: Record<Exclude<Onda, 'ruido'>, OscillatorType> = {
  seno: 'sine',
  quadrada: 'square',
  triangulo: 'triangle',
  serra: 'sawtooth',
};

/** Escolha de som ligado ou desligado: fica no navegador, fora do save do progresso. */
const CHAVE_DO_SOM = 'portaAPorta:som';
/** Subida e descida do envelope de cada camada, em segundos (evita o estalo de corte). */
const SUBIDA_S = 0.005;
const SILENCIO = 0.0001;
/** O ruído é um trecho fixo gerado uma vez, tocado do começo em cada som. */
const RUIDO_S = 1;
/** Intervalo mínimo entre dois iguais, para um som gravado que não tem o sintetizado. */
const INTERVALO_MINIMO_GRAVADO_S = 0.04;

/** Fator de frequência para subir `semitons` (12 = uma oitava). */
export function fatorDeSemitons(semitons: number): number {
  return 2 ** (semitons / 12);
}

/** Ruído branco determinístico (o projeto não usa `Math.random`). */
function preencherRuido(dados: Float32Array): void {
  let s = 0x2f6b3a1d;
  for (let i = 0; i < dados.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    dados[i] = (s / 0xffffffff) * 2 - 1;
  }
}

function lerEscolha(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DO_SOM) !== '0';
  } catch {
    return true;
  }
}

function gravarEscolha(ligado: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_DO_SOM, ligado ? '1' : '0');
  } catch {
    // Sem armazenamento (janela privada): a escolha vale só nesta sessão.
  }
}

/**
 * Mixer do jogo: os efeitos e a música gravados (arquivos CC0 de `public/audio`, quando há) e os
 * sintetizados (osciladores e ruído com envelope) para o que não tem arquivo ou ainda não
 * carregou; volume geral, de efeitos e de interface. O navegador só libera áudio depois de um gesto, então o contexto nasce
 * no primeiro clique ou tecla. M liga e desliga o som em qualquer tela.
 */
export class Mixer {
  ligado = lerEscolha();
  /** Quantos sons já tocaram (para os testes). */
  tocados = 0;
  private contexto: AudioContext | null = null;
  private geral: GainNode | null = null;
  private canais: Record<Canal, GainNode> | null = null;
  private ruido: AudioBuffer | null = null;
  private readonly ultimo = new Map<string, number>();
  private preparado = false;
  private musica: Musica | null = null;
  /** Trilha e intensidade pedidas antes do primeiro gesto: tocam quando o áudio acordar. */
  private trilhaPedida: NomeDaTrilha | null = null;
  private intensidadePedida = 0;
  private banco: BancoDeAudio | null = null;
  private gravada: MusicaGravada | null = null;
  private readonly sorteio = new SorteioDoAudio();
  private readonly ultimaVariacao = new Map<string, number>();
  /** Quantos sons tocaram de arquivo (para os testes). */
  tocadosDeArquivo = 0;

  constructor(private readonly cfg: Audio) {}

  get estadoDoContexto(): string {
    return this.contexto?.state ?? 'sem contexto';
  }

  /** O que a música está tocando (para os testes). */
  get estadoDaMusica(): {
    trilha: NomeDaTrilha | null;
    notas: number;
    intensidade: number;
    gravada: NomeDaTrilha | null;
    arquivos: number;
    falhas: number;
  } {
    return {
      trilha: this.gravada?.tocando ?? this.musica?.trilhaAtual ?? null,
      notas: this.musica?.notasTocadas ?? 0,
      intensidade: this.intensidadePedida,
      gravada: this.gravada?.tocando ?? null,
      arquivos: this.banco?.carregados ?? 0,
      falhas: (this.banco?.falhas ?? 0) + (this.gravada?.falhas ?? 0),
    };
  }

  /** Troca a trilha de fundo (`audio.json` → `musica.trilhas`); null deixa em silêncio. */
  trilha(nome: NomeDaTrilha | null): void {
    this.trilhaPedida = nome;
    this.aplicarTrilha();
  }

  /** A trilha pedida toca gravada, se tiver arquivo; senão, a sintetizada. */
  private aplicarTrilha(): void {
    const nome = this.trilhaPedida;
    const gravada = !!this.gravada?.temTrilha(nome);
    this.gravada?.tocar(gravada ? nome : null);
    this.musica?.tocar(gravada ? null : nome);
  }

  /** Combate na rua (1) ou calma (0): as camadas intensas da trilha entram e saem. */
  intensidade(alvo: number): void {
    this.intensidadePedida = alvo;
    this.musica?.definirIntensidade(alvo);
    this.gravada?.definirIntensidade(alvo);
  }

  /** Vinheta gravada (vitória, derrota), com a música abaixada enquanto toca. */
  vinheta(nome: string): void {
    if (!this.ligado || !this.canais) return;
    this.gravada?.vinheta(nome, this.canais.efeitos);
  }

  /** Liga os ouvintes do primeiro gesto e da tecla M (uma vez só). */
  preparar(): void {
    if (this.preparado || typeof window === 'undefined') return;
    this.preparado = true;
    const acordar = () => this.acordar();
    window.addEventListener('pointerdown', acordar);
    window.addEventListener('keydown', (e) => {
      this.acordar();
      if (e.repeat || (e.key !== 'm' && e.key !== 'M')) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
      this.alternar();
    });
  }

  private acordar(): void {
    if (!this.contexto) {
      const Contexto =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Contexto) return;
      const ctx = new Contexto();
      this.contexto = ctx;
      this.geral = ctx.createGain();
      this.geral.gain.value = this.ligado ? this.cfg.volumes.geral : 0;
      this.geral.connect(ctx.destination);
      const canal = (volume: number) => {
        const g = ctx.createGain();
        g.gain.value = volume;
        g.connect(this.geral!);
        return g;
      };
      this.canais = {
        efeitos: canal(this.cfg.volumes.efeitos),
        interface: canal(this.cfg.volumes.interface),
      };
      this.ruido = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * RUIDO_S), ctx.sampleRate);
      preencherRuido(this.ruido.getChannelData(0));
      this.musica = new Musica(ctx, canal(this.cfg.musica.volume), this.ruido, this.cfg.musica);
      this.musica.definirIntensidade(this.intensidadePedida);
      this.banco = new BancoDeAudio(ctx);
      const gravada = this.cfg.musica.gravada;
      if (gravada)
        // Uma trilha que não carregou volta para a sintetizada.
        this.gravada = new MusicaGravada(ctx, canal(1), gravada, this.banco, (nome) => {
          if (this.trilhaPedida === nome) this.musica?.tocar(nome);
        });
      this.gravada?.definirIntensidade(this.intensidadePedida);
      this.aplicarTrilha();
      // Os efeitos gravados carregam logo (são pequenos); até chegarem, toca o sintetizado.
      const a = this.cfg.arquivos;
      if (a)
        for (const som of Object.values(a.sons))
          for (const arq of som.arquivos) void this.banco.carregar(`${a.pasta}${arq}${a.extensao}`);
    }
    if (this.contexto.state === 'suspended') void this.contexto.resume();
  }

  alternar(): boolean {
    this.ligado = !this.ligado;
    gravarEscolha(this.ligado);
    if (this.geral && this.contexto)
      this.geral.gain.setValueAtTime(
        this.ligado ? this.cfg.volumes.geral : 0,
        this.contexto.currentTime,
      );
    return this.ligado;
  }

  /**
   * O som gravado, se ele tiver arquivo e a variação sorteada já carregou: uma variação diferente
   * da anterior, com o tom de base, o do jogo (combo) e um pouco de variação. Devolve se tocou.
   */
  private tocarGravado(nome: string, semitons: number): boolean {
    const a = this.cfg.arquivos;
    const def = a?.sons[nome];
    const ctx = this.contexto;
    if (!a || !def || !ctx || !this.canais || !this.banco) return false;
    const k = escolherVariacao(
      def.arquivos.length,
      this.ultimaVariacao.get(nome) ?? null,
      this.sorteio,
    );
    const buffer = this.banco.pronto(`${a.pasta}${def.arquivos[k]}${a.extensao}`);
    if (!buffer) return false;
    if (!this.ligado || ctx.state !== 'running') return true;
    const minimo = this.cfg.sons[nome]?.intervaloMinimoS ?? INTERVALO_MINIMO_GRAVADO_S;
    const agora = ctx.currentTime;
    if (agora - (this.ultimo.get(nome) ?? Number.NEGATIVE_INFINITY) < minimo) return true;
    this.ultimo.set(nome, agora);
    this.ultimaVariacao.set(nome, k);
    this.tocados++;
    this.tocadosDeArquivo++;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.playbackRate.value = fatorDeSemitons(
      semitonsDoSom(def.tom, semitons, def.variacaoTom, this.sorteio),
    );
    const ganho = ctx.createGain();
    ganho.gain.value = def.volume;
    fonte.connect(ganho);
    ganho.connect(this.canais[this.cfg.sons[nome]?.canal ?? 'efeitos']);
    fonte.onended = () => ganho.disconnect();
    fonte.start(agora + def.atrasoS);
    return true;
  }

  tocarPedidos(pedidos: readonly SomPedido[]): void {
    for (const p of pedidos) this.tocar(p.som, p.semitons);
  }

  tocar(nome: string, semitons = 0): void {
    const arquivo = this.cfg.arquivos?.sons[nome];
    const gravou = this.tocarGravado(nome, semitons);
    // O arquivo pode ser só uma parte do som (o vidro da poção): as camadas tocam junto.
    if (gravou && !arquivo?.comSintese) return;
    const som = this.cfg.sons[nome];
    const ctx = this.contexto;
    if (!som || !ctx || !this.canais || !this.ligado || ctx.state !== 'running') return;
    const agora = ctx.currentTime;
    if (!gravou) {
      if (agora - (this.ultimo.get(nome) ?? Number.NEGATIVE_INFINITY) < som.intervaloMinimoS)
        return;
      this.ultimo.set(nome, agora);
      this.tocados++;
    }
    const saida = this.canais[som.canal];
    for (const c of som.camadas) {
      const r = c.repetir;
      const vezes = r?.vezes ?? 1;
      for (let k = 0; k < vezes; k++) {
        const folga = r ? k * r.intervaloS + this.sorteio.proximo() * r.variacaoS : 0;
        const tom = r ? (this.sorteio.proximo() * 2 - 1) * r.variacaoTom : 0;
        const volume = c.volume * (r ? r.cair ** k : 1);
        const t0 = agora + c.inicioS + folga;
        this.camada(ctx, saida, c, t0, fatorDeSemitons(semitons + tom), volume);
      }
    }
  }

  /** Uma camada sintetizada: oscilador (ou ruído) com filtro e envelope, começando em `t0`. */
  private camada(
    ctx: AudioContext,
    saida: AudioNode,
    c: CamadaDeSom,
    t0: number,
    fator: number,
    volume: number,
  ): void {
    const t1 = t0 + c.duracaoS;
    const subida = Math.min(c.ataqueS ?? SUBIDA_S, c.duracaoS * 0.9);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(SILENCIO, t0);
    envelope.gain.exponentialRampToValueAtTime(Math.max(SILENCIO, volume), t0 + subida);
    envelope.gain.exponentialRampToValueAtTime(SILENCIO, t1);
    envelope.connect(saida);
    const filtroDe = (freq: number, fim?: number): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = TIPO_DE_FILTRO[c.filtroTipo];
      f.frequency.setValueAtTime(freq, t0);
      if (fim) f.frequency.exponentialRampToValueAtTime(fim, t1);
      if (c.ressonancia) f.Q.value = c.ressonancia;
      f.connect(envelope);
      return f;
    };
    let fonte: AudioScheduledSourceNode;
    if (c.onda === 'ruido') {
      const r = ctx.createBufferSource();
      r.buffer = this.ruido;
      r.loop = true;
      r.connect(filtroDe(c.freq * fator, c.freqFim ? c.freqFim * fator : undefined));
      fonte = r;
      // Começa num ponto sorteado do ruído: grãos repetidos não soam iguais.
      r.start(t0, this.sorteio.proximo() * 0.5);
    } else {
      const o = ctx.createOscillator();
      o.type = OSCILADOR[c.onda];
      o.frequency.setValueAtTime(c.freq * fator, t0);
      if (c.freqFim) o.frequency.exponentialRampToValueAtTime(c.freqFim * fator, t1);
      o.connect(c.filtro ? filtroDe(c.filtro) : envelope);
      fonte = o;
      o.start(t0);
    }
    fonte.stop(t1 + SUBIDA_S);
    fonte.onended = () => envelope.disconnect();
  }
}

/** O mixer do jogo (um contexto de áudio para todas as cenas). */
export const mixer = new Mixer(audio);

/**
 * Clique na interface: toca em qualquer botão da cena (os objetos com a mãozinha do cursor), sem
 * tocar no fundo escuro que só segura o clique.
 */
export function somDeCliqueNaCena(cena: {
  input: {
    on(
      evento: string,
      f: (p: unknown, obj: { input?: { cursor?: string | boolean } | null }) => void,
    ): unknown;
  };
}): void {
  cena.input.on('gameobjectdown', (_p, obj) => {
    if (obj.input?.cursor) mixer.tocar('clique');
  });
}
