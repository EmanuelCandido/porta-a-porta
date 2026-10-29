import { comMatiz, girarMatiz } from './matiz';
import {
  MODELOS_DE_CASA,
  type Figurante,
  type MODELOS_DE_CIDADE,
  type ObjetoRua,
} from '../sim/content/esquemas';
import {
  arvore,
  banco,
  gradeMovel,
  bueiro,
  casaGrande,
  casaTerrea,
  cerca,
  grade,
  lixeira,
  guarita,
  canteiro,
  cancela,
  poco,
  vela,
  pilar,
  poste,
  posteCaido,
  sobrado,
  type ContextoModelo,
  type Modelo,
} from './modelos';
import {
  aboboraDecor,
  aldrava,
  aboboraGigante,
  arbusto,
  arvoreSeca,
  balanco,
  barreira,
  buraco,
  cacamba,
  caixaCorreio,
  caixaDagua,
  casaTorre,
  cavalete,
  cercaViva,
  chafariz,
  chale,
  coneDeObra,
  escola,
  escorregador,
  floreira,
  galpao,
  geminado,
  hidrante,
  igreja,
  lapide,
  loja,
  morro,
  muro,
  orelhao,
  pedra,
  pinheiro,
  placaObra,
  placaRua,
  portico,
  arco,
  patamar,
  espelho,
  pilhaDeTijolos,
  predio,
  semaforo,
  tapume,
  varal,
  mirante,
} from './modelosCidade';
import {
  bancaDeRevistas,
  carrinhoDeRua,
  carro,
  casaComAlpendre,
  casaLaje,
  casaSotao,
  cinema,
  coretoDaPraca,
  edificio,
  geminadas,
  mercado,
  oficina,
  onibus,
  padaria,
  pontoDeOnibus,
  pracinha,
  sobradoAtelie,
  vilinha,
} from './modelosBairro';
import { chaveDaPose, modeloDaMalha, type PoseDaMalha } from './malhas';
import { bauAmaldicoado, carrinhoDePipoca, criancaPerdida } from './surpresas';

/**
 * Um personagem que anda pode vir numa pose do corpo (passo, golpe) e virado numa guinada entre as
 * 4 rotações (graus, só as malhas), cada uma assada à parte.
 */
export type FiguranteNaPose = Figurante & { pose?: PoseDaMalha; guinada?: number };

/** Liga cada objeto descrito em content/ruas.json ao modelo desenhado por código. */
export function modeloDe(o: ObjetoRua | FiguranteNaPose, ctx: ContextoModelo): Modelo {
  const m = modeloBase(o, ctx);
  if (!('matiz' in o) || !o.matiz) return m;
  const v = ctx.visual;
  return comMatiz(m, {
    graus: o.matiz,
    tinta: girarMatiz(v.acentos.jogador, o.matiz),
    fracao: v.coresAlternativas.tingido,
    solido: {
      topo: v.paleta.topo,
      faceEsquerda: v.paleta.faceEsquerda,
      faceDireita: v.paleta.faceDireita,
    },
  });
}

function modeloBase(o: ObjetoRua | FiguranteNaPose, ctx: ContextoModelo): Modelo {
  switch (o.modelo) {
    // Personagens e objetos que vêm dos GLBs do Design Codex (scripts/converter-glb.py).
    case 'bruxinha':
    case 'pestinha_lencol':
    case 'arremessador':
    case 'abobora_canhao':
    case 'sindico_zeloso':
    case 'cobrador':
    case 'guarda_condominio':
    case 'cao_de_guarda':
    case 'gato_preto':
    case 'corvo':
    case 'casa_perseguidora':
    case 'casa_perseguidora_q1':
    case 'casa_perseguidora_q2':
    case 'casa_perseguidora_q3':
    case 'casa_perseguidora_q4':
    case 'saco_surpresa':
    case 'morceguinho':
    case 'espantalho':
    case 'pestinha_vela':
    case 'dono_do_bairro':
    case 'dono_do_bairro_rosto':
    case 'vizinho_curioso':
    case 'sombra_rasteira':
    case 'poste_corrompido':
    case 'doce':
    case 'doce_isca':
    case 'abobora_dourada':
    case 'bau':
    case 'bau_aberto':
    case 'bau_raro':
    case 'fantasma':
    case 'esqueleto':
    case 'vampirinho':
    case 'morador_ofendido':
    case 'viuva_do_mirante':
    case 'sombra_da_viuva':
    case 'moradora_13_bruxinha':
    case 'moradora_13_fantasma':
    case 'moradora_13_esqueleto':
    case 'moradora_13_vampirinho':
      return modeloDaMalha(
        ctx,
        o.modelo,
        'pose' in o ? o.pose : undefined,
        'guinada' in o ? (o.guinada ?? 0) : 0,
      );
    case 'casa_terrea':
      return casaTerrea(o.apagada ? { ...ctx, janelasApagadas: true } : ctx);
    case 'sobrado':
      return sobrado(o.apagada ? { ...ctx, janelasApagadas: true } : ctx);
    case 'casa_grande':
      return casaGrande(o.apagada ? { ...ctx, janelasApagadas: true } : ctx);
    case 'poste':
      return poste(ctx, o.estado);
    case 'lixeira':
      return lixeira(ctx);
    case 'arvore':
      return arvore(ctx);
    case 'banco':
      return banco(ctx);
    case 'cerca':
      return cerca(ctx);
    case 'bueiro':
      return bueiro(ctx);
    case 'pilar':
      return pilar(ctx);
    case 'grade':
      return grade(ctx);
    case 'poste_caido':
      return posteCaido(ctx);
    case 'bau_amaldicoado':
      return bauAmaldicoado(ctx);
    case 'crianca_perdida':
      return criancaPerdida(ctx);
    case 'carrinho_pipoca':
      return carrinhoDePipoca(ctx);
    case 'grade_movel':
      return gradeMovel(ctx);
    case 'pilha_tijolos':
      return pilhaDeTijolos(ctx);
    default:
      return modeloDaCidade(o, ctx);
  }
}

