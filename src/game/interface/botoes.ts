import * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { mixer } from '../audio/mixer';
import { chegar, pular } from './animacao';
import { COR, estiloTexto, placa } from './estilo';

// Botões de menu (PLANO_MUNDO_VIVO.md, frente 7): a mesma placa chanfrada em todas as telas, com o
// mesmo realce para o mouse e para o foco do teclado (setas e Enter). Mouse e teclado dividem o
// foco: passar o mouse num botão leva o foco para ele. Os botões chegam em fila quando a tela abre,
// o com foco tem um halo que pulsa e cresce um pouco, e o apertado dá um pulinho.

export interface OpcoesBotao {
  /** O botão principal (a ação esperada) fica na cor do jogador. */
  principal?: boolean;
  tamanhoTexto?: number;
  /** Indisponível agora: apagado, sem a mãozinha e fora do foco do controle. */
  desligado?: boolean;
}

export class BotaoDeMenu {
  /** Halo do foco (atrás da placa), que pulsa enquanto o botão tem o foco. */
  readonly halo: Phaser.GameObjects.Graphics;
  readonly fundo: Phaser.GameObjects.Graphics;
  readonly rotulo: Phaser.GameObjects.Text;
  readonly zona: Phaser.GameObjects.Zone;
  private focado = false;
  /** Chamado quando o mouse entra (a lista move o foco para cá). */
  aoPassar: (() => void) | null = null;

  constructor(
    cena: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    texto: string,
    readonly aoClicar: () => void,
    private readonly opcoes: OpcoesBotao = {},
  ) {
    this.cena = cena;
    this.halo = cena.add.graphics().setAlpha(0);
    this.halo
      .fillStyle(COR.jogador, 0.16)
      .fillRect(x - 6, y - 6, w + 12, h + 12)
      .lineStyle(1, COR.jogador, 0.6)
      .strokeRect(x - 5, y - 5, w + 10, h + 10);
    this.fundo = cena.add.graphics();
    const principal = !!opcoes.principal && !opcoes.desligado;
    this.rotulo = cena.add
      .text(x + w / 2, y + h / 2, texto, {
        ...estiloTexto(
          opcoes.tamanhoTexto ?? 16,
          principal ? '#16171C' : opcoes.desligado ? COR.textoApagado : COR.texto,
          principal,
        ),
        ...(principal ? { strokeThickness: 0 } : {}),
      })
      .setOrigin(0.5)
      .setResolution(2);
    // A zona fica parada na tela: as cenas com câmera que se move (o título) também respondem.
    this.zona = cena.add
      .zone(x, y, w, h)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: !opcoes.desligado });
    // O controle nos menus começa pelo botão que já tem o foco (ou pelo principal).
    this.zona.setData('botaoDeMenu', this);
    this.zona.setData('focoProprio', true);
    this.zona.on('pointerdown', () => {
      if (this.opcoes.desligado) return;
      pular(cena, this.rotulo, 1.12);
      this.aoClicar();
    });
    this.zona.on('pointerover', () => (this.aoPassar ? this.aoPassar() : (this.foco = true)));
    this.zona.on('pointerout', () => {
      if (!this.aoPassar) this.foco = false;
    });
    this.desenhar();
    // Chega deslizando, na fila dos botões criados juntos.
    chegar(cena, [this.fundo, this.rotulo]);
  }

  private readonly cena: Phaser.Scene;
  private pulso: Phaser.Tweens.Tween | null = null;

  get objetos(): Phaser.GameObjects.GameObject[] {
    return [this.halo, this.fundo, this.rotulo, this.zona];
  }

  get principal(): boolean {
    return !!this.opcoes.principal;
  }

  set foco(v: boolean) {
    if (v === this.focado) return;
    this.focado = v;
    this.desenhar();
    this.animarFoco();
  }

  /** O halo acende e pulsa, e o rótulo cresce um pouco; sem o foco, os dois voltam. */
  private animarFoco(): void {
    const a = visual.interface.animacao;
    const cena = this.cena;
    if (!cena.sys.isActive() && !cena.sys.isVisible()) return;
    this.pulso?.stop();
    this.pulso = null;
    cena.tweens.killTweensOf(this.halo);
    const ligado = this.focado && !this.opcoes.desligado;
    cena.tweens.add({
      targets: this.halo,
      alpha: ligado ? 1 : 0,
      duration: a.focoMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!ligado || !this.halo.active) return;
        this.pulso = cena.tweens.add({
          targets: this.halo,
          alpha: 0.45,
          duration: a.pulsoFocoMs,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      },
    });
    cena.tweens.add({
      targets: this.rotulo,
      scaleX: ligado ? 1.05 : 1,
      scaleY: ligado ? 1.05 : 1,
      duration: a.focoMs,
      ease: 'Back.easeOut',
    });
  }

  get foco(): boolean {
    return this.focado;
  }

  set texto(t: string) {
    this.rotulo.setText(t);
  }

  private desenhar(): void {
    const principal = !!this.opcoes.principal && !this.opcoes.desligado;
    const g = this.fundo.clear();
    placa(g, this.x, this.y, this.w, this.h, {
      cor: principal ? COR.jogador : COR.placaClara,
      alfa: this.opcoes.desligado ? 0.5 : principal || this.focado ? 1 : 0.92,
      chanfro: 5,
    });
    if (this.focado) {
      g.lineStyle(2, principal ? COR.luz : COR.jogador, 1).strokeRect(
        this.x,
        this.y,
        this.w,
        this.h,
      );
      // Marca do foco à esquerda (o teclado sabe onde está).
      g.fillStyle(principal ? COR.luz : COR.jogador, 1).fillRect(
        this.x - 8,
        this.y + 6,
        3,
        this.h - 12,
      );
    }
  }
}

