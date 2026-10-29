import type { Audio } from '../../sim/content/esquemas';
import { ganhosDaIntensidade, type BancoDeAudio } from './gravados';

type ConfigGravada = NonNullable<Audio['musica']['gravada']>;

/** Uma faixa em loop tocando por streaming, com o ganho próprio (para entrar e sair suave). */
interface Faixa {
  elemento: HTMLAudioElement;
  fonte: MediaElementAudioSourceNode;
  ganho: GainNode;
}

/**
 * A música gravada (PLANO_MUNDO_VIVO.md, frente 6): uma faixa em loop por trilha; na rua, a camada
 * de combate toca junto e entra com a intensidade; as vinhetas abaixam a música enquanto tocam.
 * Uma trilha sem arquivo (ou que falhou) fica com a música sintetizada (`aoFaltar`).
 *
 * As faixas tocam por `<audio>` em streaming, ligadas ao mesmo mixer (PLANO_OTIMIZACAO.md, O4.1):
 * só alguns segundos ficam na memória, em vez da trilha inteira descomprimida (~23 MB por minuto).
 * As vinhetas, curtas, continuam em AudioBuffer.
 */
export class MusicaGravada {
  private atual: { nome: string; base: Faixa | null; combate: Faixa | null } | null = null;
  private intensidade = 0;
  /** Para os testes: a trilha que toca por arquivo agora. */
  tocando: string | null = null;
  /** Para os testes: faixas que não tocaram (arquivo faltando ou formato sem suporte). */
  falhas = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly saida: GainNode,
    private readonly cfg: ConfigGravada,
    private readonly banco: BancoDeAudio,
    private readonly aoFaltar: (nome: string) => void,
  ) {
    this.saida.gain.value = cfg.volume;
  }

  /** Esta trilha tem arquivo? (senão a sintetizada toca). */
  temTrilha(nome: string | null): boolean {
    return nome !== null && nome in this.cfg.trilhas;
  }

  private caminho(arquivo: string): string {
    return `${this.cfg.pasta}${arquivo}`;
  }

  tocar(nome: string | null): void {
    if (nome === (this.atual?.nome ?? null)) return;
    this.parar();
    if (!nome || !this.temTrilha(nome)) return;
    const pedido = { nome, base: null as Faixa | null, combate: null as Faixa | null };
    this.atual = pedido;
    const g = this.cfg.mixagem.ganhos[nome] ?? 1;
    pedido.base = this.comecar(
      this.caminho(this.cfg.trilhas[nome]!),
      (nome === 'rua' ? ganhosDaIntensidade(this.intensidade, this.cfg.mixagem).rua : 1) * g,
      () => {
        if (this.atual === pedido) this.tocando = nome;
      },
      () => {
        if (this.atual !== pedido) return;
        this.parar();
        this.aoFaltar(nome);
      },
    );
    if (nome === 'rua' && this.cfg.combate)
      pedido.combate = this.comecar(
        this.caminho(this.cfg.combate),
        ganhosDaIntensidade(this.intensidade, this.cfg.mixagem).combate,
      );
  }

  /** A luta na rua (0 a 1): a camada de combate entra e a rua baixa. */
  definirIntensidade(alvo: number): void {
    this.intensidade = alvo;
    const a = this.atual;
    if (!a || a.nome !== 'rua') return;
    const g = ganhosDaIntensidade(alvo, this.cfg.mixagem);
    const t = this.ctx.currentTime;
    const ganhoRua = this.cfg.mixagem.ganhos['rua'] ?? 1;
    a.base?.ganho.gain.setTargetAtTime(g.rua * ganhoRua, t, this.cfg.transicaoS / 3);
    a.combate?.ganho.gain.setTargetAtTime(g.combate, t, this.cfg.transicaoS / 3);
  }

  /** Vinheta (vitória, derrota): toca uma vez, com a música abaixada enquanto dura. */
  vinheta(nome: string, canal: AudioNode): void {
    const arquivo = this.cfg.vinhetas[nome];
    if (!arquivo) return;
    void this.banco.carregar(this.caminho(arquivo)).then((b) => {
      if (!b) return;
      const t = this.ctx.currentTime;
      const fonte = this.ctx.createBufferSource();
      fonte.buffer = b;
      fonte.connect(canal);
      fonte.start(t);
      const g = this.saida.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(this.cfg.volume * this.cfg.abafarNaVinheta, t, 0.05);
      g.setTargetAtTime(this.cfg.volume, t + b.duration, 0.4);
    });
  }

  /** Abre o arquivo num `<audio>` em loop e o liga ao mixer, entrando suave. */
  private comecar(
    caminho: string,
    ganho: number,
    aoTocar?: () => void,
    aoFalhar?: () => void,
  ): Faixa {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setTargetAtTime(ganho, t, this.cfg.transicaoS / 3);
    g.connect(this.saida);
    const elemento = document.createElement('audio');
    elemento.loop = true;
    elemento.preload = 'auto';
    elemento.src = caminho;
    const fonte = this.ctx.createMediaElementSource(elemento);
    fonte.connect(g);
    let falhou = false;
    const falhar = () => {
      if (falhou) return;
      falhou = true;
      this.falhas++;
      aoFalhar?.();
    };
    if (aoTocar) elemento.addEventListener('playing', aoTocar, { once: true });
    elemento.addEventListener('error', falhar, { once: true });
    this.reproduzir(elemento, falhar);
    return { elemento, fonte, ganho: g };
  }

  /** `play()`; se o navegador ainda não deixar (sem gesto), tenta de novo no próximo gesto. */
  private reproduzir(elemento: HTMLAudioElement, falhar: () => void): void {
    elemento.play().catch((e: unknown) => {
      const nome = e instanceof DOMException ? e.name : '';
      // Pausada antes de começar (a trilha trocou): nada a fazer.
      if (nome === 'AbortError') return;
      if (nome !== 'NotAllowedError') return falhar();
      const tentar = () => {
        window.removeEventListener('pointerdown', tentar);
        window.removeEventListener('keydown', tentar);
        if (elemento.src) this.reproduzir(elemento, falhar);
      };
      window.addEventListener('pointerdown', tentar);
      window.addEventListener('keydown', tentar);
    });
  }

  /** Para o `<audio>` e solta o que ele guardou (o navegador libera o buffer do streaming). */
  private soltar(f: Faixa): void {
    f.elemento.pause();
    f.elemento.removeAttribute('src');
    f.elemento.load();
    f.fonte.disconnect();
    f.ganho.disconnect();
  }

  private parar(): void {
    const a = this.atual;
    this.atual = null;
    this.tocando = null;
    if (!a) return;
    const t = this.ctx.currentTime;
    for (const f of [a.base, a.combate]) {
      if (!f) continue;
      f.ganho.gain.cancelScheduledValues(t);
      f.ganho.gain.setTargetAtTime(0.0001, t, this.cfg.transicaoS / 3);
      setTimeout(() => this.soltar(f), this.cfg.transicaoS * 2 * 1000);
    }
  }
}