type ObjetoDaCidade = Extract<ObjetoRua, { modelo: (typeof MODELOS_DE_CIDADE)[number] }>;

function modeloDaCidade(o: ObjetoDaCidade, contexto: ContextoModelo): Modelo {
  const ctx = o.apagada ? { ...contexto, janelasApagadas: true } : contexto;
  switch (o.modelo) {
    case 'casa_varanda':
      return casaComAlpendre(ctx);
    case 'casa_sotao':
      return casaSotao(ctx);
    case 'casa_laje':
      return casaLaje(ctx);
    case 'geminadas':
      return geminadas(ctx);
    case 'sobrado_atelie':
      return sobradoAtelie(ctx);
    case 'vilinha':
      return vilinha(ctx);
    case 'padaria':
      return padaria(ctx);
    case 'mercado':
      return mercado(ctx);
    case 'oficina':
      return oficina(ctx);
    case 'cinema':
      return cinema(ctx);
    case 'edificio':
      return edificio(ctx);
    case 'onibus':
      return onibus(ctx);
    case 'carrinho_de_rua':
      return carrinhoDeRua(ctx);
    case 'pracinha':
      return pracinha(ctx);
    case 'geminado':
      return geminado(ctx);
    case 'chale':
      return chale(ctx);
    case 'casa_torre':
      return casaTorre(ctx);
    case 'mirante':
      return mirante(ctx);
    case 'loja':
      return loja(ctx, o.variante);
    case 'predio':
      return predio(ctx, o.variante);
    case 'igreja':
      return igreja(ctx);
    case 'escola':
      return escola(ctx);
    case 'galpao':
      return galpao(ctx);
    case 'caixa_dagua':
      return caixaDagua(ctx);
    case 'chafariz':
      return chafariz(ctx);
    case 'coreto':
      return coretoDaPraca(ctx);
    case 'balanco':
      return balanco(ctx);
    case 'escorregador':
      return escorregador(ctx);
    case 'floreira':
      return floreira(ctx);
    case 'arbusto':
      return arbusto(ctx);
    case 'pinheiro':
      return pinheiro(ctx);
    case 'arvore_seca':
      return arvoreSeca(ctx);
    case 'carro':
      return carro(ctx, o.variante);
    case 'hidrante':
      return hidrante(ctx);
    case 'caixa_correio':
      return caixaCorreio(ctx);
    case 'orelhao':
      return orelhao(ctx);
    case 'ponto_onibus':
      return pontoDeOnibus(ctx);
    case 'banca':
      return bancaDeRevistas(ctx);
    case 'cacamba':
      return cacamba(ctx);
    case 'semaforo':
      return semaforo(ctx);
    case 'placa_rua':
      return placaRua(ctx);
    case 'muro':
      return muro(ctx);
    case 'tapume':
      return tapume(ctx);
    case 'cavalete':
      return cavalete(ctx);
    case 'cone':
      return coneDeObra(ctx);
    case 'arco':
      return arco(ctx);
    case 'patamar':
      return patamar(ctx);
    case 'espelho':
      return espelho(ctx);
    case 'portico':
      return portico(ctx);
    case 'abobora_decor':
      return aboboraDecor(ctx);
    case 'aldrava':
      return aldrava(ctx);
    case 'abobora_gigante':
      return aboboraGigante(ctx);
    case 'guarita':
      return guarita(ctx);
    case 'canteiro':
      return canteiro(ctx);
    case 'cancela':
      return cancela(ctx);
    case 'poco':
      return poco(ctx);
    case 'vela':
      return vela(ctx, o.apagada ?? false);
    case 'lapide':
      return lapide(ctx);
    case 'varal':
      return varal(ctx);
    case 'cerca_viva':
      return cercaViva(ctx);
    case 'morro':
      return morro(ctx, o.variante);
    case 'pedra':
      return pedra(ctx, o.variante);
    case 'barreira':
      return barreira(ctx);
    case 'buraco':
      return buraco(ctx);
    case 'placa_obra':
      return placaObra(ctx);
  }
}

/** Objetos com a mesma chave têm o mesmo desenho e reaproveitam a mesma textura. */
export function chaveDeTextura(o: ObjetoRua | FiguranteNaPose): string {
  const partes: string[] = [o.modelo];
  if (o.modelo === 'poste') partes.push(o.estado);
  if ('variante' in o && o.variante) partes.push(o.variante);
  if ('apagada' in o && o.apagada) partes.push('apagada');
  if ('matiz' in o && o.matiz) partes.push(`matiz${o.matiz}`);
  const pose = 'pose' in o ? chaveDaPose(o.pose) : '';
  if (pose) partes.push(pose);
  if ('guinada' in o && o.guinada) partes.push(`g${o.guinada}`);
  partes.push(String(o.rot));
  return partes.join(':');
}

/** Modelos altos que ficam transparentes quando alguém está atrás deles na tela. */
export const MODELOS_QUE_ESCONDEM: ReadonlySet<string> = new Set([
  ...MODELOS_DE_CASA,
  'arvore',
  'pinheiro',
  'arvore_seca',
  'predio',
  'igreja',
  'escola',
  'galpao',
  'caixa_dagua',
  'coreto',
  'portico',
  'arco',
  'ponto_onibus',
  'banca',
  'morro',
]);
