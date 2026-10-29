import * as Phaser from 'phaser';
import { entrarCena, fundoNoturno } from './animacao';
import { girarMatiz } from '../../render/matiz';
import { album, campeoes, itens, tratos, visual } from '../../sim/content';
import {
  comprar,
  entradasDoAlbum,
  fracaoDoAlbum,
  type EntradaDoAlbum,
  type TipoDeCompra,
} from '../../sim/progresso';
import { publicarEstado, type EstadoTeste } from '../ganchoTeste';
import { progresso, salvar } from '../save';
import { carregarArtes, imagemDaArte } from './artes';
import { COR, estiloTexto, placa } from './estilo';
import { registrarFontePixel, TextoPixel } from './fontePixel';
import { iconeCadeado, iconeDoce, retrato } from './icones';
import { somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';
import { realcarAoPassar } from './botoes';

const ABAS = ['Fantasias', 'Tratos', 'Itens', 'Bônus iniciais', 'Cores'] as const;
type Aba = (typeof ABAS)[number];

const LARGURA_LINHA = 560;
const ALTURA_LINHA = 64;
const ESPACO = 12;
const Y_LISTA = 160;

/**
 * Álbum de Fantasias (GDD, "Álbum de Fantasias"): os Doces Guardados compram fantasias, páginas de
 * tratos, itens para a loja do banco, pequenos bônus iniciais e cores alternativas. Abre do título
 * (A) e volta com Esc; cada compra grava o save na hora.
 */
export class CenaAlbum extends Phaser.Scene {
  private aba: Aba = 'Fantasias';
  private escolhida = 0;
  private lista!: Phaser.GameObjects.Container;
  private topo!: Phaser.GameObjects.Container;
  private aviso!: Phaser.GameObjects.Text;
  private estado!: EstadoTeste;

  constructor() {
    super('CenaAlbum');
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    this.aba = 'Fantasias';
    this.escolhida = 0;
    const { largura, altura } = telaDe(this);
    fundoNoturno(this);
    entrarCena(this);
    this.texto(56, 30, 'Álbum de Fantasias', estiloTexto(30, COR.texto, true));
    this.texto(
      56,
      74,
      'Ao fim de cada run, 10% dos doces e 50 por chefe viram Doces Guardados.',
      estiloTexto(14, COR.textoApagado),
    );
    this.topo = this.add.container(0, 0);
    this.lista = this.add.container(0, 0);
    this.aviso = this.texto(
      largura / 2,
      altura - 96,
      '',
      estiloTexto(16, COR.texto, true),
    ).setOrigin(0.5, 0);
    this.texto(
      largura / 2,
      altura - 50,
      '1 a 5 · páginas   ·   ← → ↑ ↓ · escolher   ·   Enter ou clique · comprar   ·   Esc · voltar',
      estiloTexto(13, COR.textoApagado),
    ).setOrigin(0.5, 0);

    const k = this.input.keyboard!;
    ABAS.forEach((a, i) =>
      k.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][i]}`, () => this.mudarAba(a)),
    );
    let saiu = false;
    k.on('keydown-ESC', () => {
      if (saiu) return;
      saiu = true;
      this.scene.start('CenaTitulo');
    });
    k.on('keydown-LEFT', () => this.andar(-1));
    k.on('keydown-RIGHT', () => this.andar(1));
    k.on('keydown-UP', () => this.andar(-2));
    k.on('keydown-DOWN', () => this.andar(2));
    k.on('keydown-ENTER', () => {
      const e = this.entradas()[this.escolhida];
      if (e) this.comprar(e);
    });

    this.estado = {
      cena: 'CenaAlbum',
      pronta: true,
      aba: this.aba,
      docesGuardados: progresso().docesGuardados,
      entradas: [],
      // Testes: compra direto, como o clique.
      comprar: (tipo: TipoDeCompra, id: string) => {
        const e = entradasDoAlbum(progresso(), album, { campeoes, itens, tratos }).find(
          (x) => x.compra.tipo === tipo && x.compra.id === id,
        );
        return e ? this.comprar(e) : false;
      },
    };
    publicarEstado(this.estado);
    this.redesenhar();
  }

  private texto(
    x: number,
    y: number,
    t: string,
    estilo: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, t, estilo).setResolution(2);
  }

  private entradas(): EntradaDoAlbum[] {
    return entradasDoAlbum(progresso(), album, { campeoes, itens, tratos }).filter(
      (e) => e.grupo === this.aba,
    );
  }

  private mudarAba(a: Aba): void {
    this.aba = a;
    this.escolhida = 0;
    this.aviso.setText('');
    this.redesenhar();
  }

  private andar(passo: number): void {
    const n = this.entradas().length;
    if (n === 0) return;
    this.escolhida = Math.max(0, Math.min(n - 1, this.escolhida + passo));
    this.redesenhar();
  }

  private comprar(e: EntradaDoAlbum): boolean {
    const prog = progresso();
    if (e.preco === null) {
      this.aviso.setText(`${e.nome}: já está no Álbum`);
      return false;
    }
    if (!comprar(prog, album, e.compra)) {
      this.aviso.setText(`Faltam ${e.preco - prog.docesGuardados} Doces Guardados para ${e.nome}`);
      return false;
    }
    salvar();
    this.aviso.setText(`${e.nome} entrou no Álbum!`);
    this.redesenhar();
    return true;
  }

  /** Abas, Doces Guardados e as linhas da aba atual (com o estado para os testes). */
  private redesenhar(): void {
    const { largura } = telaDe(this);
    const prog = progresso();
    this.topo.removeAll(true);
    this.lista.removeAll(true);
    const g = this.add.graphics();
    this.topo.add(g);

    // Doces Guardados e quanto do Álbum já tem.
    placa(g, largura - 300, 24, 244, 72, { alfa: 0.95 });
    iconeDoce(g, largura - 272, 60, 26);
    this.topo.add(
      this.texto(largura - 250, 34, 'Doces Guardados', estiloTexto(13, COR.textoApagado)),
    );
    this.topo.add(
      new TextoPixel(this, largura - 72, 56, 3, COR.doce)
        .texto(String(prog.docesGuardados))
        .objeto.setOrigin(1, 0),
    );
    const fracao = fracaoDoAlbum(prog, album, { campeoes, itens, tratos });
    this.topo.add(
      this.texto(
        largura - 250,
        74,
        `${Math.round(fracao * 100)}% do Álbum`,
        estiloTexto(12, COR.texto),
      ),
    );

    // Abas.
    const wAba = 220;
    ABAS.forEach((a, i) => {
      const x = 56 + i * (wAba + 10);
      const ativa = a === this.aba;
      placa(g, x, 108, wAba, 38, {
        cor: ativa ? COR.jogador : COR.placaClara,
        alfa: 1,
        chanfro: 4,
      });
      this.topo.add(
        this.texto(
          x + wAba / 2,
          117,
          `${i + 1} · ${a}`,
          ativa
            ? { ...estiloTexto(15, visual.paleta.faceDireita, true), strokeThickness: 0 }
            : estiloTexto(15),
        ).setOrigin(0.5, 0),
      );
      const z = this.add
        .zone(x, 108, wAba, 38)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.mudarAba(a));
      this.topo.add(z);
      realcarAoPassar(this, z, this.topo);
    });

    // Linhas em duas colunas.
    const lista = this.entradas();
    const gl = this.add.graphics();
    this.lista.add(gl);
    lista.forEach((e, i) => {
      const x = 56 + (i % 2) * (LARGURA_LINHA + 48);
      const y = Y_LISTA + Math.floor(i / 2) * (ALTURA_LINHA + ESPACO);
      const tem = e.preco === null;
      const pode = !tem && prog.docesGuardados >= (e.preco ?? 0);
      placa(gl, x, y, LARGURA_LINHA, ALTURA_LINHA, { alfa: 0.96 });
      if (i === this.escolhida)
        gl.lineStyle(2, COR.jogador, 1).strokeRect(
          x - 3,
          y - 3,
          LARGURA_LINHA + 6,
          ALTURA_LINHA + 6,
        );
      gl.fillStyle(COR.placaClara, 1).fillCircle(x + 34, y + ALTURA_LINHA / 2, 24);
      this.icone(gl, e, x + 34, y + ALTURA_LINHA / 2);
      this.lista.add(
        this.texto(x + 70, y + 10, e.nome, estiloTexto(16, tem ? COR.texto : COR.texto, true)),
      );
      this.lista.add(
        this.texto(x + 70, y + 34, e.descricao, {
          ...estiloTexto(12, COR.textoApagado),
          wordWrap: { width: LARGURA_LINHA - 230 },
          maxLines: 2,
        }),
      );
      // Preço (ou "no Álbum") à direita.
      const bx = x + LARGURA_LINHA - 140;
      const by = y + 14;
      if (tem) {
        this.lista.add(
          this.texto(bx + 124, by + 8, e.nivel ? 'No máximo' : 'No Álbum', {
            ...estiloTexto(14, visual.acentos.fantasma, true),
          }).setOrigin(1, 0),
        );
      } else {
        placa(gl, bx, by, 124, 36, {
          cor: pode ? COR.jogador : COR.placaClara,
          alfa: 1,
          chanfro: 4,
        });
        iconeDoce(gl, bx + 20, by + 18, 18);
        this.lista.add(
          new TextoPixel(this, bx + 112, by + 10, 2, pode ? COR.placa : COR.luz)
            .texto(String(e.preco))
            .objeto.setOrigin(1, 0),
        );
      }
      if (e.nivel)
        this.lista.add(
          this.texto(
            bx - 10,
            by + 10,
            `${e.nivel.atual}/${e.nivel.maximo}`,
            estiloTexto(13, COR.textoApagado),
          ).setOrigin(1, 0),
        );
      const z = this.add
        .zone(x, y, LARGURA_LINHA, ALTURA_LINHA)
        .setOrigin(0)
        .setInteractive({ useHandCursor: !tem });
      z.on('pointerdown', () => {
        this.escolhida = i;
        this.comprar(e);
      });
      this.lista.add(z);
      realcarAoPassar(this, z, this.lista);
    });

    this.estado.aba = this.aba;
    this.estado.docesGuardados = prog.docesGuardados;
    this.estado.entradas = lista.map((e) => ({
      tipo: e.compra.tipo,
      id: e.compra.id,
      preco: e.preco,
    }));
  }

  /** Arte do Codex da linha (retrato, marca, item, ícone do HUD) ou desenho por código. */
  private icone(g: Phaser.GameObjects.Graphics, e: EntradaDoAlbum, cx: number, cy: number): void {
    const { tipo, id } = e.compra;
    const lado = 42;
    let arte: Phaser.GameObjects.Image | null = null;
    switch (tipo) {
      case 'campeao':
        arte = imagemDaArte(this, 'retrato', id, cx, cy, lado);
        if (!arte) retrato(g, id, cx, cy, 36);
        if (e.preco !== null) iconeCadeado(g, cx + 16, cy + 14, 14, COR.luz);
        break;
      case 'pagina':
        arte = imagemDaArte(this, 'marca', id.replace('pagina_', ''), cx, cy, lado);
        break;
      case 'item':
        arte = imagemDaArte(this, 'item', id, cx, cy, lado);
        break;
      case 'bonus':
        if (id === 'doces') iconeDoce(g, cx, cy, 26);
        else arte = imagemDaArte(this, 'hud', id === 'reroll' ? 'reroll' : 'coragem', cx, cy, lado);
        break;
      case 'cor': {
        const cor = Object.values(album.cores)
          .flat()
          .find((x) => x.id === id);
        const hex = girarMatiz(visual.acentos.jogador, cor?.matiz ?? 0);
        g.fillStyle(Number.parseInt(hex.slice(1), 16), 1).fillCircle(cx, cy, 16);
        g.lineStyle(2, COR.luz, 0.8).strokeCircle(cx, cy, 16);
        break;
      }
    }
    if (arte) this.lista.add(arte);
  }
}
