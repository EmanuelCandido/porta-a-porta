import { visual } from '../../sim/content';

export const NIVEIS = ['leve', 'media', 'alta'] as const;
export type NivelQualidade = (typeof NIVEIS)[number];
let escolhida: NivelQualidade | undefined;

export function nivelValido(valor: unknown): valor is NivelQualidade {
  return NIVEIS.some((n) => n === valor);
}

export function nivelDeQualidade(): NivelQualidade {
  if (escolhida) return escolhida;
  try {
    const salva = window.localStorage.getItem(visual.desempenho.chaveQualidade);
    if (nivelValido(salva)) return (escolhida = salva);
  } catch {
    // A escolha continua disponível nesta sessão quando o armazenamento está bloqueado.
  }
  return (escolhida = visual.desempenho.qualidadeInicial);
}

export function escolherQualidade(nivel: NivelQualidade): void {
  escolhida = nivel;
  try {
    window.localStorage.setItem(visual.desempenho.chaveQualidade, nivel);
  } catch {
    // Sem armazenamento persistente, a escolha vale até fechar o jogo.
  }
}

export function perfilDeQualidade() {
  return visual.desempenho.qualidades[nivelDeQualidade()];
}
