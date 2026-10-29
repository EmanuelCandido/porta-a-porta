import * as Phaser from 'phaser';
import { modeloDe, type FiguranteNaPose } from '../../render/catalogo';
import { assarModelo } from '../../render/assar';
import { ordenarPartes, poligonosDasPartes, type Poligono } from '../../render/geometria';
import { criarIso } from '../../render/iso';
import { instanciar, type Rotacao } from '../../render/modelos';
import type { Figurante } from '../../sim/content/esquemas';
import { visual } from '../../sim/content';
import { publicarEstado } from '../ganchoTeste';
import { estiloTexto } from '../interface/estilo';
import { telaDe } from '../tela';

/**
 * Personagens e objetos que andam, todos dos GLBs do Design Codex (src/render/malhas).
 * `?so=` escolhe quais aparecem.
 */
const ELENCO: { modelo: Figurante['modelo']; nome: string }[] = [
  { modelo: 'bruxinha', nome: 'BRUXINHA' },
  { modelo: 'fantasma', nome: 'FANTASMA' },
  { modelo: 'esqueleto', nome: 'ESQUELETO' },
  { modelo: 'vampirinho', nome: 'VAMPIRINHO' },
  { modelo: 'pestinha_lencol', nome: 'LENÇOL' },
  { modelo: 'arremessador', nome: 'ARREMESSADOR' },
  { modelo: 'abobora_canhao', nome: 'ABÓBORA-CANHÃO' },
  { modelo: 'cao_de_guarda', nome: 'CÃO DE GUARDA' },
  { modelo: 'gato_preto', nome: 'GATO PRETO' },
  { modelo: 'corvo', nome: 'CORVO' },
  { modelo: 'casa_perseguidora_q1', nome: 'CASA DORMINDO' },
  { modelo: 'casa_perseguidora_q3', nome: 'CASA LEVANTANDO' },
  { modelo: 'casa_perseguidora', nome: 'CASA PERSEGUIDORA' },
  { modelo: 'morceguinho', nome: 'MORCEGUINHO' },
  { modelo: 'saco_surpresa', nome: 'SACO-SURPRESA' },
  { modelo: 'espantalho', nome: 'ESPANTALHO' },
  { modelo: 'pestinha_vela', nome: 'PESTINHA DE VELA' },
  { modelo: 'dono_do_bairro', nome: 'DONO DO BAIRRO' },
  { modelo: 'dono_do_bairro_rosto', nome: 'DONO DESPERTO' },
  { modelo: 'vizinho_curioso', nome: 'VIZINHO CURIOSO' },
  { modelo: 'morador_ofendido', nome: 'MORADOR OFENDIDO' },
  { modelo: 'viuva_do_mirante', nome: 'VIÚVA DO MIRANTE' },
  { modelo: 'sombra_da_viuva', nome: 'SOMBRA DA VIÚVA' },
  { modelo: 'moradora_13_bruxinha', nome: 'MORADORA (BRUXINHA)' },
  { modelo: 'moradora_13_fantasma', nome: 'MORADORA (FANTASMA)' },
  { modelo: 'moradora_13_esqueleto', nome: 'MORADORA (ESQUELETO)' },
  { modelo: 'moradora_13_vampirinho', nome: 'MORADORA (VAMPIRINHO)' },
  { modelo: 'sombra_rasteira', nome: 'SOMBRA RASTEIRA' },
  { modelo: 'cobrador', nome: 'COBRADOR' },
  { modelo: 'guarda_condominio', nome: 'GUARDA' },
  { modelo: 'sindico_zeloso', nome: 'SÍNDICO' },
  { modelo: 'poste_corrompido', nome: 'POSTE CORROMPIDO' },
  { modelo: 'doce', nome: 'DOCE' },
  { modelo: 'doce_isca', nome: 'DOCE-ISCA' },
  { modelo: 'abobora_dourada', nome: 'ABÓBORA DOURADA' },
  { modelo: 'bau', nome: 'BAÚ' },
  { modelo: 'bau_aberto', nome: 'BAÚ ABERTO' },
  { modelo: 'bau_raro', nome: 'BAÚ RARO' },
];

