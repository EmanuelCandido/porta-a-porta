import { assarModelo } from './assar';
import type { Poligono } from './geometria';

/** A rasterização das poses não disputa o quadro de jogo com entrada, simulação e desenho. */
self.onmessage = (evento: MessageEvent<{ polys: Poligono[]; resolucao: number }>) => {
  try {
    const a = assarModelo(
      evento.data.polys,
      evento.data.resolucao,
      () => new OffscreenCanvas(1, 1),
    );
    const base = a.base.transferToImageBitmap();
    const emissivo = a.emissivo?.transferToImageBitmap() ?? null;
    self.postMessage(
      { base, emissivo, x: a.x, y: a.y },
      { transfer: emissivo ? [base, emissivo] : [base] },
    );
  } catch {
    self.postMessage({ erro: true });
  }
};
