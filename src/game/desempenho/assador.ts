import { assarModelo, type Assado } from '../../render/assar';
import type { Poligono } from '../../render/geometria';

interface Resposta {
  base: ImageBitmap;
  emissivo: ImageBitmap | null;
  x: number;
  y: number;
  erro?: boolean;
}

/** Um trabalho por vez; ao encerrar a rua, a fila e os bitmaps deixam de existir. */
export class AssadorDePoses {
  private worker: Worker | null = null;
  private terminou = false;
  private falhou = false;
  private pendente: (() => void) | null = null;
  ocupado = false;

  get emSegundoPlano(): boolean {
    return !!this.worker;
  }

  assar(polys: Poligono[], resolucao: number, receber: (a: Assado) => void): void {
    if (this.terminou || this.ocupado) return;
    this.ocupado = true;
    const reserva = () => {
      this.worker?.terminate();
      this.worker = null;
      this.falhou = true;
      this.pendente = null;
      this.ocupado = false;
      if (!this.terminou) receber(assarModelo(polys, resolucao));
    };
    try {
      if (
        !this.worker &&
        !this.falhou &&
        typeof Worker !== 'undefined' &&
        typeof OffscreenCanvas !== 'undefined'
      )
        this.worker = new Worker(new URL('../../render/assar.worker.ts', import.meta.url), {
          type: 'module',
        });
      if (!this.worker) {
        reserva();
        return;
      }
      this.pendente = reserva;
      this.worker.onerror = (e) => {
        e.preventDefault();
        reserva();
      };
      this.worker.onmessage = (e: MessageEvent<Resposta>) => {
        if (e.data.erro) {
          reserva();
          return;
        }
        const { base, emissivo, x, y } = e.data;
        try {
          if (this.terminou) return;
          const copiar = (bitmap: ImageBitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
            return canvas;
          };
          receber({ base: copiar(base), emissivo: emissivo ? copiar(emissivo) : null, x, y });
        } finally {
          base.close();
          emissivo?.close();
          this.ocupado = false;
          this.pendente = null;
        }
      };
      this.worker.postMessage({ polys, resolucao });
    } catch {
      this.pendente?.();
      if (this.ocupado) reserva();
    }
  }

  destruir(): void {
    this.terminou = true;
    this.worker?.terminate();
    this.worker = null;
    this.pendente = null;
    this.ocupado = false;
  }
}
