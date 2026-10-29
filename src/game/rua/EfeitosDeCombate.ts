import * as Phaser from 'phaser';
import {
  FONTE_PIXEL,
  LARGURA_CELULA,
  paraFontePixel,
  registrarFontePixel,
} from '../interface/fontePixel';
import {
  arcoDaPocao,
  direcaoDaFaisca,
  estrela,
  pontoEspalhado,
  vassouraVoando,
} from '../../render/feiticos';
import { paraTela, type Iso, type Vec2 } from '../../render/iso';
import { poligonoDeLuz } from '../../render/luz';
import { faixa, indicadorDeMira } from '../../render/mira';
import { exploracao, inimigos, visual } from '../../sim/content';
import type { Habilidade, NomeAcento } from '../../sim/content/esquemas';
import type { Evento } from '../../sim/eventos';
import type { V2 } from '../../sim/geometria';
import {
  direcoesDoLeque,
  pontoNoAlcance,
  type Area,
  type EstadoHabilidades,
} from '../../sim/habilidades';
import type { Mundo } from '../../sim/mundo';
import { corNumerica, noChao, PROFUNDIDADE } from './CenarioDaRua';

/** Por cima de todos os objetos (cuja profundidade é x + y, no máximo algumas dezenas). */
const PROFUNDIDADE_NO_AR = 1_000;
const PROFUNDIDADE_NUMEROS = 1_001;
/** Ângulo de ouro: espalha as abóboras de cada onda pelo círculo sem sorteio. */
const ANGULO_DE_OURO = Math.PI * (3 - Math.sqrt(5));

interface Particula {
  chao: V2;
  desvio: Vec2;
  vel: Vec2;
  alturaIni: number;
  vida: number;
  total: number;
  cor: number;
  tamanho: number;
  estoura: boolean;
  /** Desenho: quadradinho (padrão), estrela girando ou bolha (contorno). */
  forma?: 'estrela' | 'bolha';
  /** Radianos por segundo (estrelas). */
  giro?: number;
  /** Some aos poucos mesmo caindo do alto (folhas, estrelas do rastro). */
  apaga?: boolean;
  /** Abóbora da Chuva: sombra no chão que cresce até a queda; ao cair, sementes e chão queimado. */
  abobora?: { raio: number };
}

/** Chão chamuscado da Chuva de Abóboras: some aos poucos. */
interface Queimado {
  centro: V2;
  raio: number;
  vida: number;
  total: number;
}

interface Forma {
  pts: V2[];
  vida: number;
  total: number;
  cor: number;
  alfa: number;
}

interface Numero {
  texto: Phaser.GameObjects.BitmapText;
  base: Vec2;
  vida: number;
  total: number;
}

export interface QuadroDeCombate {
  alfa: number;
  dtS: number;
  mundo: Mundo;
  habilidades: EstadoHabilidades;
  /** Mira no chão, enquanto a tecla está segurada. */
  mira: { def: Habilidade; origem: V2; cursor: V2 } | null;
  /** Id do jogador (os números de dano nele são vermelhos). */
  jogador: number;
  /** Frenesi: números maiores. */
  frenesi: boolean;
}

const cor = (nome: NomeAcento) => corNumerica(visual.acentos[nome]);
const pontos = (pts: Vec2[]) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/**
 * Tudo que as habilidades desenham: a mira no chão, os avisos vermelhos dos inimigos (que enchem
 * até o impacto e ficam sempre por cima da escuridão), projéteis, áreas, rastros, golpes em linha
 * e em cone, partículas quadradas, anéis de explosão e os números de dano. Só lê a simulação.
 */