/**
 * Uma coluna de botões com foco: setas para cima e para baixo movem, Enter (ou Espaço) aperta, e o
 * mouse leva o foco junto. `ligarTeclado` usa o teclado da cena.
 */
export class ListaDeBotoes {
  private indice = 0;

  constructor(readonly botoes: BotaoDeMenu[]) {
    botoes.forEach((b, i) => {
      b.aoPassar = () => this.focar(i);
    });
    this.focar(0);
  }

  get focado(): number {
    return this.indice;
  }

  focar(i: number): void {
    const n = this.botoes.length;
    if (n === 0) return;
    const novo = ((i % n) + n) % n;
    if (novo !== this.indice && this.botoes.some((b) => b.foco)) mixer.tocar('foco');
    this.indice = novo;
    this.botoes.forEach((b, k) => (b.foco = k === this.indice));
  }

  mover(passo: number): void {
    this.focar(this.indice + passo);
  }

  apertar(): void {
    this.botoes[this.indice]?.aoClicar();
  }

  ligarTeclado(cena: Phaser.Scene): void {
    const k = cena.input.keyboard;
    if (!k) return;
    k.on('keydown-UP', () => this.mover(-1));
    k.on('keydown-DOWN', () => this.mover(1));
    k.on('keydown-W', () => this.mover(-1));
    k.on('keydown-S', () => this.mover(1));
    k.on('keydown-ENTER', () => this.apertar());
    k.on('keydown-SPACE', () => this.apertar());
  }
}

/**
 * Realce de passar o mouse numa zona que já existe (abas, linhas de lista): o contorno aceso na
 * cor do jogador. O desenho entra no mesmo container da zona, para sumir junto com ela.
 */
export function realcarAoPassar(
  cena: Phaser.Scene,
  zona: Phaser.GameObjects.Zone,
  container?: Phaser.GameObjects.Container,
): void {
  const g = cena.add.graphics();
  container?.add(g);
  zona.on('pointerover', () => {
    if (!zona.input?.cursor) return;
    g.clear()
      .lineStyle(2, COR.jogador, 1)
      .strokeRect(zona.x + 1, zona.y + 1, zona.width - 2, zona.height - 2);
  });
  zona.on('pointerout', () => g.clear());
}
