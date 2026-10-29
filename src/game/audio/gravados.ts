// Áudio gravado (PLANO_MUNDO_VIVO.md, frente 6): os arquivos CC0 de `public/audio`. Os efeitos e as
// vinhetas são carregados uma vez e guardados decodificados; a música toca em streaming
// (`musicaGravada.ts`). As contas de escolha (variação e tom) são puras, para os testes.

/**
 * Sorteio pequeno e determinístico do áudio (o projeto não usa `Math.random`): o mesmo jogo soa
 * igual, mas os sons não se repetem em sequência.
 */
export class SorteioDoAudio {
  constructor(private estado = 0x9e3779b9) {}

  /** Número de 0 a 1. */
  proximo(): number {
    this.estado = (Math.imul(this.estado, 1664525) + 1013904223) >>> 0;
    return this.estado / 0x100000000;
  }
}

/** Qual variação tocar: qualquer uma menos a anterior (com uma só, sempre ela). */
export function escolherVariacao(
  n: number,
  anterior: number | null,
  sorteio: SorteioDoAudio,
): number {
  if (n <= 1) return 0;
  const k = Math.floor(sorteio.proximo() * (anterior === null ? n : n - 1));
  return anterior !== null && k >= anterior ? k + 1 : k;
}

/** Semitons do som: o tom de base, os do jogo (combo) e uma variação de ± `variacao`. */
export function semitonsDoSom(
  tom: number,
  doJogo: number,
  variacao: number,
  sorteio: SorteioDoAudio,
): number {
  return tom + doJogo + (sorteio.proximo() * 2 - 1) * variacao;
}

/** Mixagem da rua com a camada de combate (`audio.json` → `musica.gravada.mixagem`). */
export interface MixagemDeCombate {
  /** Ganho da camada de combate na luta (a faixa é mais baixa que a da rua: o ganho iguala). */
  combate: number;
  /** Quanto da rua fica tocando na luta (0 a 1). */
  ruaEmCombate: number;
}

/**
 * Ganho da rua e da camada de combate para a intensidade (0 calma, 1 luta): a luta entra por cima,
 * mais forte que a rua, e a rua baixa sem sumir de vez. A energia sobe quando a luta começa.
 */
export function ganhosDaIntensidade(
  intensidade: number,
  mix: MixagemDeCombate = { combate: 1, ruaEmCombate: 0.15 },
): { rua: number; combate: number } {
  const i = Math.max(0, Math.min(1, intensidade));
  return { rua: 1 - (1 - mix.ruaEmCombate) * i, combate: mix.combate * i };
}

/** Arquivos decodificados, por caminho; cada um é buscado uma vez só. */
export class BancoDeAudio {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pedidos = new Map<string, Promise<AudioBuffer | null>>();
  /** Quantos arquivos falharam (para os testes e o modo dev). */
  falhas = 0;

  constructor(private readonly ctx: BaseAudioContext) {}

  /** O buffer já carregado (ou null, se ainda não chegou). */
  pronto(caminho: string): AudioBuffer | null {
    return this.buffers.get(caminho) ?? null;
  }

  get carregados(): number {
    return this.buffers.size;
  }

  carregar(caminho: string): Promise<AudioBuffer | null> {
    const ja = this.pedidos.get(caminho);
    if (ja) return ja;
    const pedido = fetch(caminho)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((dados) => this.ctx.decodeAudioData(dados))
      .then((b) => {
        this.buffers.set(caminho, b);
        return b;
      })
      .catch(() => {
        this.falhas++;
        return null;
      });
    this.pedidos.set(caminho, pedido);
    return pedido;
  }
}
