import * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { telaDe } from '../tela';
import { COR } from './estilo';

// Movimento da interface (visual.json → interface.animacao): as telas entram crescendo um pouco,
// os botões chegam em fila, os painéis têm um brilho que passa pela faixa de cima, os números
// contam até o valor e os menus de tela inteira têm um fundo vivo (a noite, a lua e partículas).
// Tudo desenhado por código (regra 4) e nas cores do tema.

const A = () => visual.interface.animacao;

/** Gerador simples e fixo para a interface (Math.random é proibido no projeto). */
export function aleatorioFixo(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Entrada de uma tela por cima do jogo: a câmera da cena aparece crescendo de leve (o "pop" das
 * janelas de um jogo de estúdio). Só a câmera mexe: os botões e as zonas ficam onde estão.
 */
export function entrarCena(cena: Phaser.Scene): void {
  const a = A();
  const cam = cena.cameras.main;
  cam.setAlpha(0).setZoom(a.zoomEntrada);
  cena.tweens.add({
    targets: cam,
    alpha: 1,
    zoom: 1,
    duration: a.entradaMs,
    ease: 'Back.easeOut',
  });
}

/**
 * Ordem de chegada dos botões criados juntos (no mesmo quadro): cada um entra um pouco depois do
 * anterior. Uma leva nova (outra aba, outra página) recomeça a fila.
 */
export function atrasoNaFila(cena: Phaser.Scene): number {
  const a = A();
  const agora = cena.time.now;
  const ultimo = (cena.data.get('filaUltimoMs') as number | undefined) ?? -Infinity;
  const ordem =
    agora - ultimo <= a.mesmaLevaMs
      ? ((cena.data.get('filaOrdem') as number | undefined) ?? 0) + 1
      : 0;
  cena.data.set('filaUltimoMs', agora);
  cena.data.set('filaOrdem', ordem);
  return Math.min(ordem * a.escalonamentoMs, a.escalonamentoMaxMs);
}

/** Faz objetos chegarem deslizando e aparecendo, com o atraso da fila. */
export function chegar(
  cena: Phaser.Scene,
  alvos: Phaser.GameObjects.GameObject[],
  opcoes: { dx?: number; dy?: number; atraso?: number; alfa?: number } = {},
): void {
  const a = A();
  const atraso = opcoes.atraso ?? atrasoNaFila(cena);
  for (const o of alvos) {
    const t = o as unknown as { x: number; y: number; alpha: number; setAlpha(v: number): void };
    if (typeof t.x !== 'number') continue;
    const fim = { x: t.x, y: t.y, alpha: opcoes.alfa ?? t.alpha };
    t.x -= opcoes.dx ?? a.deslizePx;
    t.y += opcoes.dy ?? 0;
    t.setAlpha(0);
    cena.tweens.add({
      targets: o,
      x: fim.x,
      y: fim.y,
      alpha: fim.alpha,
      delay: atraso,
      duration: a.entradaMs,
      ease: 'Cubic.easeOut',
    });
  }
}

/** Textura de um traço de luz (branco no meio, transparente nas pontas), feita uma vez. */
function texturaDeBrilho(cena: Phaser.Scene): string {
  const chave = 'ui:brilho';
  if (cena.textures.exists(chave)) return chave;
  const w = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 8);
  cena.textures.addCanvas(chave, canvas);
  return chave;
}

/**
 * Brilho que corre pela faixa de cima de um painel de tempos em tempos (a luz da noite passando
 * pela moldura). Devolve a imagem, para quem monta containers pôr junto.
 */
export function brilharPainel(
  cena: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  cor: number = COR.luz,
): Phaser.GameObjects.Image {
  const a = A();
  const largura = Math.min(w * 0.35, 220);
  const img = cena.add
    .image(x, y + 1.5, texturaDeBrilho(cena))
    .setDisplaySize(largura, 3)
    .setTint(cor)
    .setAlpha(0)
    .setBlendMode(Phaser.BlendModes.ADD);
  // Corre por dentro da faixa, acendendo no meio e apagando nas pontas (não vaza do painel).
  const estado = { t: 0 };
  cena.tweens.add({
    targets: estado,
    t: 1,
    duration: a.brilhoMs,
    delay: a.brilhoPausaMs / 3,
    repeat: -1,
    repeatDelay: a.brilhoPausaMs,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      if (!img.active) return;
      img.x = x + largura / 2 + (w - largura) * estado.t;
      img.setAlpha(0.9 * Math.sin(Math.PI * estado.t));
    },
  });
  return img;
}

/**
 * Número que conta até o valor (fim da run, doces): chama `escrever` a cada quadro com o valor da
 * vez, arredondado.
 */
