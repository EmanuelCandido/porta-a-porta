import * as Phaser from 'phaser';
import { paraTela } from '../../render/iso';
import { gerador, luz, modelos, ruas, visual } from '../../sim/content';
import { gerarRua } from '../../sim/gerador';
import { publicarEstado } from '../ganchoTeste';
import { configurarZoomDaRoda } from '../camera';
import { CenarioDaRua } from '../rua/CenarioDaRua';

/** Prévia do kit visual (tarefa 2): a rua estática, com câmera livre e figurantes de escala. */
export class CenaRuaPrevia extends Phaser.Scene {
  private cenario?: CenarioDaRua;
  private teclas?: Record<'cima' | 'baixo' | 'esquerda' | 'direita', Phaser.Input.Keyboard.Key[]>;

  constructor() {
    super('CenaRuaPrevia');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    // `?rua=gerada&semente=7&bairro=1` mostra uma rua do gerador, com a cidade em volta.
    const rua =
      params.get('rua') === 'gerada'
        ? gerarRua(Number(params.get('semente') ?? 1), gerador, modelos, luz, {
            bairro: Number(params.get('bairro') ?? 0),
          }).rua
        : (ruas.find((r) => r.id === params.get('rua')) ?? ruas[0]!);
    const cenario = new CenarioDaRua(this, rua, {
      figurantes: true,
      noite: params.get('noite') === '1',
    });
    this.cenario = cenario;

    const camera = this.cameras.main;
    const { iso } = cenario;
    const limites = cenario.limitesDaCamera();
    if (cenario.temMundo) camera.removeBounds();
    else camera.setBounds(limites.x0, limites.y0, limites.x1 - limites.x0, limites.y1 - limites.y0);
    configurarZoomDaRoda(this, params);
    // `?visao=geral`: só para revisar o mapa inteiro de uma vez (fora dos limites do jogo).
    if (params.get('visao') === 'geral') {
      const diagonal = rua.largura + rua.profundidade;
      camera.setZoom(
        Math.min(
          camera.width / (diagonal * iso.meioTileX),
          camera.height / (diagonal * iso.meioTileY),
        ),
      );
    }
    // `?foco=x,y` centraliza num tile; `?foco=entrada` no ponto onde o jogador começa.
    const [fx, fy] = (params.get('foco') ?? '').split(',').map(Number);
    const foco =
      params.get('foco') === 'entrada'
        ? rua.entrada
        : fx !== undefined && fy !== undefined && Number.isFinite(fx) && Number.isFinite(fy)
          ? { x: fx, y: fy }
          : { x: rua.largura / 2, y: rua.profundidade / 2 };
    const centro = paraTela({ ...foco, z: 0 }, iso);
    cenario.enquadrar(camera, centro);

    const teclado = this.input.keyboard;
    if (teclado) {
      const k = (codigo: number) => teclado.addKey(codigo);
      const C = Phaser.Input.Keyboard.KeyCodes;
      this.teclas = {
        cima: [k(C.W), k(C.UP)],
        baixo: [k(C.S), k(C.DOWN)],
        esquerda: [k(C.A), k(C.LEFT)],
        direita: [k(C.D), k(C.RIGHT)],
      };
      k(C.L).on('down', () => this.alternarNoite());
    }

    publicarEstado({
      cena: 'CenaRuaPrevia',
      pronta: true,
      rua: rua.id,
      noite: cenario.noite,
      luzes: cenario.luzes.length,
      alternarNoite: () => this.alternarNoite(),
    });
  }

  override update(tempo: number, delta: number): void {
    this.cenario?.atualizar(tempo);
    if (!this.teclas) return;
    const camera = this.cameras.main;
    const passo = (visual.camera.velocidadePreviaPxPorS * delta) / 1000 / camera.zoom;
    const apertada = (teclas: Phaser.Input.Keyboard.Key[]) => teclas.some((t) => t.isDown);
    if (apertada(this.teclas.cima)) camera.scrollY -= passo;
    if (apertada(this.teclas.baixo)) camera.scrollY += passo;
    if (apertada(this.teclas.esquerda)) camera.scrollX -= passo;
    if (apertada(this.teclas.direita)) camera.scrollX += passo;
    this.cenario?.enquadrar(camera, {
      x: camera.scrollX + camera.width / 2,
      y: camera.scrollY + camera.height / 2,
    });
  }

  private alternarNoite(): boolean {
    const noite = this.cenario?.alternarNoite() ?? false;
    if (window.__portaAPorta) window.__portaAPorta.noite = noite;
    return noite;
  }
}
