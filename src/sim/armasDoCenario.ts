import {
  alvosDeGolpe,
  aplicarEstado,
  causarDano,
  combatenteInimigo,
  vivo,
  type ConfigEstados,
} from './combate';
import type { Combate, ConfigExploracao, Modelos, Rua } from './content/esquemas';
import type { PortaoDeQuintal } from './gerador';
import { posicionador, type V2 } from './geometria';
import {
  adicionarEntidade,
  adicionarObstaculo,
  forcarMovimento,
  removerObstaculo,
  type Entidade,
  type Mundo,
} from './mundo';

// Armas do cenário (docs/PLANO_MUNDO_VIVO.md, frente 1): o cenário muda a luta quando o jogador
// usa a cabeça. O carro toca o alarme e atrai os inimigos; o poste aceso derruba o fio e
// eletrifica o chão; o hidrante quebrado solta um jato que empurra; a abóbora gigante quebrada
// explode depois de um aviso; o portão do quintal só abre no golpe forte.

export type ConfigArmas = ConfigExploracao['armas'];

/** O que as armas pedem às regras da rua. */
export interface ServicosArmas {
  /** Fecha ou abre a grade dos caminhos (o campo de fluxo) num retângulo. */
  bloquearCaminho(area: PortaoDeQuintal['area'], fechado: boolean): void;
}

interface Pulso {
  centro: V2;
  ate: number;
  proximo: number;
}

/** Até onde o golpe do jogador "vê" um objeto interativo que não quebra. */
const CORAGEM_INTERATIVO = 1e6;

export class ArmasDoCenario {
  private alarmes: (Pulso & { isca: number })[] = [];
  private fios: Pulso[] = [];
  private jatos: Pulso[] = [];
  private explosoes: { centro: V2; em: number }[] = [];
  private readonly portoes = new Map<string, PortaoDeQuintal>();

  constructor(
    private readonly cfg: ConfigArmas,
    private readonly combate: Combate,
    private readonly estados: ConfigEstados,
    private readonly heroi: () => Entidade,
    private readonly servicos: ServicosArmas,
  ) {}