export function contar(
  cena: Phaser.Scene,
  de: number,
  para: number,
  escrever: (v: number) => void,
  atraso = 0,
): void {
  const a = A();
  const estado = { v: de };
  escrever(Math.round(de));
  if (de === para) return;
  cena.tweens.add({
    targets: estado,
    v: para,
    delay: atraso,
    duration: a.contagemMs,
    ease: 'Cubic.easeOut',
    onUpdate: () => escrever(Math.round(estado.v)),
    onComplete: () => escrever(Math.round(para)),
  });
}

/** Pulo rápido de escala (o número que mudou, o botão apertado). */
export function pular(
  cena: Phaser.Scene,
  alvo: Phaser.GameObjects.GameObject,
  escala = 1.18,
): void {
  const t = alvo as unknown as { scaleX: number; scaleY: number };
  // A escala de repouso fica guardada no objeto: um pulo que chega no meio de outro (vários doces
  // seguidos) parte dela, e não da escala já aumentada, senão o número cresce sem parar.
  let base = alvo.getData('escalaDeRepouso') as { x: number; y: number } | undefined;
  if (!base) {
    base = { x: t.scaleX, y: t.scaleY };
    alvo.setData('escalaDeRepouso', base);
  }
  // Só o pulo anterior para (os outros tweens do objeto, como a chegada, seguem).
  (alvo.getData('pulo') as Phaser.Tweens.Tween | undefined)?.stop();
  t.scaleX = base.x;
  t.scaleY = base.y;
  const repouso = base;
  const pulo = cena.tweens.add({
    targets: alvo,
    scaleX: repouso.x * escala,
    scaleY: repouso.y * escala,
    duration: A().pulaMs / 2,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      t.scaleX = repouso.x;
      t.scaleY = repouso.y;
    },
  });
  alvo.setData('pulo', pulo);
}

/** Textura de um ponto de luz macio (partículas do fundo), feita uma vez. */
function texturaDePonto(cena: Phaser.Scene): string {
  const chave = 'ui:ponto';
  if (cena.textures.exists(chave)) return chave;
  const r = 16;
  const canvas = document.createElement('canvas');
  canvas.width = r * 2;
  canvas.height = r * 2;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r * 2, r * 2);
  cena.textures.addCanvas(chave, canvas);
  return chave;
}

/** Gradiente vertical da noite (topo mais azul, chão escuro) com a lua acesa num canto. */
function texturaDaNoite(cena: Phaser.Scene, largura: number, altura: number): string {
  const chave = `ui:noite:${largura}x${altura}`;
  if (cena.textures.exists(chave)) return chave;
  const f = A().fundo;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d')!;
  const ceu = ctx.createLinearGradient(0, 0, 0, altura);
  ceu.addColorStop(0, f.ceuTopo);
  ceu.addColorStop(1, f.ceuBase);
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, largura, altura);
  // Lua: um halo grande e macio e o disco.
  const lx = largura * f.luaX;
  const ly = altura * f.luaY;
  const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, altura * 0.55);
  halo.addColorStop(0, f.halo);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, largura, altura);
  ctx.fillStyle = f.lua;
  ctx.beginPath();
  ctx.arc(lx, ly, f.raioLua, 0, Math.PI * 2);
  ctx.fill();
  // Bordas escuras.
  const v = ctx.createRadialGradient(
    largura / 2,
    altura / 2,
    altura * 0.35,
    largura / 2,
    altura / 2,
    largura * 0.7,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, largura, altura);
  cena.textures.addCanvas(chave, canvas);
  return chave;
}

/** Altura (px) da faixa de baixo onde ficam os atalhos das telas: sem janelas acesas nela. */
const FAIXA_DO_RODAPE = 60;

/** A silhueta dos telhados do bairro no pé da tela, com algumas janelas acesas. */
function desenharTelhados(cena: Phaser.Scene, largura: number, altura: number): void {
  const f = A().fundo;
  const g = cena.add.graphics().setDepth(-90).setScrollFactor(0);
  const rnd = aleatorioFixo(f.semente);
  const cor = Number.parseInt(f.telhados.slice(1), 16);
  const janelas = visual.janelasAcesas.cores.map((c) => Number.parseInt(c.slice(1), 16));
  let x = -20;
  while (x < largura + 20) {
    const w = 70 + rnd() * 110;
    const h = 50 + rnd() * f.alturaTelhados;
    const base = altura;
    const topo = base - h;
    g.fillStyle(cor, 1).fillRect(x, topo, w, h);
    // Telhado em duas águas ou reto.
    if (rnd() < 0.6)
      g.fillTriangle(x - 6, topo, x + w + 6, topo, x + w / 2, topo - 26 - rnd() * 22);
    for (let k = 0; k < 3; k++) {
      if (rnd() < 0.55) continue;
      const jx = x + 12 + rnd() * (w - 30);
      const jy = topo + 14 + rnd() * Math.max(4, h - 40);
      const cor = janelas[Math.floor(rnd() * janelas.length)] ?? COR.luz;
      // Nada de janela na faixa do rodapé (lá ficam os atalhos da tela).
      if (jy + 11 < altura - FAIXA_DO_RODAPE) g.fillStyle(cor, 0.45).fillRect(jx, jy, 8, 11);
    }
    x += w + 4 + rnd() * 16;
  }
}

