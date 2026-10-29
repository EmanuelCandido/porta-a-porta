/** Estado que a cena publica em `window.__portaAPorta` para os testes do Playwright. */
export interface EstadoTeste {
  cena: string;
  pronta: boolean;
  [chave: string]: unknown;
}

declare global {
  interface Window {
    __portaAPorta?: EstadoTeste;
  }
}

export function publicarEstado(estado: EstadoTeste): void {
  window.__portaAPorta = estado;
}
