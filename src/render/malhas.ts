import type { Face, Material, TresTons } from './geometria';
import { normalizar, type Vec3 } from './iso';
import { Montagem, type ContextoModelo, type Modelo } from './modelos';
import type { NomeModelo, ParteDoEsqueleto } from '../sim/content/esquemas';
import abobora_canhao from './malhas/abobora_canhao.json';
import abobora_dourada from './malhas/abobora_dourada.json';
import arremessador from './malhas/arremessador.json';
import bau from './malhas/bau.json';
import bau_aberto from './malhas/bau_aberto.json';
import bau_raro from './malhas/bau_raro.json';
import bruxinha from './malhas/bruxinha.json';
import cao_de_guarda from './malhas/cao_de_guarda.json';
import casa_perseguidora from './malhas/casa_perseguidora.json';
import morceguinho from './malhas/morceguinho.json';
import saco_surpresa from './malhas/saco_surpresa.json';
import espantalho from './malhas/espantalho.json';
import pestinha_vela from './malhas/pestinha_vela.json';
import dono_do_bairro from './malhas/dono_do_bairro.json';
import dono_do_bairro_rosto from './malhas/dono_do_bairro_rosto.json';
import casa_perseguidora_q1 from './malhas/casa_perseguidora_q1.json';
import casa_perseguidora_q2 from './malhas/casa_perseguidora_q2.json';
import casa_perseguidora_q3 from './malhas/casa_perseguidora_q3.json';
import casa_perseguidora_q4 from './malhas/casa_perseguidora_q4.json';
import cobrador from './malhas/cobrador.json';
import corvo from './malhas/corvo.json';
import doce from './malhas/doce.json';
import doce_isca from './malhas/doce_isca.json';
import gato_preto from './malhas/gato_preto.json';
import guarda_condominio from './malhas/guarda_condominio.json';
import pestinha_lencol from './malhas/pestinha_lencol.json';
import poste_corrompido from './malhas/poste_corrompido.json';
import sindico_zeloso from './malhas/sindico_zeloso.json';
import sombra_rasteira from './malhas/sombra_rasteira.json';
import vizinho_curioso from './malhas/vizinho_curioso.json';
import fantasma from './malhas/fantasma.json';
import esqueleto from './malhas/esqueleto.json';
import vampirinho from './malhas/vampirinho.json';
import morador_ofendido from './malhas/morador_ofendido.json';
import viuva_do_mirante from './malhas/viuva_do_mirante.json';
import sombra_da_viuva from './malhas/sombra_da_viuva.json';
import moradora_13_bruxinha from './malhas/moradora_13_bruxinha.json';
import moradora_13_fantasma from './malhas/moradora_13_fantasma.json';
import moradora_13_esqueleto from './malhas/moradora_13_esqueleto.json';
import moradora_13_vampirinho from './malhas/moradora_13_vampirinho.json';

/**
 * Malha convertida de um GLB do Design Codex por `scripts/converter-glb.py`: triângulos em metros,
 * já nos eixos do jogo (frente em +x, pés em z = 0, centro da pegada em x = y = 0), a paleta e a cor
 * de cada triângulo, e os que brilham (olhos, lâmpadas).
 */
export interface DadosMalha {
  nome: string;
  origem: string;
  altura: number;
  raio: number;
  paleta: string[];
  triangulos: number[];
  cores: number[];
  brilham?: number[];
  /** Malha montada em peças: nome e caixa de cada uma (metros) e a peça de cada triângulo. */
  pecas?: { n: string; min: number[]; max: number[] }[];
  pecaDe?: number[];
}

