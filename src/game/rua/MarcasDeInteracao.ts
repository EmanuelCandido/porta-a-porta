import * as Phaser from 'phaser';
import { paraTela, type Iso } from '../../render/iso';
import { visual } from '../../sim/content';
import type { V2 } from '../../sim/geometria';
import { COR, estiloTexto } from '../interface/estilo';
import { iconeDoce } from '../interface/icones';
import { PROFUNDIDADE } from './CenarioDaRua';

/** Uma porta que dá para usar agora; `perto`: o jogador já alcança com a tecla de interagir. */
export interface MarcaDeInteracao {
  pos: V2;
  perto: boolean;
}

/**
 * A marca das portas com interação (campainha, Casa Desconfiada, casa acesa da Porta a Porta e o
 * banco): um anel pulsando no chão, em volta da porta, e uma plaquinha com o doce flutuando acima
 * dela, apontando para baixo. Ao alcance do jogador, a plaquinha cresce, o anel acende e a tecla
 * aparece ao lado. Só as portas perto do jogador ganham marca.
 */
export class MarcasDeInteracao {
  private readonly chao: Phaser.GameObjects.Graphics;
  private readonly placas: Phaser.GameObjects.Graphics;
  private readonly tecla: Phaser.GameObjects.Text;

  constructor(
    cena: Phaser.Scene,
    private readonly iso: Iso,
    profundidadePlaca: number,
  ) {
    this.chao = cena.add.graphics().setDepth(PROFUNDIDADE.marcadores + 1);
    this.placas = cena.add.graphics().setDepth(profundidadePlaca);
    this.tecla = cena.add
      .text(0, 0, '', estiloTexto(13, COR.texto, true))
      .setOrigin(0, 0.5)
      .setResolution(2)
      .setDepth(profundidadePlaca + 1)
      .setVisible(false);
  }

  /** Redesenha as marcas do quadro (lista vazia: nada na tela). */
  desenhar(marcas: readonly MarcaDeInteracao[], jogador: V2, tecla: string, tempoMs: number): void {
    const cfg = visual.marcaDeInteracao;
    const chao = this.chao.clear();
    const g = this.placas.clear();
    this.tecla.setVisible(false);
    const fase = (tempoMs / cfg.periodoMs) * Math.PI * 2;
    // Um círculo de R tiles no chão vira uma elipse de R·√2·meioTileX por metade disso.
    const meiaLargura = cfg.anelTiles * Math.SQRT2 * this.iso.meioTileX;
    for (const m of marcas) {
      if (Math.hypot(m.pos.x - jogador.x, m.pos.y - jogador.y) > cfg.alcanceTiles) continue;
      const base = paraTela({ ...m.pos, z: 0 }, this.iso);
      const pulso = 1 + cfg.pulsoAnel * (0.5 + 0.5 * Math.sin(fase));
      const w = meiaLargura * 2 * pulso;
      if (m.perto) chao.fillStyle(COR.doce, 0.18).fillEllipse(base.x, base.y, w, w / 2);
      chao.lineStyle(2, COR.doce, m.perto ? 0.95 : 0.55).strokeEllipse(base.x, base.y, w, w / 2);

      const escala = m.perto ? cfg.escalaPerto : 1;
      const r = cfg.raioPx * escala;
      const topo = paraTela({ ...m.pos, z: cfg.alturaPx }, this.iso);
      const x = topo.x;
      const y = topo.y + Math.sin(fase + m.pos.x) * cfg.balancoPx;
      // A ponta virada para a porta, a placa escura com a borda do doce e o doce no meio.
      g.fillStyle(COR.doce, 1).fillTriangle(
        x - r * 0.45,
        y + r * 0.7,
        x + r * 0.45,
        y + r * 0.7,
        x,
        y + r * 1.45,
      );
      g.fillStyle(COR.placa, 0.92).fillCircle(x, y, r);
      g.lineStyle(2, COR.doce, 1).strokeCircle(x, y, r);
      iconeDoce(g, x, y, r * 1.35);
      if (m.perto) {
        this.tecla
          .setText(tecla)
          .setPosition(x + r + 10, y)
          .setVisible(true);
        const b = this.tecla.getBounds();
        g.fillStyle(COR.placa, 0.92).fillRoundedRect(
          b.x - 6,
          b.y - 3,
          b.width + 12,
          b.height + 6,
          4,
        );
        g.lineStyle(1, COR.doce, 1).strokeRoundedRect(
          b.x - 6,
          b.y - 3,
          b.width + 12,
          b.height + 6,
          4,
        );
      }
    }
  }
}