export class EfeitosDeCombate {
  private readonly chao: Phaser.GameObjects.Graphics;
  private readonly noAr: Phaser.GameObjects.Graphics;
  private readonly projeteis = new Map<number, Phaser.GameObjects.Graphics>();
  private particulas: Particula[] = [];
  private formas: Forma[] = [];
  private numeros: Numero[] = [];
  private readonly numerosGuardados: Phaser.GameObjects.BitmapText[] = [];
  private ondasDeAbobora = 0;
  private queimados: Queimado[] = [];
  /** Relógio da tela (giro das estrelas). */
  private relogioS = 0;
  /** Onde cada poção saiu da mão (id da área → ponto), e as que já quebraram no chão. */
  private readonly origemDaPocao = new Map<number, V2>();
  private readonly pocoesNoChao = new Set<number>();
  /** Frações acumuladas de folhas, bolhas e estrelas a soltar (por projétil, área ou dash). */
  private readonly aSoltar = new Map<string, number>();
  private soltas = 0;
  /** Chão eletrificado (fio do poste) e avisos da abóbora gigante, com o tempo que falta (s). */
  private eletricos: { centro: V2; raio: number; vida: number; total: number }[] = [];
  private avisosDeExplosao: {
    centro: V2;
    raio: number;
    vida: number;
    total: number;
    /** Aviso de inimigo (Explosivo): vermelho, como todo ataque inimigo. */
    inimigo?: boolean;
  }[] = [];
  /** Última vez (s) que o portão mostrou "Golpe final!" (para não repetir a cada golpe). */
  private dicaDoPortaoS = -Infinity;
  /** Dashes do Salto já vistos (a decolagem solta estrelas uma vez). */
  private readonly saltosVistos = new Set<number>();

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly iso: Iso,
  ) {
    registrarFontePixel(cena);
    this.chao = cena.add.graphics().setDepth(PROFUNDIDADE.marcadores);
    this.noAr = cena.add.graphics().setDepth(PROFUNDIDADE_NO_AR);
  }

  private tela(p: V2, z = 0): Vec2 {
    return paraTela({ x: p.x, y: p.y, z }, this.iso);
  }

  private circulo(c: V2, raio: number): V2[] {
    return poligonoDeLuz(c.x, c.y, raio, visual.luzNaTela.ladosPoligono);
  }

  /** Reage ao que aconteceu na simulação desde o último quadro. */
  consumir(eventos: readonly Evento[], q: Pick<QuadroDeCombate, 'jogador' | 'frenesi'>): void {
    const c = visual.combateNaTela;
    for (const ev of eventos) {
      switch (ev.tipo) {
        case 'dano':
          // Objetos quebráveis não mostram número: tremem e lascam (`objetoAtingido`).
          if (!ev.objeto && (ev.valor > 0.5 || ev.absorvido > 0.5)) {
            const corNum =
              ev.alvo === q.jogador
                ? visual.acentos.perigo
                : ev.critico
                  ? visual.acentos.doce
                  : visual.paleta.luz;
            const escala =
              (ev.critico ? c.numeroDano.escalaCritico : 1) *
              (q.frenesi && ev.alvo !== q.jogador ? c.numeroDano.escalaFrenesi : 1);
            this.mostrarNumero(
              ev.pos,
              String(Math.round(ev.valor || ev.absorvido)),
              corNum,
              escala,
            );
          }
          break;
        case 'cura':
          if (ev.valor >= 1)
            this.mostrarNumero(ev.pos, `+${Math.round(ev.valor)}`, visual.acentos.fantasma, 0.9);
          break;
        case 'explosaoCaldeirao':
          this.anel(ev.centro, ev.raio, cor('magia'), c.explosao.alfa, c.explosao.duracaoMs);
          this.espalhar(ev.centro, cor('magia'), 8);
          break;
        case 'grito':
          if (ev.pos) this.mostrarNumero(ev.pos, ev.texto, visual.acentos.perigo, 0.9);
          break;
        case 'alarme':
          this.anel(
            ev.pos,
            ev.raio,
            cor('perigo'),
            c.explosao.alfa * 0.6,
            c.explosao.duracaoMs * 2,
          );
          break;
        case 'invocou':
          this.espalhar(ev.pos, cor('perigo'), 5);
          break;
        case 'desmontou':
          // Os ossos espalham no chão; o Esqueleto volta em 2 s.
          this.espalhar(ev.pos, corNumerica(visual.paleta.luz), 12);
          this.mostrarNumero(ev.pos, 'Remontando...', visual.acentos.jogador, 0.9);
          break;
        case 'remontou':
          this.anel(ev.pos, 1.2, cor('jogador'), c.explosao.alfa, c.explosao.duracaoMs);
          break;
        case 'feiticoFalhou':
          // Feitiço Instável: a habilidade falhou.
          this.espalhar(ev.pos, cor('magia'), 6);
          this.mostrarNumero(ev.pos, 'Falhou!', visual.acentos.magia, 0.9);
          break;
        case 'arrepio':
          this.anel(ev.pos, ev.raio, cor('fantasma'), c.explosao.alfa, c.explosao.duracaoMs);
          break;
        case 'apareceu':
          this.espalhar(ev.pos, cor('fantasma'), 6);
          break;
        case 'esquivou':
          // Poeirinha no chão de onde o inimigo pulou de lado.
          this.espalhar(ev.pos, corNumerica(visual.paleta.luz), 4);
          break;
        case 'explosaoAbobora':
          this.anel(ev.centro, ev.raio, cor('jogador'), c.explosao.alfa, c.explosao.duracaoMs);
          this.espalhar(ev.centro, cor('jogador'), 10);
          break;
        case 'pulso':
          if (ev.lado === 'jogador' && ev.tecla === 'R' && !ev.final)
            this.chuvaDeAboboras(ev.centro, ev.raio);
          else if (ev.final || ev.lado !== 'jogador') {
            const k = ev.lado === 'jogador' ? cor('jogador') : cor('perigo');
            this.anel(ev.centro, ev.raio, k, c.explosao.alfa, c.explosao.duracaoMs);
          }
          break;
        case 'projetilFim':
          if (ev.chave === 'auto' && ev.lado === 'jogador') this.brilho(ev.pos, cor('jogador'));
          else this.espalhar(ev.pos, ev.lado === 'jogador' ? cor('jogador') : cor('perigo'), 4);
          break;
        case 'estouro':
          this.estouro(ev.centro, ev.raio, ev.chave === 'E');
          break;
        case 'tonto':
          // Estrelinhas girando em volta da cabeça de quem ficou tonto.
          for (let i = 0; i < 3; i++) {
            const d = direcaoDaFaisca(i, 3, this.relogioS);
            this.particulas.push({
              chao: { x: ev.pos.x + d.x * 0.25, y: ev.pos.y + d.y * 0.25 },
              desvio: { x: 0, y: 0 },
              vel: { x: d.x * 12, y: d.y * 6 },
              alturaIni: 30,
              vida: 450,
              total: 450,
              cor: cor('doce'),
              tamanho: 7,
              estoura: false,
              forma: 'estrela',
              giro: 10,
              apaga: true,
            });
          }
          break;
        case 'preparoCortado':
          this.brilho(ev.pos, corNumerica(visual.paleta.luz));
          break;
        case 'objetoAtingido':
          this.pedacos(ev.pos, ev.material, visual.combateNaTela.quebraveis.lascas, 0.6);
          if (ev.resistiu && this.relogioS - this.dicaDoPortaoS > 1.2) {
            this.dicaDoPortaoS = this.relogioS;
            this.mostrarNumero(ev.pos, 'Golpe final!', visual.acentos.doce, 0.8);
          }
          break;
        case 'alarmeCarro':
          this.anel(ev.pos, 1.8, cor('doce'), 0.45, 700);
          this.brilho(ev.pos, cor('doce'));
          break;
        case 'fioCaiu':
          this.eletricos.push({
            centro: { ...ev.centro },
            raio: ev.raio,
            vida: ev.duracaoS,
            total: ev.duracaoS,
          });
          this.espalhar(ev.centro, cor('doce'), 10);
          break;
        case 'faisca':
          this.espalhar(ev.centro, cor('doce'), 4);
          break;
        case 'jato':
          this.gotas(ev.centro);
          break;
        case 'avisoExplosao':
          this.avisosDeExplosao.push({
            centro: { ...ev.centro },
            raio: ev.raio,
            vida: ev.segundos,
            total: ev.segundos,
            inimigo: ev.lado === 'inimigo',
          });
          break;
        case 'escudoBateu':
          this.brilho(ev.pos, corNumerica(visual.paleta.luz));
          break;
        case 'surpresa':
          // O Saco-Surpresa acordou (ou a travessura saiu da porta).
          this.espalhar(ev.pos, cor('perigo'), 8);
          this.mostrarNumero(ev.pos, '!', visual.acentos.perigo, 1.4);
          break;
        case 'quebrou':
          this.pedacos(ev.pos, ev.material, visual.combateNaTela.quebraveis.pedacos, 1);
          this.anel(ev.pos, 0.7, corNumerica(visual.paleta.piso.calcada), 0.5, 300);
          break;
        case 'golpeLinha': {
          const dir = { x: ev.ate.x - ev.de.x, y: ev.ate.y - ev.de.y };
          const n = Math.hypot(dir.x, dir.y) || 1;
          this.formas.push({
            pts: faixa(ev.de, { x: dir.x / n, y: dir.y / n }, n, ev.largura / 2),
            vida: 180,
            total: 180,
            cor: ev.lado === 'jogador' ? cor('jogador') : cor('perigo'),
            alfa: 0.55,
          });
          break;
        }
        case 'golpeCone': {
          const meio = ((ev.angulo / 2) * Math.PI) / 180;
          const base = Math.atan2(ev.dir.y, ev.dir.x);
          const lados = 10;
          const arco = Array.from({ length: lados + 1 }, (_, i) => {
            const t = base - meio + (2 * meio * i) / lados;
            return { x: ev.de.x + Math.cos(t) * ev.alcance, y: ev.de.y + Math.sin(t) * ev.alcance };
          });
          this.formas.push({
            pts: [{ ...ev.de }, ...arco],
            vida: 200,
            total: 200,
            cor: ev.lado === 'jogador' ? cor('jogador') : cor('perigo'),
            alfa: 0.55,
          });
          break;
        }
        case 'marcouAlvo':
          break;
        case 'interrompeu':
          this.mostrarNumero(ev.pos, 'interrompido!', visual.acentos.doce, 0.85);
          this.anel(ev.pos, 0.8, cor('doce'), 0.5, 300);
          break;
        case 'pulsoLanterna':
          this.anel(ev.pos, ev.raio, corNumerica(visual.paleta.luz), 0.35, 500);
          break;
        case 'posteCaiu':
          this.anel(ev.pos, 2.5, cor('magia'), 0.6, 600);
          this.espalhar(ev.pos, cor('magia'), 14);
          break;
        case 'pegouDoce':
          this.mostrarNumero(ev.pos, `+${ev.valor}`, visual.acentos.doce, 0.8);
          break;
        case 'nivel':
          break;
        default:
          break;
      }
    }
  }

  atualizar(q: QuadroDeCombate): void {
    this.chao.clear();
    this.noAr.clear();
    this.relogioS += q.dtS;
    this.desenharQueimados(q.dtS);
    this.desenharAreas(q.habilidades, q.mundo, q.dtS);
    this.desenharRastros(q.habilidades);
    this.rastroDoSalto(q.mundo, q.dtS);
    this.brilhoDosQuebraveis(q.mundo, q.jogador);
    this.desenharArmas(q.dtS);
    this.desenharAvisos(q.mundo);
    this.desenharVigias(q.mundo);
    if (q.mira) this.desenharMira(q.mira);
    this.desenharProjeteis(q.habilidades, q.alfa, q.dtS);
    this.desenharFormas(q.dtS);
    this.desenharParticulas(q.dtS);
    this.animarNumeros(q.dtS);
  }

  /** Cone de visão do Vizinho Curioso no chão, para o jogador saber por onde chegar. */
  private desenharVigias(mundo: Mundo): void {
    for (const e of mundo.entidades) {
      if (e.especie !== 'vizinho_curioso' || !e.combate || e.combate.coragem <= 0) continue;
      if ((e.ia as { estado?: string } | undefined)?.estado === 'fuga') continue;
      const p = inimigos.inimigos[e.especie]?.param ?? {};
      const forma = {
        tipo: 'cone' as const,
        alcance: p['alcanceVisao'] ?? 6,
        angulo: p['anguloVisao'] ?? 70,
      };
      const alvo = { x: e.pos.x + e.olhar.x, y: e.pos.y + e.olhar.y };
      const area = noChao(indicadorDeMira(forma, e.pos, alvo, 12).area, this.iso);
      this.preencher(this.chao, area, cor('perigo'), 0.07);
      this.contornar(this.chao, area, cor('perigo'), 0.3);
    }
  }

  private preencher(g: Phaser.GameObjects.Graphics, pts: Vec2[], c: number, alfa: number): void {
    if (pts.length >= 3) g.fillStyle(c, alfa).fillPoints(pontos(pts), true);
  }

  private contornar(g: Phaser.GameObjects.Graphics, pts: Vec2[], c: number, alfa: number): void {
    if (pts.length >= 2) {
      g.lineStyle(visual.combateNaTela.mira.espessuraPx, c, alfa).strokePoints(pontos(pts), true);
    }
  }

  private desenharMira(m: NonNullable<QuadroDeCombate['mira']>): void {
    const { mira } = visual.combateNaTela;
    const ind = indicadorDeMira(m.def.forma, m.origem, m.cursor, visual.luzNaTela.ladosPoligono);
    const c = cor(m.def.cor);
    if (ind.alcance) this.contornar(this.chao, noChao(ind.alcance, this.iso), c, mira.alfaArea);
    const area = noChao(ind.area, this.iso);
    this.preencher(this.chao, area, c, mira.alfaArea);
    this.contornar(this.chao, area, c, mira.alfaContorno);
  }

  /**
   * Aviso no chão de todo lançamento em andamento: o dos inimigos é vermelho e enche de fora para
   * dentro até o impacto; o do jogador (R) usa a cor dele.
   */
  private desenharAvisos(mundo: Mundo): void {
    for (const e of mundo.entidades) {
      const l = e.lancador;
      if (!l?.lancando) continue;
      const def = l.slots[l.lancando.chave]?.def;
      if (!def) continue;
      const inimigo = e.tipo !== 'jogador';
      if (inimigo && !def.aviso) continue;
      if (!inimigo && def.forma.tipo !== 'area') continue;
      const k = inimigo ? cor('perigo') : cor(def.cor);
      const progresso = 1 - l.lancando.restante / l.lancando.total;
      const origem = l.lancando.origem;
      const alvo = l.lancando.alvo;
      const f = def.forma;
      const formas: [V2[], V2[]][] = [];
      switch (f.tipo) {
        case 'area': {
          const c = f.centradaNoLancador ? e.pos : pontoNoAlcance(origem, alvo, f.alcance);
          formas.push(
            f.quadrada
              ? [quadrado(c, f.raio), quadrado(c, f.raio * progresso)]
              : [this.circulo(c, f.raio), this.circulo(c, f.raio * progresso)],
          );
          break;
        }
        case 'linha':
        case 'dash': {
          const comp = f.tipo === 'linha' ? f.alcance : f.distancia;
          const larg = f.tipo === 'linha' ? f.largura : e.raio * 2;
          const d = { x: alvo.x - origem.x, y: alvo.y - origem.y };
          const n = Math.hypot(d.x, d.y) || 1;
          for (const dir of direcoesDoLeque({ x: d.x / n, y: d.y / n }, def.leque)) {
            formas.push([
              faixa(origem, dir, comp, larg / 2),
              faixa(origem, dir, comp * progresso, larg / 2),
            ]);
          }
          break;
        }
        case 'cone': {
          const ind = indicadorDeMira(f, origem, alvo, 10);
          formas.push([
            ind.area,
            indicadorDeMira({ ...f, alcance: f.alcance * progresso }, origem, alvo, 10).area,
          ]);
          break;
        }
        default:
          continue;
      }
      for (const [borda, dentro] of formas) {
        this.contornar(this.chao, noChao(borda, this.iso), k, 0.9);
        this.preencher(this.chao, noChao(borda, this.iso), k, 0.12);
        this.preencher(this.chao, noChao(dentro, this.iso), k, 0.38);
      }
    }
  }

  /** Poção (área do jogador que demora a cair): voa em arco, quebra e borbulha. */
  private ehPocao(a: Area): boolean {
    const f = a.def.forma;
    return a.lado === 'jogador' && f.tipo === 'area' && f.atraso > 0 && !f.quadrada;
  }

  private desenharAreas(h: EstadoHabilidades, mundo: Mundo, dtS: number): void {
    const { area } = visual.combateNaTela;
    const vivas = new Set<number>();
    for (const a of h.areas) {
      vivas.add(a.id);
      if (this.ehPocao(a)) {
        const f = a.def.forma;
        const atraso = f.tipo === 'area' ? f.atraso : 0;
        if (!this.origemDaPocao.has(a.id)) {
          const dono = mundo.entidades.find((e) => e.id === a.dono);
          this.origemDaPocao.set(a.id, dono ? { ...dono.pos } : { ...a.centro });
        }
        if (a.idade < atraso) {
          this.pocaoNoAr(a, this.origemDaPocao.get(a.id)!, a.idade / atraso);
          continue;
        }
        if (!this.pocoesNoChao.has(a.id)) {
          this.pocoesNoChao.add(a.id);
          this.quebrarPocao(a);
        }
        this.borbulhar(a, dtS);
      }
      const resta = 1 - a.idade / Math.max(a.duracao, 1e-6);
      const k = a.lado === 'jogador' ? cor(a.def.cor) : cor('perigo');
      const quadrada = a.def.forma.tipo === 'area' && a.def.forma.quadrada;
      const pts = noChao(
        quadrada ? quadrado(a.centro, a.raio) : this.circulo(a.centro, a.raio),
        this.iso,
      );
      const alfa = a.def.sombra ? 0.35 : area.alfa;
      this.preencher(
        this.chao,
        pts,
        a.def.sombra ? corNumerica(visual.luzNaTela.escuridao.cor) : k,
        alfa * (0.5 + 0.5 * resta),
      );
      this.contornar(this.chao, pts, k, area.alfaContorno * Math.max(0.3, resta));
    }
    for (const id of [...this.origemDaPocao.keys()]) {
      if (vivas.has(id)) continue;
      this.origemDaPocao.delete(id);
      this.pocoesNoChao.delete(id);
      this.aSoltar.delete(`bolha${id}`);
    }
  }

  /** Acumula uma fração de partículas e solta as inteiras. */
  private soltar(chave: string, quantas: number, criar: () => void): void {
    let acc = (this.aSoltar.get(chave) ?? 0) + quantas;
    for (; acc >= 1; acc--) criar();
    this.aSoltar.set(chave, acc);
  }

  /** O frasco no ar, com a sombra andando no chão e o alvo marcado onde vai cair. */
  private pocaoNoAr(a: Area, origem: V2, t: number): void {
    const { pocao } = visual.combateNaTela.feiticos;
    const k = cor(a.def.cor);
    this.contornar(this.chao, noChao(this.circulo(a.centro, a.raio), this.iso), k, 0.25 + 0.5 * t);
    const voo = arcoDaPocao(
      origem,
      a.centro,
      t,
      pocao.arcoPx,
      visual.combateNaTela.projetil.alturaPx,
    );
    const chao = this.tela(voo.chao, 0);
    const lado = pocao.frascoPx;
    this.chao.fillStyle(0x000000, 0.3).fillEllipse(chao.x, chao.y, lado * 1.4, lado * 0.7);
    const s = this.tela(voo.chao, voo.zPx);
    const luz = corNumerica(visual.paleta.luz);
    // Frasco: corpo redondo na cor da poção, gargalo claro e um reflexo.
    this.noAr.fillStyle(k, 1).fillCircle(s.x, s.y, lado / 2);
    this.noAr.fillStyle(luz, 0.9).fillRect(s.x - lado / 6, s.y - lado, lado / 3, lado / 2);
    this.noAr.fillStyle(luz, 0.7).fillRect(s.x - lado / 4, s.y - lado / 4, lado / 6, lado / 6);
  }

  /** A poção quebra: cacos claros voam e a poça respinga para fora. */
  private quebrarPocao(a: Area): void {
    const { pocao, estouro } = visual.combateNaTela.feiticos;
    const k = cor(a.def.cor);
    this.anel(a.centro, a.raio, k, visual.combateNaTela.explosao.alfa, estouro.duracaoMs);
    for (let i = 0; i < pocao.cacos; i++) {
      const d = direcaoDaFaisca(i, pocao.cacos, a.id);
      const v = estouro.velocidadePxPorS * (0.6 + (i % 3) * 0.2);
      this.particulas.push({
        chao: { ...a.centro },
        desvio: { x: 0, y: 0 },
        vel: { x: d.x * v, y: d.y * v * 0.5 - v * 0.5 },
        alturaIni: 0,
        vida: estouro.duracaoMs,
        total: estouro.duracaoMs,
        cor: i % 2 === 0 ? corNumerica(visual.paleta.luz) : k,
        tamanho: 3,
        estoura: false,
      });
    }
  }

  /** Bolhas que sobem da poça e estouram. */
  private borbulhar(a: Area, dtS: number): void {
    const { pocao } = visual.combateNaTela.feiticos;
    this.soltar(`bolha${a.id}`, pocao.bolhasPorS * dtS, () => {
      const k = this.soltas++;
      this.particulas.push({
        chao: pontoEspalhado(a.centro, a.raio * 0.85, k * 7 + a.id),
        desvio: { x: 0, y: 0 },
        vel: { x: 0, y: -pocao.bolhaPx * 6 },
        alturaIni: 0,
        vida: pocao.bolhaMs,
        total: pocao.bolhaMs,
        cor: cor(a.def.cor),
        tamanho: pocao.bolhaPx * (1 + (k % 3) * 0.4),
        estoura: false,
        forma: 'bolha',
      });
    });
  }

  /** Estouro da Vassoura (faíscas e anel) ou pouso do Salto (poeira e estrelas). */
  private estouro(centro: V2, raio: number, pouso: boolean): void {
    const { estouro } = visual.combateNaTela.feiticos;
    const poeira = corNumerica(visual.paleta.piso.calcada);
    this.anel(centro, raio, pouso ? poeira : cor('jogador'), 0.6, estouro.duracaoMs);
    for (let i = 0; i < estouro.faiscas; i++) {
      const d = direcaoDaFaisca(i, estouro.faiscas, this.relogioS);
      const v = estouro.velocidadePxPorS * (i % 2 === 0 ? 1 : 0.65);
      const terra = pouso && i % 3 !== 0;
      this.particulas.push({
        chao: { ...centro },
        desvio: { x: 0, y: 0 },
        vel: { x: d.x * v, y: d.y * v * 0.5 - (pouso ? 0 : v * 0.3) },
        alturaIni: pouso ? 4 : 10,
        vida: estouro.duracaoMs,
        total: estouro.duracaoMs,
        cor: i % 3 === 0 ? cor('doce') : terra ? poeira : cor('jogador'),
        tamanho: terra ? 5 : 10,
        estoura: false,
        forma: terra ? undefined : 'estrela',
        giro: 8,
        apaga: true,
      });
    }
  }

  /** Brilho rápido onde a estrela do golpe acerta. */
  private brilho(pos: V2, k: number): void {
    const { brilhoAcerto } = visual.combateNaTela.feiticos;
    this.particulas.push({
      chao: { ...pos },
      desvio: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      alturaIni: visual.combateNaTela.projetil.alturaPx,
      vida: brilhoAcerto.duracaoMs,
      total: brilhoAcerto.duracaoMs,
      cor: k,
      tamanho: brilhoAcerto.raioPx * 2,
      estoura: false,
      forma: 'estrela',
      giro: 4,
      apaga: true,
    });
    this.espalhar(pos, corNumerica(visual.paleta.luz), 3);
  }

  /** Salto de Vassoura: estrelas saem na decolagem e ficam no caminho, caindo e sumindo. */
  private rastroDoSalto(mundo: Mundo, dtS: number): void {
    const { salto, estouro } = visual.combateNaTela.feiticos;
    for (const e of mundo.entidades) {
      const carga = e.forcado?.carga;
      if (e.tipo !== 'jogador' || !carga || carga.chave !== 'E' || !carga.def.estouro) continue;
      const solta = (n: number, espalha: number): void => {
        for (let i = 0; i < n; i++) {
          const k = this.soltas++;
          const d = direcaoDaFaisca(k, 5, k);
          this.particulas.push({
            chao: { x: e.pos.x + d.x * 0.25, y: e.pos.y + d.y * 0.25 },
            desvio: { x: 0, y: 0 },
            vel: { x: d.x * espalha, y: d.y * espalha * 0.5 },
            alturaIni: 6 + (k % 4) * 4,
            vida: salto.estrelaMs,
            total: salto.estrelaMs,
            cor: k % 3 === 0 ? cor('doce') : cor('jogador'),
            tamanho: 7 + (k % 3) * 2,
            estoura: false,
            forma: 'estrela',
            giro: 6,
            apaga: true,
          });
        }
      };
      if (!this.saltosVistos.has(carga.id)) {
        this.saltosVistos.add(carga.id);
        solta(salto.decolagem, estouro.velocidadePxPorS * 0.6);
      }
      this.soltar(`salto${carga.id}`, salto.estrelasPorS * dtS, () => solta(1, 10));
    }
    if (this.saltosVistos.size > 32) this.saltosVistos.clear();
  }

  /** Pedaços do material saltando do objeto (lascas no golpe, pedaços maiores ao quebrar). */
  private pedacos(pos: V2, material: string, n: number, forca: number): void {
    const cfg = visual.combateNaTela.quebraveis;
    const cores = cfg.cores[material] ?? [visual.paleta.topo];
    const v0 = visual.combateNaTela.feiticos.estouro.velocidadePxPorS * forca;
    for (let i = 0; i < n; i++) {
      const k = this.soltas++;
      const d = direcaoDaFaisca(i, n, k);
      const v = v0 * (0.55 + (k % 3) * 0.2);
      this.particulas.push({
        chao: { ...pos },
        desvio: { x: 0, y: 0 },
        vel: { x: d.x * v, y: d.y * v * 0.5 - v * 0.4 },
        alturaIni: 10 * forca,
        vida: 380 + (k % 4) * 60,
        total: 380 + (k % 4) * 60,
        cor: corNumerica(cores[k % cores.length]!),
        tamanho: cfg.pedacoPx * (forca < 1 ? 0.6 : 1) * (0.7 + (k % 3) * 0.2),
        estoura: false,
      });
    }
  }

  /** Gotas do jato do hidrante: sobem do chão e somem. */
  private gotas(centro: V2): void {
    const cores = [visual.paleta.luz, visual.paleta.piso.faixa];
    for (let i = 0; i < 8; i++) {
      const k = this.soltas++;
      const d = direcaoDaFaisca(i, 8, k);
      this.particulas.push({
        chao: { x: centro.x + d.x * 0.2, y: centro.y + d.y * 0.2 },
        desvio: { x: 0, y: 0 },
        vel: { x: d.x * 70, y: -120 - (k % 4) * 25 },
        alturaIni: 4,
        vida: 420,
        total: 420,
        cor: corNumerica(cores[k % cores.length]!),
        tamanho: 3,
        estoura: false,
        apaga: true,
      });
    }
  }

  /** O chão eletrificado (raios curtos piscando) e o aviso da abóbora gigante (enche até explodir). */
  private desenharArmas(dtS: number): void {
    const k = cor('doce');
    this.eletricos = this.eletricos.filter((e) => {
      e.vida -= dtS;
      if (e.vida <= 0) return false;
      const pts = noChao(this.circulo(e.centro, e.raio), this.iso);
      this.preencher(this.chao, pts, k, 0.1 + 0.06 * Math.sin(this.relogioS * 30));
      this.contornar(this.chao, pts, k, 0.5 * (e.vida / e.total));
      // Raios em zigue-zague que mudam a cada 1/15 s.
      const quadro = Math.floor(this.relogioS * 15);
      for (let r = 0; r < 4; r++) {
        let p = pontoEspalhado(e.centro, e.raio * 0.8, quadro * 4 + r);
        let s = this.tela(p, 0);
        for (let seg = 0; seg < 3; seg++) {
          const d = direcaoDaFaisca(seg + r, 5, quadro + seg);
          p = { x: p.x + d.x * 0.35, y: p.y + d.y * 0.35 };
          const s2 = this.tela(p, 0);
          this.chao.lineStyle(2, k, 0.9).lineBetween(s.x, s.y, s2.x, s2.y);
          s = s2;
        }
      }
      return true;
    });
    this.avisosDeExplosao = this.avisosDeExplosao.filter((a) => {
      const laranja = a.inimigo ? cor('perigo') : cor('jogador');
      a.vida -= dtS;
      if (a.vida <= 0) return false;
      const t = 1 - a.vida / a.total;
      const borda = noChao(this.circulo(a.centro, a.raio), this.iso);
      this.contornar(this.chao, borda, laranja, 0.9);
      this.preencher(this.chao, borda, laranja, 0.12);
      this.preencher(
        this.chao,
        noChao(this.circulo(a.centro, a.raio * t), this.iso),
        laranja,
        0.35,
      );
      return true;
    });
  }

  /** Estrelinha que pisca acima dos objetos quebráveis perto do jogador: "dá para quebrar". */
  private brilhoDosQuebraveis(mundo: Mundo, jogador: number): void {
    const heroi = mundo.entidades.find((e) => e.id === jogador);
    if (!heroi) return;
    const { brilho } = visual.combateNaTela.quebraveis;
    const raio = exploracao.quebraveis.raioBrilho;
    for (const e of mundo.entidades) {
      if (!e.marcas?.quebravel || !e.combate || e.combate.coragem <= 0) continue;
      if (Math.hypot(e.pos.x - heroi.pos.x, e.pos.y - heroi.pos.y) > raio) continue;
      const fase = ((this.relogioS * 1000 + e.id * 137) % brilho.periodoMs) / brilho.periodoMs;
      const pulso = 0.5 + 0.5 * Math.sin(fase * Math.PI * 2);
      const s = this.tela(e.pos, brilho.alturaPx);
      const r = brilho.raioPx * (0.7 + 0.5 * pulso);
      this.noAr
        .fillStyle(cor('doce'), brilho.alfa * (0.35 + 0.65 * pulso))
        .fillPoints(pontos(estrela(s.x, s.y, r, fase * Math.PI)), true);
    }
  }

  private desenharQueimados(dtS: number): void {
    const { chuva } = visual.combateNaTela.feiticos;
    const k = corNumerica(visual.paleta.borracha);
    this.queimados = this.queimados.filter((m) => {
      m.vida -= dtS;
      if (m.vida <= 0) return false;
      const pts = noChao(this.circulo(m.centro, m.raio), this.iso);
      this.preencher(this.chao, pts, k, chuva.queimadoAlfa * (m.vida / m.total));
      return true;
    });
  }

  private desenharRastros(h: EstadoHabilidades): void {
    for (const r of h.rastros) {
      const d = { x: r.b.x - r.a.x, y: r.b.y - r.a.y };
      const n = Math.hypot(d.x, d.y) || 1;
      const pts = noChao(faixa(r.a, { x: d.x / n, y: d.y / n }, n, r.largura / 2), this.iso);
      this.preencher(this.chao, pts, cor('jogador'), 0.35);
    }
  }

  private desenharProjeteis(h: EstadoHabilidades, alfa: number, dtS: number): void {
    const { projetil } = visual.combateNaTela;
    const vivos = new Set<number>();
    for (const p of h.projeteis) {
      vivos.add(p.id);
      let g = this.projeteis.get(p.id);
      if (!g) {
        g = this.cena.add.graphics();
        this.projeteis.set(p.id, g);
      }
      const pos = {
        x: p.posAnterior.x + (p.pos.x - p.posAnterior.x) * alfa,
        y: p.posAnterior.y + (p.pos.y - p.posAnterior.y) * alfa,
      };
      g.clear().setDepth(pos.x + pos.y + 0.5);
      const k =
        p.lado === 'jogador'
          ? cor(p.def.cor)
          : p.chave === 'tiro_poste'
            ? cor('magia')
            : cor('perigo');
      if (p.chave === 'auto' && p.lado === 'jogador') {
        this.estrelaDoGolpe(g, p.id, pos, p.dir, k);
        continue;
      }
      if (p.lado === 'jogador' && p.def.id.startsWith('bruxinha_q')) {
        this.vassoura(g, p.id, pos, p.dir, dtS);
        continue;
      }
      if (p.chave === 'auto' || p.lado !== 'jogador') {
        // Bolinha (auto-ataque, ovo, tiro do Poste): quadrado no ar com sombra no chão.
        const s = this.tela(pos, projetil.alturaPx);
        const chao = this.tela(pos, 0);
        const lado = p.lado === 'jogador' ? 6 : 8;
        g.fillStyle(0x000000, 0.3).fillEllipse(chao.x, chao.y, lado, lado / 2);
        g.fillStyle(k, 1).fillRect(s.x - lado / 2, s.y - lado / 2, lado, lado);
        continue;
      }
      const tras = {
        x: pos.x - (p.dir.x * projetil.comprimento) / 2,
        y: pos.y - (p.dir.y * projetil.comprimento) / 2,
      };
      // A vassoura: uma faixa chapada no ar, com quadradinhos de rastro atrás.
      const corpo = faixa(tras, p.dir, projetil.comprimento, projetil.largura / 2).map((q) =>
        this.tela(q, projetil.alturaPx),
      );
      this.preencher(g, corpo, k, 1);
      const lado = visual.combateNaTela.particula.tamanhoPx;
      for (let i = 1; i <= projetil.rastro; i++) {
        const q = this.tela(
          {
            x: tras.x - p.dir.x * i * projetil.largura,
            y: tras.y - p.dir.y * i * projetil.largura,
          },
          projetil.alturaPx,
        );
        g.fillStyle(k, 1 - i / (projetil.rastro + 1)).fillRect(
          q.x - lado / 2,
          q.y - lado / 2,
          lado,
          lado,
        );
      }
    }
    for (const [id, g] of this.projeteis) {
      if (vivos.has(id)) continue;
      g.destroy();
      this.projeteis.delete(id);
      this.aSoltar.delete(`folha${id}`);
    }
  }

  /** O golpe da Bruxinha: uma estrela de 4 pontas girando, com rastro curto e sombra. */
  private estrelaDoGolpe(
    g: Phaser.GameObjects.Graphics,
    id: number,
    pos: V2,
    dir: V2,
    k: number,
  ): void {
    const { estrela: cfg } = visual.combateNaTela.feiticos;
    const z = visual.combateNaTela.projetil.alturaPx;
    const chao = this.tela(pos, 0);
    g.fillStyle(0x000000, 0.3).fillEllipse(chao.x, chao.y, cfg.raioPx, cfg.raioPx / 2);
    for (let i = cfg.rastro; i >= 1; i--) {
      const q = this.tela({ x: pos.x - dir.x * i * 0.22, y: pos.y - dir.y * i * 0.22 }, z);
      const r = cfg.raioPx * (1 - i / (cfg.rastro + 1)) * 0.6;
      g.fillStyle(k, 0.6 * (1 - i / (cfg.rastro + 1))).fillRect(q.x - r / 2, q.y - r / 2, r, r);
    }
    const s = this.tela(pos, z);
    const ang = this.relogioS * cfg.giroPorS + id;
    // Halo: um brilho largo e fraco atrás da estrela.
    g.fillStyle(k, 0.25).fillCircle(s.x, s.y, cfg.raioPx * 1.3);
    g.fillStyle(k, 1).fillPoints(pontos(estrela(s.x, s.y, cfg.raioPx, ang)), true);
    g.fillStyle(corNumerica(visual.paleta.luz), 1).fillPoints(
      pontos(estrela(s.x, s.y, cfg.raioPx * 0.45, ang)),
      true,
    );
  }

  /** A Vassoura Disparada: cabo claro, amarração roxa, palha laranja e folhas caindo atrás. */
  private vassoura(
    g: Phaser.GameObjects.Graphics,
    id: number,
    pos: V2,
    dir: V2,
    dtS: number,
  ): void {
    const { vassoura: cfg } = visual.combateNaTela.feiticos;
    const z = visual.combateNaTela.projetil.alturaPx;
    const v = vassouraVoando(pos, dir, cfg);
    const sombra = noChao(v.palha, this.iso);
    this.preencher(g, sombra, 0x000000, 0.25);
    const ar = (q: V2) => this.tela(q, z);
    const [c0, c1] = [ar(v.cabo[0]), ar(v.cabo[1])];
    g.lineStyle(3, corNumerica(visual.paleta.luz), 1).lineBetween(c0.x, c0.y, c1.x, c1.y);
    this.preencher(g, v.palha.map(ar), cor('jogador'), 1);
    const [a0, a1] = [ar(v.amarra[0]), ar(v.amarra[1])];
    g.lineStyle(3, cor('magia'), 1).lineBetween(a0.x, a0.y, a1.x, a1.y);
    // Folhas (laranja e amarelo) que se soltam da palha e caem girando.
    this.soltar(`folha${id}`, cfg.folhasPorS * dtS, () => {
      const k = this.soltas++;
      const atras = v.palha[3]!;
      this.particulas.push({
        chao: { x: atras.x, y: atras.y },
        desvio: { x: ((k % 5) - 2) * 2, y: 0 },
        vel: { x: ((k % 3) - 1) * 18, y: 6 },
        alturaIni: z,
        vida: cfg.folhaMs,
        total: cfg.folhaMs,
        cor: k % 2 === 0 ? cor('doce') : cor('jogador'),
        tamanho: 3,
        estoura: false,
        apaga: true,
      });
    });
  }

  private anel(centro: V2, raio: number, c: number, alfa: number, duracaoMs: number): void {
    const lados = visual.luzNaTela.ladosPoligono;
    const n = 4;
    // Cada anel é desenhado como forma que cresce: guardamos 4 tamanhos que somem em sequência.
    for (let i = 0; i < n; i++) {
      const r = raio * (0.4 + (0.6 * (i + 1)) / n);
      this.formas.push({
        pts: poligonoDeLuz(centro.x, centro.y, r, lados),
        vida: duracaoMs * ((i + 1) / n),
        total: duracaoMs * ((i + 1) / n),
        cor: c,
        alfa: alfa / n + (i === n - 1 ? alfa / 2 : 0),
      });
    }
  }

  private desenharFormas(dtS: number): void {
    this.formas = this.formas.filter((f) => {
      f.vida -= dtS * 1000;
      if (f.vida <= 0) return false;
      const t = f.vida / f.total;
      const pts = noChao(f.pts, this.iso);
      this.preencher(this.chao, pts, f.cor, f.alfa * t);
      this.contornar(this.chao, pts, f.cor, Math.min(1, f.alfa * 2) * t);
      return true;
    });
  }

  /** Poeira de um passo: dois quadradinhos do tom da calçada que sobem um pouco e somem. */
  poeira(pos: V2): void {
    const { poeira } = visual.animacao;
    for (let i = 0; i < 2; i++) {
      const lado = i === 0 ? -1 : 1;
      this.particulas.push({
        chao: { ...pos },
        desvio: { x: lado * 3, y: 0 },
        vel: { x: lado * poeira.velocidadePxPorS, y: -poeira.velocidadePxPorS * 0.6 },
        alturaIni: 0,
        vida: poeira.duracaoMs,
        total: poeira.duracaoMs,
        cor: corNumerica(visual.paleta.piso.calcada),
        tamanho: poeira.tamanhoPx,
        estoura: false,
      });
    }
  }

  /** Quadradinhos que saltam de um ponto do chão e somem. */
  private espalhar(centro: V2, c: number, n: number): void {
    const { particula } = visual.combateNaTela;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + n;
      this.particulas.push({
        chao: { ...centro },
        desvio: { x: 0, y: 0 },
        vel: {
          x: Math.cos(ang) * particula.velocidadePxPorS,
          y: Math.sin(ang) * particula.velocidadePxPorS * 0.5 - particula.velocidadePxPorS * 0.5,
        },
        alturaIni: 0,
        vida: particula.duracaoMs,
        total: particula.duracaoMs,
        cor: c,
        tamanho: particula.tamanhoPx,
        estoura: false,
      });
    }
  }

  /** Cada onda do R: abóboras (quadrados laranja) caem em pontos espalhados da área. */
  private chuvaDeAboboras(centro: V2, raio: number): void {
    const { abobora } = visual.combateNaTela;
    const onda = this.ondasDeAbobora++;
    for (let i = 0; i < abobora.porOnda; i++) {
      const k = i + onda * abobora.porOnda;
      const r = raio * Math.sqrt((i + 0.5) / abobora.porOnda);
      const ang = k * ANGULO_DE_OURO;
      this.particulas.push({
        chao: { x: centro.x + Math.cos(ang) * r, y: centro.y + Math.sin(ang) * r },
        desvio: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        alturaIni: abobora.quedaAlturaPx,
        vida: abobora.duracaoMs,
        total: abobora.duracaoMs,
        cor: cor('jogador'),
        tamanho: abobora.tamanhoPx,
        estoura: true,
        abobora: { raio: raio / abobora.porOnda + 0.25 },
      });
    }
    this.anel(
      centro,
      raio,
      cor('jogador'),
      visual.combateNaTela.explosao.alfa,
      abobora.duracaoMs * 1.5,
    );
  }

  private desenharParticulas(dtS: number): void {
    const vivas: Particula[] = [];
    for (const p of this.particulas) {
      p.vida -= dtS * 1000;
      if (p.vida <= 0) {
        if (p.abobora) this.aboboraCaiu(p.chao, p.abobora.raio);
        else if (p.estoura) this.espalhar(p.chao, p.cor, 4);
        continue;
      }
      vivas.push(p);
      const t = 1 - p.vida / p.total;
      p.desvio = { x: p.desvio.x + p.vel.x * dtS, y: p.desvio.y + p.vel.y * dtS };
      const z = p.alturaIni * (1 - t * t);
      const s = this.tela(p.chao, z);
      const x = s.x + p.desvio.x;
      const y = s.y + p.desvio.y;
      const alfa = p.alturaIni > 0 && !p.apaga ? 1 : 1 - t;
      if (p.abobora) {
        // A sombra cresce no chão até a abóbora chegar; a abóbora tem um cabinho verde.
        const chao = this.tela(p.chao, 0);
        const lado = p.tamanho * (0.6 + t);
        this.chao.fillStyle(0x000000, 0.15 + 0.3 * t).fillEllipse(chao.x, chao.y, lado * 1.6, lado);
        this.noAr
          .fillStyle(p.cor, 1)
          .fillRect(x - p.tamanho / 2, y - p.tamanho / 2, p.tamanho, p.tamanho);
        this.noAr.fillStyle(cor('fantasma'), 1).fillRect(x - 1, y - p.tamanho / 2 - 3, 2, 3);
        continue;
      }
      if (p.forma === 'estrela') {
        const ang = this.relogioS * (p.giro ?? 0);
        this.noAr
          .fillStyle(p.cor, alfa)
          .fillPoints(pontos(estrela(x, y, p.tamanho / 2, ang)), true);
        continue;
      }
      if (p.forma === 'bolha') {
        this.noAr.lineStyle(1, p.cor, 0.9 * alfa).strokeCircle(x, y, p.tamanho / 2);
        this.noAr.fillStyle(p.cor, 0.25 * alfa).fillCircle(x, y, p.tamanho / 2);
        continue;
      }
      this.noAr
        .fillStyle(p.cor, alfa)
        .fillRect(x - p.tamanho / 2, y - p.tamanho / 2, p.tamanho, p.tamanho);
    }
    this.particulas = vivas;
  }

  /** A abóbora da Chuva cai: sementes claras saltam e o chão fica queimado um tempo. */
  private aboboraCaiu(pos: V2, raio: number): void {
    const { chuva } = visual.combateNaTela.feiticos;
    this.espalhar(pos, cor('jogador'), 4);
    this.espalhar(pos, corNumerica(visual.paleta.luz), chuva.sementes);
    this.queimados.push({
      centro: { ...pos },
      raio,
      vida: chuva.queimadoS,
      total: chuva.queimadoS,
    });
  }

  mostrarNumero(pos: V2, texto: string, corTexto: string, escala = 1): void {
    const { numeroDano } = visual.combateNaTela;
    const base = this.tela(pos, numeroDano.acimaPx);
    // Números próximos não se cobrem: cada um sai um pouco para o lado.
    base.x += ((this.numeros.length * 7) % 21) - 10;
    // Fonte pixel (GDD): 2 × para o dano comum, 3 × para críticos e números maiores.
    const pixels = Math.max(1, Math.round((numeroDano.fontePx * escala) / LARGURA_CELULA));
    const t = (
      this.numerosGuardados.pop() ?? this.cena.add.bitmapText(0, 0, FONTE_PIXEL, '', LARGURA_CELULA)
    )
      .setText(paraFontePixel(texto))
      .setFontSize(LARGURA_CELULA * pixels)
      .setPosition(base.x, base.y)
      .setAlpha(1)
      .setVisible(true)
      .setTint(Number.parseInt(corTexto.slice(1), 16))
      .setDropShadow(1, 1, 0x000000, 1)
      .setOrigin(0.5, 1)
      .setDepth(PROFUNDIDADE_NUMEROS);
    this.numeros.push({ texto: t, base, vida: numeroDano.duracaoMs, total: numeroDano.duracaoMs });
  }

  private animarNumeros(dtS: number): void {
    const { numeroDano } = visual.combateNaTela;
    let quantidade = 0;
    for (const n of this.numeros) {
      n.vida -= dtS * 1000;
      if (n.vida <= 0) {
        n.texto.setVisible(false);
        this.numerosGuardados.push(n.texto);
        continue;
      }
      const t = 1 - n.vida / n.total;
      n.texto.setPosition(n.base.x, n.base.y - numeroDano.subidaPx * t).setAlpha(1 - t * t);
      this.numeros[quantidade++] = n;
    }
    this.numeros.length = quantidade;
  }
}

/** Quadrado no chão com meio lado `r` em volta de `c` (Vistoria do Síndico). */
function quadrado(c: V2, r: number): V2[] {
  return [
    { x: c.x - r, y: c.y - r },
    { x: c.x + r, y: c.y - r },
    { x: c.x + r, y: c.y + r },
    { x: c.x - r, y: c.y + r },
  ];
}