const MALHAS: Readonly<Record<string, DadosMalha>> = {
  abobora_canhao,
  abobora_dourada,
  arremessador,
  bau,
  bau_aberto,
  bau_raro,
  bruxinha,
  cao_de_guarda,
  casa_perseguidora,
  morceguinho,
  saco_surpresa,
  espantalho,
  pestinha_vela,
  dono_do_bairro,
  dono_do_bairro_rosto,
  casa_perseguidora_q1,
  casa_perseguidora_q2,
  casa_perseguidora_q3,
  casa_perseguidora_q4,
  cobrador,
  corvo,
  doce,
  doce_isca,
  gato_preto,
  guarda_condominio,
  pestinha_lencol,
  poste_corrompido,
  sindico_zeloso,
  sombra_rasteira,
  vizinho_curioso,
  fantasma,
  esqueleto,
  vampirinho,
  morador_ofendido,
  viuva_do_mirante,
  sombra_da_viuva,
  moradora_13_bruxinha,
  moradora_13_fantasma,
  moradora_13_esqueleto,
  moradora_13_vampirinho,
};

/** Este modelo vem de um GLB do Design Codex? */
export function temMalha(nome: string): boolean {
  return nome in MALHAS;
}

export function dadosDaMalha(nome: string): DadosMalha | undefined {
  return MALHAS[nome];
}

/** Multiplica uma cor #RRGGBB pelo fator dado (1 = igual; acima de 1 clareia, até o branco). */
export function escurecer(cor: string, fator: number): string {
  const n = Number.parseInt(cor.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.min(255, Math.round(v * fator)),
  );
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Pose do corpo de uma malha pronta: `passo` de −1 a 1 (onde o balanço do passo está; 0 = parado) e
 * se está no golpe. Cada pose diferente é um desenho assado à parte.
 */
export interface PoseDaMalha {
  passo: number;
  golpe: boolean;
}

export const POSE_PARADA: PoseDaMalha = { passo: 0, golpe: false };

export function ehPoseParada(p: PoseDaMalha | undefined): boolean {
  return !p || (p.passo === 0 && !p.golpe);
}

/** Pedaço da chave de textura de uma pose ('' na parada, que é o desenho de sempre). */
export function chaveDaPose(p: PoseDaMalha | undefined): string {
  if (!p || ehPoseParada(p)) return '';
  return `pose${Math.round(p.passo * 100)}${p.golpe ? 'g' : ''}`;
}

/**
 * As poses que um corpo animado pode mostrar: cada degrau do passo para os dois lados e o golpe
 * (com as pernas paradas, que o golpe é curto). A parada é o desenho de sempre.
 */
export function posesDoCorpo(degraus: number): PoseDaMalha[] {
  const poses: PoseDaMalha[] = [{ passo: 0, golpe: true }];
  for (let i = 1; i <= degraus; i++)
    poses.push({ passo: i / degraus, golpe: false }, { passo: -i / degraus, golpe: false });
  return poses;
}

/** O passo da pose a partir da fase do andar, arredondado em `degraus` de cada lado. */
export function passoDaFase(fase: number, degraus: number): number {
  return Math.round(Math.cos(fase) * degraus) / degraus;
}

type Regiao = ParteDoEsqueleto['regioes'][number];
type Peca = NonNullable<DadosMalha['pecas']>[number];

/** Folga, em metros, para uma peça no meio do corpo não contar como de um lado. */
const MEIO_DO_CORPO = 0.02;

/** A peça é do lado pedido (E: +y, D: −y; sem lado, qualquer uma)? */
function noLado(peca: Peca, lado: 'E' | 'D' | undefined): boolean {
  if (!lado) return true;
  const y = (peca.min[1]! + peca.max[1]!) / 2;
  return lado === 'E' ? y > MEIO_DO_CORPO : y < -MEIO_DO_CORPO;
}

function pecaNaRegiao(r: Regiao, peca: Peca | undefined): boolean {
  if (!peca || !('pecas' in r) || !r.pecas.includes(peca.n) || !noLado(peca, r.lado)) return false;
  if (!r.x) return true;
  const x = (peca.min[0]! + peca.max[0]!) / 2;
  return r.x === 'frente' ? x > 0 : x <= 0;
}

/** O esqueleto da malha (o dela, ou o da malha de corpo igual em `esqueletoIgual`). */
export function esqueletoDaMalha(
  cfg: { esqueletos: Record<string, ParteDoEsqueleto[]>; esqueletoIgual: Record<string, string> },
  nome: string,
): readonly ParteDoEsqueleto[] {
  return cfg.esqueletos[nome] ?? cfg.esqueletos[cfg.esqueletoIgual[nome] ?? ''] ?? [];
}

/** O pivô em metros: o ponto dado, ou o meio do topo das peças nomeadas (no lado pedido). */
export function pivoDaParte(d: DadosMalha, parte: ParteDoEsqueleto): [number, number, number] {
  const p = parte.pivo;
  if (Array.isArray(p)) return [p[0], p[1], p[2]];
  const { topoDe, lado } = p as { topoDe: string[]; lado?: 'E' | 'D' };
  const pecas = (d.pecas ?? []).filter((q) => topoDe.includes(q.n) && noLado(q, lado));
  if (pecas.length === 0)
    throw new Error(`${d.nome}: nenhuma peça ${topoDe.join(', ')} ${lado ?? ''}`);
  const min = [0, 1].map((i) => Math.min(...pecas.map((q) => q.min[i]!)));
  const max = [0, 1, 2].map((i) => Math.max(...pecas.map((q) => q.max[i]!)));
  return [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, max[2]!];
}

function naRegiao(r: Regiao, p: readonly [number, number, number]): boolean {
  if ('pecas' in r) return false;
  if ('caixa' in r) {
    const { min, max } = r.caixa;
    return p.every((v, i) => v >= min[i]! && v <= max[i]!);
  }
  const { a, b, raio } = r.capsula;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
  const u =
    l2 > 0
      ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / l2))
      : 0;
  return Math.hypot(ap[0]! - u * ab[0]!, ap[1]! - u * ab[1]!, ap[2]! - u * ab[2]!) <= raio;
}

