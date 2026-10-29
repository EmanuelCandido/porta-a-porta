import * as Phaser from 'phaser';
import { entrarCena, fundoNoturno } from './animacao';
import { campeoes, entreRuns, visual } from '../../sim/content';
import { PAGINAS_DO_DIARIO, type PaginaDoDiario } from '../../sim/content/esquemas';
import type { EntradaDoDiario } from '../../sim/diario';
import { fracaoDoDiario, maestria, vistosNoDiario } from '../../sim/progresso';
import { publicarEstado, type EstadoTeste } from '../ganchoTeste';
import { CONTEUDO_DO_PROGRESSO, PAGINAS, progresso } from '../save';
import { carregarArtes, imagemDaArte } from './artes';
import { COR, estiloTexto, placa } from './estilo';
import { registrarFontePixel, TextoPixel } from './fontePixel';
import { retrato } from './icones';
import { somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';
import { realcarAoPassar } from './botoes';

type Aba = 'fantasias' | PaginaDoDiario;
const ABAS: Aba[] = ['fantasias', ...PAGINAS_DO_DIARIO];
const TECLAS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];

const COLUNAS = 6;
const LARGURA_CARTA = 196;
const ALTURA_CARTA = 70;
const ESPACO = 8;
const Y_GRADE = 186;

/**
 * Diário do Bairro (GAMEPLAY.md, "Diário do Bairro"): tudo o que as runs já mostraram (tratos,
 * preços, Conjuntos, inimigos, condições, encontros raros e evoluções), com a conclusão de cada
 * página; o que falta aparece como silhueta com uma dica. A primeira página é a maestria de cada
 * fantasia, com o título e a moldura dourada da maestria 5. Abre do título (D).
 */
export class CenaDiario extends Phaser.Scene {
  private aba: Aba = 'fantasias';
  private conteudo!: Phaser.GameObjects.Container;
  private estado!: EstadoTeste;

  constructor() {
    super('CenaDiario');
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    this.aba = 'fantasias';
    const { largura, altura } = telaDe(this);
    fundoNoturno(this);
    entrarCena(this);
    this.texto(40, 24, 'Diário do Bairro', estiloTexto(30, COR.texto, true));
    const total = fracaoDoDiario(progresso(), CONTEUDO_DO_PROGRESSO.diario);
    this.texto(
      40,
      66,
      `${Math.round(total * 100)}% do bairro registrado. Fechar uma página dá Doces Guardados.`,
      estiloTexto(14, COR.textoApagado),
    );
    this.conteudo = this.add.container(0, 0);
    this.texto(
      largura / 2,
      altura - 34,
      '1 a 8 · páginas   ·   ← → · folhear   ·   Esc · voltar',
      estiloTexto(13, COR.textoApagado),
    ).setOrigin(0.5, 0);

    const k = this.input.keyboard!;
    TECLAS.forEach((t, i) => k.on(`keydown-${t}`, () => this.mudar(ABAS[i]!)));
    k.on('keydown-LEFT', () =>
      this.mudar(ABAS[(ABAS.indexOf(this.aba) + ABAS.length - 1) % ABAS.length]!),
    );
    k.on('keydown-RIGHT', () => this.mudar(ABAS[(ABAS.indexOf(this.aba) + 1) % ABAS.length]!));
    let saiu = false;
    k.on('keydown-ESC', () => {
      if (saiu) return;
      saiu = true;
      this.scene.start('CenaTitulo');
    });

    this.estado = { cena: 'CenaDiario', pronta: true, aba: this.aba, vistos: 0, total: 0 };
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

  private mudar(a: Aba): void {
    this.aba = a;
    this.redesenhar();
  }

  private redesenhar(): void {
    this.conteudo.removeAll(true);
    const g = this.add.graphics();
    this.conteudo.add(g);
    const prog = progresso();
    // Abas.
    const w = 140;
    ABAS.forEach((a, i) => {
      const x = 40 + i * (w + 8);
      const ativa = a === this.aba;
      const nome = a === 'fantasias' ? 'Fantasias' : entreRuns.diario.paginas[a].nome;
      const fechada = a !== 'fantasias' && prog.paginasFechadas.includes(a);
      placa(g, x, 100, w, 36, {
        cor: ativa ? COR.jogador : COR.placaClara,
        alfa: 1,
        chanfro: 4,
      });
      this.conteudo.add(
        this.texto(
          x + w / 2,
          109,
          `${i + 1} · ${nome.split(' ')[0]}${fechada ? ' ✓' : ''}`,
          ativa
            ? { ...estiloTexto(14, visual.paleta.faceDireita, true), strokeThickness: 0 }
            : estiloTexto(14, fechada ? visual.acentos.fantasma : COR.texto),
        ).setOrigin(0.5, 0),
      );
      const z = this.add.zone(x, 100, w, 36).setOrigin(0).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.mudar(a));
      this.conteudo.add(z);
      realcarAoPassar(this, z, this.conteudo);
    });
    if (this.aba === 'fantasias') this.fantasias(g);
    else this.pagina(g, this.aba);
    this.estado.aba = this.aba;
  }