/**
 * Fundo vivo para os menus de tela inteira (Álbum, Diário): o céu da noite com a lua, a silhueta
 * do bairro, partículas de luz subindo devagar e, de vez em quando, morcegos cruzando.
 */
export function fundoNoturno(cena: Phaser.Scene): void {
  const { largura, altura } = telaDe(cena);
  const f = A().fundo;
  cena.add
    .image(0, 0, texturaDaNoite(cena, largura, altura))
    .setOrigin(0)
    .setDepth(-100)
    .setScrollFactor(0);
  desenharTelhados(cena, largura, altura);
  particulas(cena, largura, altura, -80);
  // Morcegos: três "v" pretos que cruzam o céu batendo as asas, de tempos em tempos.
  const g = cena.add.graphics().setDepth(-85).setScrollFactor(0);
  const rnd = aleatorioFixo(f.semente + 7);
  let voo = { inicio: 0, y: 0, dir: 1 };
  const novoVoo = (agora: number) => {
    voo = {
      inicio: agora + f.morcegoACadaMs * (0.6 + rnd() * 0.8),
      y: altura * (0.15 + rnd() * 0.3),
      dir: rnd() < 0.5 ? 1 : -1,
    };
  };
  novoVoo(cena.time.now - f.morcegoACadaMs * 0.5);
  const atualizar = () => {
    const agora = cena.time.now;
    g.clear();
    const t = (agora - voo.inicio) / f.morcegoVooMs;
    if (t < 0) return;
    if (t > 1) {
      novoVoo(agora);
      return;
    }
    for (let k = 0; k < 3; k++) {
      const p = t - k * 0.04;
      const x = voo.dir > 0 ? -40 + p * (largura + 80) : largura + 40 - p * (largura + 80);
      const y = voo.y + Math.sin(p * 9 + k) * 18 + k * 14;
      const asa = Math.sin(agora / 70 + k * 2) * 5;
      g.lineStyle(2, 0x000000, 0.8)
        .beginPath()
        .moveTo(x - 7, y - asa)
        .lineTo(x, y + 2)
        .lineTo(x + 7, y - asa)
        .strokePath();
    }
  };
  cena.events.on('update', atualizar);
  cena.events.once('shutdown', () => cena.events.off('update', atualizar));
}

/** Pontos de luz que sobem devagar balançando (embers frios da noite). */
export function particulas(
  cena: Phaser.Scene,
  largura: number,
  altura: number,
  profundidade: number,
): void {
  const f = A().fundo;
  const rnd = aleatorioFixo(f.semente + 3);
  const tex = texturaDePonto(cena);
  const cor = Number.parseInt(f.corParticula.slice(1), 16);
  const pontos = Array.from({ length: f.particulas }, () => {
    const img = cena.add
      .image(rnd() * largura, rnd() * altura, tex)
      .setScale(0.12 + rnd() * 0.22)
      .setTint(cor)
      .setAlpha(0.15 + rnd() * 0.45)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(profundidade)
      .setScrollFactor(0);
    return { img, vel: f.velocidade * (0.5 + rnd()), fase: rnd() * Math.PI * 2, x0: img.x };
  });
  const atualizar = (_t: number, delta: number) => {
    const dt = delta / 1000;
    const agora = cena.time.now / 1000;
    for (const p of pontos) {
      p.img.y -= p.vel * dt;
      if (p.img.y < -10) {
        p.img.y = altura + 10;
        p.x0 = (p.x0 + largura * 0.37) % largura;
      }
      p.img.x = p.x0 + Math.sin(agora * 0.6 + p.fase) * 14;
    }
  };
  cena.events.on('update', atualizar);
  cena.events.once('shutdown', () => cena.events.off('update', atualizar));
}

/**
 * Saída para o jogo: um círculo escuro fecha em volta do centro da tela (a mesma linguagem da
 * passagem entre mapas) e só então a próxima cena começa.
 */
export function fecharEmCirculo(cena: Phaser.Scene, depois: () => void): void {
  const { largura, altura } = telaDe(cena);
  const a = A();
  const raioMax = Math.hypot(largura, altura) / 2 + 20;
  const g = cena.add.graphics().setDepth(2e7).setScrollFactor(0);
  const estado = { r: raioMax };
  cena.tweens.add({
    targets: estado,
    r: 0,
    duration: a.fecharMs,
    ease: 'Cubic.easeIn',
    onUpdate: () => {
      // Um anel grosso: o traço cobre do raio que fecha até bem fora da tela.
      g.clear()
        .lineStyle(raioMax * 2, 0x000000, 1)
        .strokeCircle(largura / 2, altura / 2, estado.r + raioMax);
    },
    onComplete: depois,
  });
}