/**
 * Em que parte do esqueleto cada triângulo fica (−1 = corpo, que não gira): a primeira parte cuja
 * região pega o centro do triângulo.
 */
export function partesDosTriangulos(d: DadosMalha, partes: readonly ParteDoEsqueleto[]): Int8Array {
  const t = d.triangulos;
  const n = d.cores.length;
  const saida = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const c: [number, number, number] = [0, 1, 2].map(
      (k) => (t[i * 9 + k]! + t[i * 9 + 3 + k]! + t[i * 9 + 6 + k]!) / 3,
    ) as [number, number, number];
    const peca = d.pecaDe ? d.pecas?.[d.pecaDe[i]!] : undefined;
    saida[i] = partes.findIndex((p) =>
      p.regioes.some((r) => pecaNaRegiao(r, peca) || naRegiao(r, c)),
    );
  }
  return saida;
}

/**
 * Gira o ponto (metros) em volta do pivô da parte, no plano da frente (x) com a altura (z): graus
 * positivos levam o que está embaixo do pivô para a frente, como um passo ou um braço que sobe.
 */
export function girarNaParte(
  x: number,
  z: number,
  pivo: readonly [number, number, number],
  graus: number,
): [number, number] {
  const a = (graus * Math.PI) / 180;
  const dx = x - pivo[0];
  const dz = z - pivo[2];
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [pivo[0] + dx * c - dz * s, pivo[2] + dx * s + dz * c];
}

/** Ângulo de cada parte na pose dada. */
export function angulosDaPose(partes: readonly ParteDoEsqueleto[], pose: PoseDaMalha): number[] {
  return partes.map((p) => p.passoGraus * pose.passo + (pose.golpe ? p.golpeGraus : 0));
}

const partesEmCache = new Map<string, Int8Array>();
const pivosEmCache = new Map<string, [number, number, number][]>();

/**
 * Monta o modelo de uma malha: escala pela altura do jogo (`visual.malhas.alturaPx`), centro na
 * pegada de content/modelos.json e, em cada face, os três tons da cor dela (topo, esquerda e
 * direita) com as facetas da luz, como o resto do bairro. Os triângulos que brilham são emissivos.
 * `guinada` (graus) gira a malha em volta do centro antes da rotação do objeto: as direções entre
 * as 4 rotações, para o corpo virar aos poucos.
 */