  /** Carros e postes acesos viram interativos (levam golpe, não quebram) e os portões fecham. */
  iniciar(mundo: Mundo, rua: Rua, modelos: Modelos, portoes: readonly PortaoDeQuintal[]): void {
    rua.objetos.forEach((o, i) => {
      const alarme = this.cfg.alarme.modelos.includes(o.modelo);
      const fio =
        this.cfg.fio.modelos.includes(o.modelo) && (!('estado' in o) || o.estado === 'amigo');
      if ((!alarme && !fio) || o.grupo) return;
      const { pegada } = modelos[o.modelo];
      const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
      adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: o.modelo,
        pos: ponto({ x: pegada.largura / 2, y: pegada.profundidade / 2 }),
        raio: alarme ? this.cfg.alarme.raioCorpo : this.cfg.fio.raioCorpo,
        velocidade: 0,
        solido: false,
        combate: combatenteInimigo({ coragem: CORAGEM_INTERATIVO, resistencia: 0 }, this.combate),
        marcas: {
          quebravel: true,
          interativo: alarme ? 'alarme' : 'fio',
          objeto: i,
          material: 'metal',
          prontoEm: 0,
        },
      });
    });
    for (const p of portoes) {
      this.portoes.set(p.grupo, p);
      adicionarObstaculo(mundo, p.area);
      this.servicos.bloquearCaminho(p.area, true);
      adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: 'portao_quintal',
        pos: { x: (p.area.x0 + p.area.x1) / 2, y: (p.area.y0 + p.area.y1) / 2 },
        raio: this.cfg.portao.raioCorpo,
        velocidade: 0,
        solido: false,
        combate: combatenteInimigo(
          { coragem: this.cfg.portao.coragem, resistencia: 0 },
          this.combate,
        ),
        marcas: { quebravel: true, soForte: true, grupo: p.grupo, objeto: -1, material: 'madeira' },
      });
    }
  }

  /** Um golpe num interativo (carro, poste): ele não quebra, e dispara se estiver pronto. */
  atingido(mundo: Mundo, e: Entidade): void {
    const tipo = e.marcas?.interativo;
    if (!tipo || !e.combate) return;
    e.combate.coragem = e.combate.attr.coragemMax;
    if (Number(e.marcas?.prontoEm ?? 0) > mundo.tick) return;
    if (tipo === 'alarme') {
      const c = this.cfg.alarme;
      e.marcas = { ...e.marcas, prontoEm: mundo.tick + Math.round(c.recargaS / mundo.dt) };
      const ate = mundo.tick + Math.round(c.duracaoS / mundo.dt);
      // O alarme é uma isca que não aparece: os inimigos perto correm para o carro.
      const isca = adicionarEntidade(mundo, {
        tipo: 'jogador',
        especie: 'alarme',
        pos: { ...e.pos },
        raio: 0.3,
        velocidade: 0,
        solido: false,
        combate: combatenteInimigo({ coragem: 1e6, resistencia: 1e6 }, this.combate),
        marcas: { isca: true, ate, semDesenho: true },
      });
      isca.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
      this.alarmes.push({ centro: { ...e.pos }, ate, proximo: mundo.tick, isca: isca.id });
      mundo.eventos.push({ tipo: 'aviso', texto: 'Alarme! Os inimigos correm para o carro.' });
    } else if (tipo === 'fio') {
      const c = this.cfg.fio;
      e.marcas = { ...e.marcas, prontoEm: mundo.tick + Math.round(c.recargaS / mundo.dt) };
      this.fios.push({
        centro: { ...e.pos },
        ate: mundo.tick + Math.round(c.duracaoS / mundo.dt),
        proximo: mundo.tick,
      });
      mundo.eventos.push({
        tipo: 'fioCaiu',
        centro: { ...e.pos },
        raio: c.raio,
        duracaoS: c.duracaoS,
      });
    }
  }

  /** Um quebrável com efeito quebrou: o jato do hidrante ou a explosão da abóbora gigante. */
  quebrou(mundo: Mundo, e: Entidade, efeito: string | undefined): void {
    if (efeito === 'jato') {
      this.jatos.push({
        centro: { ...e.pos },
        ate: mundo.tick + Math.round(this.cfg.jato.duracaoS / mundo.dt),
        proximo: mundo.tick,
      });
    } else if (efeito === 'explosao') {
      const c = this.cfg.explosao;
      this.explosoes.push({
        centro: { ...e.pos },
        em: mundo.tick + Math.round(c.avisoS / mundo.dt),
      });
      mundo.eventos.push({
        tipo: 'avisoExplosao',
        lado: 'jogador',
        centro: { ...e.pos },
        raio: c.raio,
        segundos: c.avisoS,
      });
    }
    const grupo = e.marcas?.grupo;
    if (typeof grupo === 'string') {
      const p = this.portoes.get(grupo);
      if (p) {
        removerObstaculo(mundo, p.area);
        this.servicos.bloquearCaminho(p.area, false);
        this.portoes.delete(grupo);
        mundo.eventos.push({ tipo: 'aviso', texto: 'O portão abriu!' });
      }
    }
  }

  tick(mundo: Mundo): void {
    const t = mundo.tick;
    const pulsar = (lista: Pulso[], intervaloS: number, fazer: (p: Pulso) => void): Pulso[] =>
      lista.filter((p) => {
        if (p.ate < t) return false;
        if (p.proximo <= t) {
          p.proximo = t + Math.round(intervaloS / mundo.dt);
          fazer(p);
        }
        return true;
      });
    this.alarmes = this.alarmes.filter((a) => a.ate >= t);
    for (const a of this.alarmes) {
      if (a.proximo > t) continue;
      a.proximo = t + Math.round(1 / mundo.dt);
      mundo.eventos.push({ tipo: 'alarmeCarro', pos: { ...a.centro } });
    }
    const fio = this.cfg.fio;
    this.fios = pulsar(this.fios, fio.intervaloS, (p) => {
      mundo.eventos.push({ tipo: 'faisca', centro: { ...p.centro }, raio: fio.raio });
      for (const o of this.inimigosPerto(mundo, p.centro, fio.raio)) {
        causarDano(mundo, o, {
          origem: this.heroi().id,
          bruto: fio.danoPorPulso,
          tipo: 'explosao',
          fonte: 'fio',
        });
        aplicarEstado(
          o,
          { tipo: 'lentidao', valor: fio.lentidao, restante: fio.intervaloS + 0.1 },
          this.estados,
        );
      }
    });
    const jato = this.cfg.jato;
    this.jatos = pulsar(this.jatos, jato.intervaloS, (p) => {
      mundo.eventos.push({ tipo: 'jato', centro: { ...p.centro }, raio: jato.raio });
      for (const o of this.inimigosPerto(mundo, p.centro, jato.raio)) {
        const d = Math.hypot(o.pos.x - p.centro.x, o.pos.y - p.centro.y) || 1;
        if (o.combate?.chefe) continue;
        forcarMovimento(
          o,
          { x: (o.pos.x - p.centro.x) / d, y: (o.pos.y - p.centro.y) / d },
          jato.empurrao,
          jato.empurrao * 8,
          false,
        );
      }
    });
    const exp = this.cfg.explosao;
    const prontas = this.explosoes.filter((x) => x.em <= t);
    this.explosoes = this.explosoes.filter((x) => x.em > t);
    for (const x of prontas) {
      mundo.eventos.push({ tipo: 'explosaoAbobora', centro: { ...x.centro }, raio: exp.raio });
      // Pega inimigos e também outros objetos (uma abóbora pode estourar a vizinha).
      for (const o of alvosDeGolpe(mundo, 'jogador')) {
        if (Math.hypot(o.pos.x - x.centro.x, o.pos.y - x.centro.y) > exp.raio + o.raio) continue;
        if (o.marcas?.interativo) continue;
        causarDano(mundo, o, {
          origem: this.heroi().id,
          bruto: exp.dano,
          tipo: 'explosao',
          fonte: 'abobora_gigante',
        });
      }
    }
  }

  private inimigosPerto(mundo: Mundo, c: V2, raio: number): Entidade[] {
    return mundo.entidades.filter(
      (o) =>
        o.tipo === 'inimigo' &&
        vivo(o) &&
        Math.hypot(o.pos.x - c.x, o.pos.y - c.y) <= raio + o.raio,
    );
  }
}
