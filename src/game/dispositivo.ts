// Quem está jogando: no controle ou no teclado e mouse. A tela troca os rótulos (X em vez de
// Q, RB em vez de F) conforme o último que foi usado de verdade. Mexer no controle liga; apertar
// uma tecla ou mexer no mouse desliga (as teclas de mentira do controle nos menus não contam).

let controle = false;
let versao = 0;
let ouvindo = false;

/**
 * Os analógicos são os 4 primeiros eixos (layout padrão). Controles genéricos (PS3/PC) mandam o
 * direcional como mais um eixo, que parado vale 3,29 ("nenhuma direção"): fora de [-1, 1] não conta.
 */
const EIXOS_DOS_ANALOGICOS = 4;

/** O analógico saiu da zona morta (só os eixos dos analógicos, com valor de verdade). */
export function mexeuNoAnalogico(eixos: readonly number[], zona: number): boolean {
  return eixos.slice(0, EIXOS_DOS_ANALOGICOS).some((a) => Math.abs(a) > zona && Math.abs(a) <= 1);
}

/** O jogo está no controle agora. */
export function usandoControle(): boolean {
  return controle;
}

/** Muda a cada troca de dispositivo (a tela refaz os rótulos só então). */
export function versaoDoDispositivo(): number {
  return versao;
}

export function definirControle(v: boolean): void {
  if (v === controle) return;
  controle = v;
  versao++;
}

/** Teclado e mouse de verdade tiram do controle (liga uma vez, no começo do jogo). */
export function ouvirTecladoEMouse(): void {
  if (ouvindo || typeof window === 'undefined') return;
  ouvindo = true;
  const voltar = (ev: Event) => {
    if (ev.isTrusted) definirControle(false);
  };
  window.addEventListener('keydown', voltar, true);
  window.addEventListener('mousemove', voltar, true);
  window.addEventListener('mousedown', voltar, true);
}