export function modeloDaMalha(
  ctx: ContextoModelo,
  nome: NomeModelo,
  pose: PoseDaMalha = POSE_PARADA,
  guinada = 0,
): Modelo {
  const d = MALHAS[nome];
  if (!d) throw new Error(`malha ${nome} não existe em src/render/malhas`);
  const cfg = ctx.visual.malhas;
  // Corpo animado: cada parte do esqueleto gira em volta do pivô dela (a pose parada não gira nada).
  const esqueleto = esqueletoDaMalha(cfg, nome);
  const angulos = angulosDaPose(esqueleto, pose);
  let parteDe: Int8Array | null = null;
  let pivos: [number, number, number][] = [];
  if (esqueleto.length > 0 && angulos.some((a) => a !== 0)) {
    parteDe = partesEmCache.get(nome) ?? partesDosTriangulos(d, esqueleto);
    partesEmCache.set(nome, parteDe);
    pivos = pivosEmCache.get(nome) ?? esqueleto.map((p) => pivoDaParte(d, p));
    pivosEmCache.set(nome, pivos);
  }
  const alturaPx = cfg.alturaPx[nome] ?? 32;
  const { zPorTile } = ctx.iso;
  // Tiles por metro, igual em x, y e z (z em px = tiles × zPorTile).
  const k = alturaPx / (d.altura * zPorTile);
  const m = new Montagem(ctx);
  const base = m.modelo(nome);
  const cx = base.largura / 2;
  const cy = base.profundidade / 2;
  const [lx, ly, lz] = ctx.visual.facetas.luz;
  const facetas = { luz: { x: lx, y: ly, z: lz }, faixas: ctx.visual.facetas.faixas };
  const brilham = new Set(d.brilham ?? []);
  const materiais = d.paleta.map((cor): { tom: Material; brilho: Material } => {
    // A cor da face é o tom médio: o topo clareia e a face direita escurece.
    const tons: TresTons = {
      topo: escurecer(cor, cfg.tomTopo),
      faceEsquerda: escurecer(cor, cfg.tomEsquerda),
      faceDireita: escurecer(cor, cfg.tomDireita),
    };
    return { tom: { tipo: 'tom', tons, facetas }, brilho: { tipo: 'emissivo', cor } };
  });
  const faces: Face[] = [];
  const t = d.triangulos;
  const cg = Math.cos((guinada * Math.PI) / 180);
  const sg = Math.sin((guinada * Math.PI) / 180);
  for (let i = 0; i < d.cores.length; i++) {
    const parte = parteDe ? parteDe[i]! : -1;
    const pts: Vec3[] = [0, 1, 2].map((v) => {
      let x = t[i * 9 + v * 3]!;
      let y = t[i * 9 + v * 3 + 1]!;
      let z = t[i * 9 + v * 3 + 2]!;
      if (parte >= 0) {
        const pv = pivos[parte]!;
        if (esqueleto[parte]!.plano === 'lado')
          // De lado: a mesma conta no plano y–z (graus positivos levantam o lado +y).
          [y, z] = girarNaParte(y, z, [pv[1], pv[0], pv[2]], angulos[parte]!);
        else [x, z] = girarNaParte(x, z, pv, angulos[parte]!);
      }
      const gx = guinada ? x * cg - y * sg : x;
      const gy = guinada ? x * sg + y * cg : y;
      return { x: cx + gx * k, y: cy + gy * k, z: z * k * zPorTile };
    });
    // Normal métrica pela ordem dos vértices (o GLB guarda as faces no sentido anti-horário).
    const [a, b, c] = pts.map((p) => ({ x: p.x, y: p.y, z: p.z / zPorTile })) as [Vec3, Vec3, Vec3];
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    if (Math.hypot(n.x, n.y, n.z) < 1e-12) continue;
    const mat = materiais[d.cores[i]!]!;
    faces.push({ pts, normal: normalizar(n), material: brilham.has(i) ? mat.brilho : mat.tom });
  }
  m.add({ faces, decalques: [], malha: true });
  return m.modelo(nome);
}
