import {
  album,
  campeoes,
  entreRuns,
  evolucoes,
  habilidades,
  inimigos,
  luaCheia,
  noite,
  precos,
  tratos,
} from '../sim/content';
import { idsDoDiario, paginasDoDiario } from '../sim/diario';
import {
  dataDoPlacar,
  escreverProgresso,
  lerProgresso,
  semanaDe,
  type ConteudoDoProgresso,
  type Progresso,
} from '../sim/progresso';

const conteudoDoDiario = {
  tratos,
  precos,
  inimigos,
  noite,
  evolucoes,
  campeoes,
  habilidades,
  entreRuns,
};

/** As páginas do Diário do Bairro, montadas uma vez do conteúdo. */
export const PAGINAS = paginasDoDiario(conteudoDoDiario);

/** O conteúdo que o progresso usa. */
export const CONTEUDO_DO_PROGRESSO: ConteudoDoProgresso = {
  album,
  luaCheia,
  entreRuns,
  campeoes,
  tratos,
  diario: idsDoDiario(conteudoDoDiario),
};

/**
 * O save no localStorage (GDD: "localStorage com versão"). Sem acesso ao armazenamento (janela
 * privada, site bloqueado), o progresso vive só nesta sessão.
 */
let atual: Progresso | null = null;

export function progresso(): Progresso {
  if (atual) return atual;
  let texto: string | null;
  try {
    texto = window.localStorage.getItem(album.save.chave);
  } catch {
    texto = null;
  }
  atual = lerProgresso(texto, album);
  return atual;
}

export function salvar(): void {
  if (!atual) return;
  try {
    window.localStorage.setItem(album.save.chave, escreverProgresso(atual));
  } catch {
    // Sem armazenamento: fica só na memória.
  }
}

/** A semana de hoje (relógio local), para o desafio da semana. */
export function semanaDeHoje(): number {
  const d = new Date();
  return semanaDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** A data de hoje (relógio local) no formato do placar da semente da noite. */
export function hoje(): string {
  const d = new Date();
  return dataDoPlacar(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