/** Escalas da prancha: o modelo grande, as outras rotações e o tamanho do jogo. */
const ESCALA_GRANDE = 3;
const ESCALA_ROTACOES = 1.3;

/**
 * Prancha do elenco (`?cena=elenco`): os modelos 3D dos personagens desenhados pela mesma geometria
 * do jogo, ampliados, nas quatro rotações e no tamanho real, para conferir por screenshot.
 */
export class CenaElenco extends Phaser.Scene {
  private texturas = 0;

  constructor() {
    super('CenaElenco');
  }

  create(): void {
    const iso = criarIso(visual.tile);
    const g = this.add.graphics();
    const { largura, altura } = telaDe(this);
    // `?so=bruxinha,cobrador` mostra só esses; `?escala=6` amplia a fileira de cima.
    const params = new URLSearchParams(window.location.search);
    const so = params.get('so')?.split(',');
    const elenco = so ? ELENCO.filter((e) => so.includes(e.modelo)) : ELENCO;
    const escala = Number(params.get('escala') ?? ESCALA_GRANDE);
    // `?pose=1,g`: braços e pernas de quem tem esqueleto no passo (−1 a 1) e no golpe (g).
    const [passo, golpe] = (params.get('pose') ?? '0').split(',');
    const pose = { passo: Number(passo) || 0, golpe: golpe === 'g' };
    const coluna = largura / elenco.length;
    // `?fundo=16171C`: o fundo escuro das pranchas do Codex, para comparar lado a lado.
    const fundo = params.get('fundo');
    if (fundo) this.cameras.main.setBackgroundColor(`#${fundo}`);
    const desenhar = (
      modelo: Figurante['modelo'],
      rot: Rotacao,
      pesX: number,
      pesY: number,
      escala: number,
    ) => {
      const o: FiguranteNaPose = { modelo, x: 0, y: 0, rot: 0, pose };
      const inst = instanciar(modeloDe(o, { iso, visual }), 0, 0, rot);
      const polys: Poligono[] = poligonosDasPartes(
        ordenarPartes(inst.partes, iso),
        iso,
        visual.paleta,
        visual.volumes.limiarTopo,
      );
      // Assado como no jogo (z-buffer nas malhas), só que na resolução da escala pedida.
      // Os pés (centro da pegada 1 × 1) ficam em (pesX, pesY).
      if (polys.length === 0) return;
      const a = assarModelo(polys, escala);
      const pes = { x: 0, y: 16 };
      const chave = `elenco:${modelo}:${rot}:${escala}:${this.texturas++}`;
      this.textures.addCanvas(chave, a.base);
      const x = pesX + (a.x - pes.x) * escala;
      const y = pesY + (a.y - pes.y) * escala;
      this.add.image(x, y, chave).setOrigin(0);
      if (a.emissivo) {
        this.textures.addCanvas(`${chave}:brilho`, a.emissivo);
        this.add.image(x, y, `${chave}:brilho`).setOrigin(0);
      }
    };

    // `?pes=600`: altura dos pés na tela (senão, desce com a escala).
    const pesY = Number(params.get('pes') ?? 300 + (escala - ESCALA_GRANDE) * 40);
    elenco.forEach(({ modelo, nome }, i) => {
      const cx = coluna * (i + 0.5);
      if (!params.has('pes')) g.fillStyle(0x000000, 0.18).fillEllipse(cx, 300, 90, 30);
      desenhar(modelo, Number(params.get('rot') ?? 0) as Rotacao, cx, pesY, escala);
      this.add.text(cx, pesY + 30, nome, estiloTexto(13)).setOrigin(0.5, 0);
      // Ampliado, só a fileira de cima (`?rot=90` gira).
      if (params.has('escala')) return;
      ([90, 180, 270] as const).forEach((rot, k) =>
        desenhar(modelo, rot, cx + (k - 1) * 56, 470, ESCALA_ROTACOES),
      );
      desenhar(modelo, 0, cx, 600, 1);
    });
    this.add.text(16, 12, 'ELENCO · MODELOS 3D', estiloTexto(16));
    this.add.text(
      16,
      altura - 28,
      'em cima 3×, no meio as outras rotações, embaixo o tamanho do jogo',
      estiloTexto(12),
    );
    publicarEstado({ cena: 'CenaElenco', pronta: true });
  }
}