  /** As entradas da página: as vistas com arte e nome, as outras em silhueta com a dica. */
  private pagina(g: Phaser.GameObjects.Graphics, pagina: PaginaDoDiario): void {
    const prog = progresso();
    const entradas = PAGINAS[pagina];
    const vistos = new Set(vistosNoDiario(prog, pagina));
    const n = entradas.filter((e) => vistos.has(e.id)).length;
    const cfg = entreRuns.diario.paginas[pagina];
    const fechada = prog.paginasFechadas.includes(pagina);
    this.conteudo.add(
      this.texto(
        40,
        150,
        `${cfg.nome}: ${n} de ${entradas.length}`,
        estiloTexto(18, COR.texto, true),
      ),
    );
    this.conteudo.add(
      this.texto(
        telaDe(this).largura - 40,
        153,
        fechada ? 'Página fechada' : `Fechar a página: +${cfg.doces} Doces Guardados`,
        estiloTexto(14, fechada ? visual.acentos.fantasma : visual.acentos.doce, true),
      ).setOrigin(1, 0),
    );
    entradas.forEach((e, i) => {
      const x = 40 + (i % COLUNAS) * (LARGURA_CARTA + ESPACO);
      const y = Y_GRADE + Math.floor(i / COLUNAS) * (ALTURA_CARTA + ESPACO);
      this.carta(g, e, vistos.has(e.id), x, y);
    });
    this.estado.vistos = n;
    this.estado.total = entradas.length;
  }

  private carta(
    g: Phaser.GameObjects.Graphics,
    e: EntradaDoDiario,
    visto: boolean,
    x: number,
    y: number,
  ): void {
    placa(g, x, y, LARGURA_CARTA, ALTURA_CARTA, {
      cor: visto ? COR.placaClara : COR.placa,
      alfa: 1,
      chanfro: 4,
    });
    const cx = x + 30;
    const cy = y + ALTURA_CARTA / 2;
    g.fillStyle(visto ? COR.placa : 0x0b0c10, 1).fillCircle(cx, cy, 22);
    const arte = e.arte ? imagemDaArte(this, e.arte.tipo, e.arte.id, cx, cy, 40) : null;
    if (arte) {
      // A silhueta: a arte toda escura.
      if (!visto) arte.setTint(0x2c2d33).setTintMode(Phaser.TintModes.FILL);
      this.conteudo.add(arte);
    } else {
      this.conteudo.add(
        this.texto(
          cx,
          cy - 10,
          visto ? e.nome.slice(0, 1) : '?',
          estiloTexto(18, COR.textoApagado, true),
        ).setOrigin(0.5, 0),
      );
    }
    const tx = x + 60;
    const largura = LARGURA_CARTA - 66;
    if (visto) {
      this.conteudo.add(
        this.texto(tx, y + 10, e.nome, {
          ...estiloTexto(13, COR.texto, true),
          wordWrap: { width: largura },
          maxLines: 3,
        }),
      );
    } else {
      this.conteudo.add(
        this.texto(tx, y + 8, e.dica, {
          ...estiloTexto(11, COR.textoApagado),
          wordWrap: { width: largura },
          maxLines: 4,
        }),
      );
    }
  }

  /** Maestria de cada fantasia: nível, pontos até o próximo e o que cada nível dá. */
  private fantasias(g: Phaser.GameObjects.Graphics): void {
    const prog = progresso();
    const ids = Object.keys(campeoes);
    const w = 290;
    const h = 470;
    const recompensas = entreRuns.maestria.recompensas;
    ids.forEach((id, i) => {
      const x = 40 + i * (w + 10);
      const y = 156;
      const m = maestria(prog, id, entreRuns);
      const ouro = m.nivel >= 5;
      placa(g, x, y, w, h, { alfa: 1, filete: ouro ? COR.doce : undefined });
      if (ouro) g.lineStyle(3, COR.doce, 1).strokeRect(x + 4, y + 4, w - 8, h - 8);
      g.fillStyle(COR.placaClara, 1).fillCircle(x + w / 2, y + 70, 50);
      const arte = imagemDaArte(this, 'retrato', id, x + w / 2, y + 66, 96);
      if (arte) this.conteudo.add(arte);
      else retrato(g, id, x + w / 2, y + 70, 80);
      this.conteudo.add(
        this.texto(
          x + w / 2,
          y + 130,
          campeoes[id]!.nome,
          estiloTexto(20, COR.texto, true),
        ).setOrigin(0.5, 0),
      );
      this.conteudo.add(
        this.texto(
          x + w / 2,
          y + 158,
          ouro ? (entreRuns.maestria.titulos[id] ?? '') : `Maestria ${m.nivel} de 5`,
          estiloTexto(14, ouro ? visual.acentos.doce : COR.textoApagado, true),
        ).setOrigin(0.5, 0),
      );
      // Barra até o próximo nível.
      const bx = x + 20;
      const by = y + 186;
      const bw = w - 40;
      g.fillStyle(COR.placa, 1).fillRect(bx, by, bw, 10);
      const f = m.proximo === null ? 1 : (m.pontos - m.desde) / Math.max(1, m.proximo - m.desde);
      g.fillStyle(ouro ? COR.doce : COR.jogador, 1).fillRect(bx, by, bw * Math.min(1, f), 10);
      this.conteudo.add(
        new TextoPixel(this, bx + bw, by + 16, 1, COR.luz)
          .texto(m.proximo === null ? `${m.pontos}` : `${m.pontos}/${m.proximo}`)
          .objeto.setOrigin(1, 0),
      );
      recompensas.forEach((r, k) => {
        const ok = m.nivel > k;
        this.conteudo.add(
          this.texto(bx, by + 44 + k * 44, `${k + 1}. ${r}`, {
            ...estiloTexto(13, ok ? COR.texto : COR.textoApagado, ok),
            wordWrap: { width: bw },
            maxLines: 2,
          }),
        );
      });
    });
    this.estado.vistos = 0;
    this.estado.total = ids.length;
  }
}
