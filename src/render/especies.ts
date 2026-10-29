import type { Figurante } from '../sim/content/esquemas';

export type ModeloMovel = Figurante['modelo'];

/** Qual modelo desenha cada espécie da simulação (campeões, inimigos, chefes, objetos que andam). */
const MODELOS: Readonly<Record<string, ModeloMovel>> = {
  bruxinha: 'bruxinha',
  fantasma: 'fantasma',
  esqueleto: 'esqueleto',
  vampirinho: 'vampirinho',
  boneco: 'pestinha_lencol',
  pestinha_lencol: 'pestinha_lencol',
  pilha_tijolos: 'pilha_tijolos',
  arremessador: 'arremessador',
  abobora_canhao: 'abobora_canhao',
  poste_corrompido: 'poste_corrompido',
  doce: 'doce',
  doce_isca: 'doce_isca',
  bau: 'bau',
  bau_aberto: 'bau_aberto',
  bau_raro: 'bau_raro',
  bau_amaldicoado: 'bau_amaldicoado',
  crianca_perdida: 'crianca_perdida',
  carrinho_pipoca: 'carrinho_pipoca',
  cao_de_guarda: 'cao_de_guarda',
  corvo: 'corvo',
  gato_preto: 'gato_preto',
  casa_perseguidora: 'casa_perseguidora',
  casa_perseguidora_q1: 'casa_perseguidora_q1',
  casa_perseguidora_q2: 'casa_perseguidora_q2',
  casa_perseguidora_q3: 'casa_perseguidora_q3',
  casa_perseguidora_q4: 'casa_perseguidora_q4',
  // A casa que errou o minijogo da Casa Desconfiada: a mesma casa térrea, acordada.
  casa_desperta: 'casa_perseguidora',
  vizinho_curioso: 'vizinho_curioso',
  cobrador: 'cobrador',
  sombra_rasteira: 'sombra_rasteira',
  guarda_condominio: 'guarda_condominio',
  sindico_zeloso: 'sindico_zeloso',
  // O morador que você recusou três vezes: um vizinho de verdade, agora elite.
  morador_ofendido: 'morador_ofendido',
  viuva_do_mirante: 'viuva_do_mirante',
  sombra_da_viuva: 'sombra_da_viuva',
  // A Moradora do 13 é o reflexo da fantasia do jogador (marca `visual`, VistaEntidades).
  moradora_13_bruxinha: 'moradora_13_bruxinha',
  moradora_13_fantasma: 'moradora_13_fantasma',
  moradora_13_esqueleto: 'moradora_13_esqueleto',
  moradora_13_vampirinho: 'moradora_13_vampirinho',
  dono_do_bairro: 'dono_do_bairro',
  dono_do_bairro_rosto: 'dono_do_bairro_rosto',
  grade_sindico: 'grade_movel',
  abobora_dourada: 'abobora_dourada',
  // O Saco-Surpresa disfarçado é uma lixeira comum (marca `visual`).
  lixeira: 'lixeira',
  saco_surpresa: 'saco_surpresa',
  morceguinho: 'morceguinho',
  espantalho: 'espantalho',
  pestinha_vela: 'pestinha_vela',
};

/** O que fica no chão quando a espécie cai (em vez de sumir). */
const MODELOS_CAIDOS: Readonly<Record<string, ModeloMovel>> = {
  poste_corrompido: 'poste_caido',
};

/** Espécies que flutuam (lençóis, fantasmas, doces). */
const FLUTUAM = new Set<string>([
  'pestinha_lencol',
  'boneco',
  'doce',
  'abobora_dourada',
  'fantasma',
  'morceguinho',
]);

/** Espécies que não viram para onde andam (postes, doces). */
const FIXAS = new Set<string>([
  'poste_corrompido',
  'doce',
  'doce_isca',
  'bau',
  'bau_aberto',
  'bau_raro',
  'bau_amaldicoado',
  'carrinho_pipoca',
  'grade_sindico',
  'abobora_dourada',
  'dono_do_bairro',
  'pilha_tijolos',
  // Fincado no chão: não vira, só troca de lugar.
  'espantalho',
]);

export function modeloDaEspecie(especie: string): ModeloMovel {
  return MODELOS[especie] ?? 'pestinha_lencol';
}

/**
 * O quadro da transformação no tick dado (a casa levantando, ou deitando quando `reversa`): os
 * quadros de `quadros` em partes iguais de `de` a `ate`; fora dela, null (o desenho de sempre).
 */
export function quadroDaTransformacao(
  quadros: readonly string[] | undefined,
  de: number,
  ate: number,
  tick: number,
  reversa = false,
): string | null {
  if (!quadros || quadros.length === 0 || tick >= ate || ate <= de) return null;
  const k = Math.min(quadros.length - 1, Math.floor(((tick - de) / (ate - de)) * quadros.length));
  return quadros[reversa ? quadros.length - 1 - k : k]!;
}

export function modeloCaido(especie: string): ModeloMovel | null {
  return MODELOS_CAIDOS[especie] ?? null;
}

export function flutua(especie: string): boolean {
  return FLUTUAM.has(especie);
}

/** Espécies que tremem paradas (o baú amaldiçoado). */
const TREMEM = new Set<string>(['bau_amaldicoado']);

export function treme(especie: string): boolean {
  return TREMEM.has(especie);
}

export function fixa(especie: string): boolean {
  return FIXAS.has(especie);
}
