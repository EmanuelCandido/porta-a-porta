import type * as Phaser from 'phaser';
import { visual } from '../../sim/content';

// Artes de interface do Design Codex (ícones de item, poderes, passivas, retratos e a coleção 04:
// evoluções, tratos, preços, marcas, condições da noite e símbolos), preparadas por
// scripts/recortar-artes.mjs e servidas de public/. É a exceção da regra 4: o resto da interface
// continua desenhado por código, e quem não tem arte cai no desenho de icones.ts.

const { artes } = visual.interface;

export type TipoArte =
  | 'item'
  | 'habilidade'
  | 'passiva'
  | 'retrato'
  | 'evolucao'
  | 'trato'
  | 'preco'
  | 'marca'
  | 'condicao'
  | 'hud';

function chave(tipo: TipoArte, id: string): string {
  return `arte:${tipo}:${id}`;
}

/** Tipo, lista de ids e pasta de cada grupo (o arquivo é `<pasta>/<id>.png`). */
const GRUPOS: { tipo: TipoArte; ids: readonly string[]; pasta: string }[] = [
  { tipo: 'item', ids: artes.itens, pasta: 'itens' },
  { tipo: 'habilidade', ids: artes.habilidades, pasta: 'poderes' },
  { tipo: 'retrato', ids: artes.retratos, pasta: 'retratos' },
  { tipo: 'evolucao', ids: artes.evolucoes, pasta: 'evolucoes' },
  { tipo: 'trato', ids: artes.tratos, pasta: 'tratos' },
  { tipo: 'preco', ids: artes.precos, pasta: 'precos' },
  { tipo: 'marca', ids: artes.marcas, pasta: 'marcas' },
  { tipo: 'condicao', ids: artes.condicoes, pasta: 'condicoes' },
  { tipo: 'hud', ids: artes.hud, pasta: 'hud' },
];

/** Tudo que existe em arte, com a chave da textura e o arquivo. */
function lista(): { chave: string; arquivo: string }[] {
  return [
    ...GRUPOS.flatMap(({ tipo, ids, pasta }) =>
      ids.map((id) => ({ chave: chave(tipo, id), arquivo: `${pasta}/${id}.png` })),
    ),
    ...Object.entries(artes.passivas).map(([campeao, id]) => ({
      chave: chave('passiva', campeao),
      arquivo: `poderes/${id}.png`,
    })),
  ];
}

/** Põe na fila do carregador as artes que ainda não viraram textura (chamar no `preload`). */
export function carregarArtes(cena: Phaser.Scene): void {
  for (const { chave: k, arquivo } of lista()) {
    if (!cena.textures.exists(k)) cena.load.image(k, `${artes.pasta}/${arquivo}`);
  }
}

/** Chave da textura da arte, ou null se ela não existe (aí vale o desenho por código). */
export function arte(cena: Phaser.Scene, tipo: TipoArte, id: string): string | null {
  const k = chave(tipo, id);
  return cena.textures.exists(k) ? k : null;
}

/**
 * Cria a imagem da arte centrada em (cx, cy), cabendo num quadrado de lado `lado`. Devolve null se
 * não há arte para o id.
 */
export function imagemDaArte(
  cena: Phaser.Scene,
  tipo: TipoArte,
  id: string,
  cx: number,
  cy: number,
  lado: number,
): Phaser.GameObjects.Image | null {
  const k = arte(cena, tipo, id);
  if (!k) return null;
  return cena.add.image(cx, cy, k).setDisplaySize(lado, lado);
}
