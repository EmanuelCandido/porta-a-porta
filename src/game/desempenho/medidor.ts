import type * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { resumoDosQuadros } from '../../render/medidas';
import { nivelDeQualidade } from './qualidade';

interface Quadro {
  em: number;
  intervaloMs: number;
  cpuRuaMs: number;
}
const historico: MedidorDaRua[] = [];
let solicitado: number | null = null;

export function marcarInicioDaRun(): void {
  solicitado = performance.now();
}

export class MedidorDaRua {
  private readonly inicio = solicitado ?? performance.now();
  private jogavel: number | null = null;
  private anterior: number | null = null;
  private inicioQuadro = 0;
  private readonly iniciais: Quadro[] = [];
  private readonly recentes: Quadro[] = [];
  private cursor = 0;
  private readonly etapas = new Map<
    string,
    { chamadas: number; totalMs: number; piorMs: number }
  >();
  private estadoFinal: ReturnType<MedidorDaRua['memoria']> | null = null;
  readonly qualidade = nivelDeQualidade();

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly rua: string,
  ) {
    solicitado = null;
    historico.push(this);
    while (historico.length > visual.desempenho.ruasNoRelatorio) historico.shift();
    cena.events.once('shutdown', () => {
      this.estadoFinal = this.memoria();
    });
    window.__desempenho = { relatorio: relatorioDeDesempenho };
  }

  pronta(): void {
    this.jogavel = performance.now();
    this.anterior = null;
  }
  iniciarQuadro(): void {
    this.inicioQuadro = performance.now();
  }

  etapa<T>(nome: string, fazer: () => T): T {
    const inicio = performance.now();
    try {
      return fazer();
    } finally {
      const ms = performance.now() - inicio;
      let etapa = this.etapas.get(nome);
      if (!etapa) this.etapas.set(nome, (etapa = { chamadas: 0, totalMs: 0, piorMs: 0 }));
      etapa.chamadas++;
      etapa.totalMs += ms;
      etapa.piorMs = Math.max(etapa.piorMs, ms);
    }
  }

  concluirQuadro(pausado: boolean): void {
    if (this.jogavel === null || pausado || document.hidden) {
      this.anterior = null;
      return;
    }
    if (this.anterior !== null) {
      const q = {
        em: this.inicioQuadro - this.jogavel,
        intervaloMs: this.inicioQuadro - this.anterior,
        cpuRuaMs: performance.now() - this.inicioQuadro,
      };
      if (q.em <= 30000 && this.iniciais.length < visual.desempenho.amostrasPorRua)
        this.iniciais.push(q);
      this.recentes[this.cursor] = q;
      this.cursor = (this.cursor + 1) % visual.desempenho.amostrasPorRua;
    }
    this.anterior = this.inicioQuadro;
  }

  private memoria() {
    const memoria = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const texturas = Object.values(this.cena.textures.list) as Phaser.Textures.Texture[];
    return {
      heapJsMB: memoria.memory ? memoria.memory.usedJSHeapSize / 1048576 : null,
      texturasVivas: texturas.length,
      pixelsDasTexturasMB:
        texturas.reduce(
          (total, t) =>
            total + t.source.reduce((s, fonte) => s + fonte.width * fonte.height * 4, 0),
          0,
        ) / 1048576,
    };
  }

  resumo() {
    const janela = (de: number, ate: number) =>
      resumoDosQuadros(
        this.iniciais.filter((q) => q.em >= de && q.em < ate).map((q) => q.intervaloMs),
      );
    return {
      rua: this.rua,
      qualidade: this.qualidade,
      ateJogavelMs: this.jogavel === null ? null : this.jogavel - this.inicio,
      inicio0a5: janela(0, 5000),
      trecho5a15: janela(5000, 15000),
      trecho15a30: janela(15000, 30000),
      quadrosRecentes: resumoDosQuadros(this.recentes.map((q) => q.intervaloMs)),
      cpuRuaRecente: resumoDosQuadros(this.recentes.map((q) => q.cpuRuaMs)),
      etapas: Object.fromEntries(this.etapas),
      memoria: this.estadoFinal ?? this.memoria(),
    };
  }
}

export function relatorioDeDesempenho() {
  const canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    versao: 1,
    geradoEm: new Date().toISOString(),
    ambiente: {
      navegador: navigator.userAgent,
      nucleosLogicos: navigator.hardwareConcurrency,
      janela: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      renderizador: ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
    },
    observacao:
      'Intervalos reais entre updates. CPU mede só a CenaRua; inclui pausas de impacto nos intervalos. Pausa de menu e aba oculta ficam fora. Pixels das texturas são uma estimativa RGBA, não VRAM total do processo. Sem coleta de lixo forçada.',
    ruas: historico.map((m) => m.resumo()),
  };
}

export function salvarRelatorioDeDesempenho(): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(relatorioDeDesempenho(), null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `porta-a-porta-desempenho-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

declare global {
  interface Window {
    __desempenho?: { relatorio: typeof relatorioDeDesempenho };
  }
}
