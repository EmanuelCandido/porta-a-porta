import { vivo } from './combate';
import type { ConfigExploracao, Rua } from './content/esquemas';
import type { FimDeBeco, FimDeBecoGerado } from './gerador';
import type { Retangulo, V2 } from './geometria';
import type { Entidade, IdEntidade as Id, Mundo } from './mundo';

// Fins de beco com desafio (docs/PLANO_MUNDO_VIVO.md, frente 1): o Poço dos Desejos troca doces por
// um consumível, o Quintal das Velas pede as 3 velas acesas antes que as pestinhas apaguem e a Casa
// Assombrada solta ondas curtas e, vencidas, um baú. Tudo pelo gerador da simulação.

type ConfigFins = ConfigExploracao['fins'];

/** O que os fins de beco pedem às regras da rua. */
export interface ServicosFins {
  soltarDoces(mundo: Mundo, pos: V2, base: number): void;
  /** Põe um consumível no bolso; false se não coube. */
  darConsumivel(id: string): boolean;
  nascerPestinha(mundo: Mundo, pos: V2): Id;
  adicionarBau(mundo: Mundo, pos: V2, doces: number): void;
  livreMaisPerto(p: V2): V2;
  /** Doces no bolso, e pagar com eles. */
  doces(): number;
  pagar(valor: number): void;
  /** Consumíveis que o poço pode dar. */
  itens: readonly string[];
}

export interface Vela {
  pos: V2;
  objeto: number;
  acesa: boolean;
}

export interface EstadoFim {
  tipo: FimDeBeco;
  centro: V2;
  area: Retangulo;
  vencido: boolean;
  /** Poço: já atendeu o desejo. */
  usado: boolean;
  velas: Vela[];
  /** Velas: tick em que o tempo acaba (null: desafio parado). */
  ate: number | null;
  /** Velas: as pestinhas já foram chamadas. */
  chamou: boolean;
  /** Casa assombrada: onda atual (-1: ninguém entrou ainda) e quem está de pé nela. */
  onda: number;
  ids: Id[];
}

export type AlvoDoFim = { fim: number; vela: number | null };

/** Espaço entre as pestinhas que nascem num fim de beco. */
const ESPALHAR = 1.4;

export class FinsDeBeco {
  readonly fins: EstadoFim[];

  constructor(
    rua: Rua,
    gerados: readonly FimDeBecoGerado[],
    private readonly cfg: ConfigFins,
    private readonly servicos: ServicosFins,
  ) {
    this.fins = gerados.map((f) => ({
      tipo: f.tipo,
      centro: { ...f.centro },
      area: { ...f.area },
      vencido: false,
      usado: false,
      velas:
        f.tipo === 'velas'
          ? f.objetos.map((objeto) => {
              const o = rua.objetos[objeto]!;
              return { pos: { x: o.x + 0.5, y: o.y + 0.5 }, objeto, acesa: false };
            })
          : [],
      ate: null,
      chamou: false,
      onda: -1,
      ids: [],
    }));
  }

  /** Quantos doces o Poço dos Desejos pede. */
  get precoDoPoco(): number {
    return this.cfg.poco.preco;
  }

  /** O que dá para fazer com F aqui (para a dica na tela). */
  pertoDe(p: V2): AlvoDoFim | null {
    const r = this.cfg.raioInteracao;
    let melhor: AlvoDoFim | null = null;
    let d0 = r;
    const ver = (alvo: AlvoDoFim, q: V2) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= d0) {
        d0 = d;
        melhor = alvo;
      }
    };
    this.fins.forEach((f, i) => {
      if (f.vencido) return;
      if (f.tipo === 'poco' && !f.usado) ver({ fim: i, vela: null }, f.centro);
      if (f.tipo === 'velas')
        f.velas.forEach((v, k) => !v.acesa && ver({ fim: i, vela: k }, v.pos));
    });
    return melhor;
  }

  /** F perto do poço ou de uma vela apagada. */
  interagir(mundo: Mundo, heroi: Entidade): boolean {
    const alvo = this.pertoDe(heroi.pos);
    if (!alvo) return false;
    const f = this.fins[alvo.fim]!;
    if (f.tipo === 'poco') this.desejar(mundo, f);
    else if (alvo.vela !== null) this.acender(mundo, f, alvo.vela);
    return true;
  }

  private desejar(mundo: Mundo, f: EstadoFim): void {
    const preco = this.cfg.poco.preco;
    if (this.servicos.doces() < preco) {
      mundo.eventos.push({ tipo: 'aviso', texto: `O poço pede ${preco} doces.` });
      return;
    }
    const itens = this.servicos.itens;
    const id = itens[mundo.rng.inteiro(0, itens.length - 1)];
    if (!id || !this.servicos.darConsumivel(id)) {
      mundo.eventos.push({
        tipo: 'aviso',
        texto: 'Bolso cheio: o poço não tem onde pôr o desejo.',
      });
      return;
    }
    this.servicos.pagar(preco);
    f.usado = true;
    f.vencido = true;
    mundo.eventos.push({ tipo: 'desejo', pos: { ...f.centro }, item: id, preco });
  }

  private acender(mundo: Mundo, f: EstadoFim, k: number): void {
    const v = f.velas[k]!;
    v.acesa = true;
    mundo.eventos.push({ tipo: 'vela', objeto: v.objeto, acesa: true, pos: { ...v.pos } });
    const cfg = this.cfg.velas;
    if (f.ate === null) {
      f.ate = mundo.tick + Math.round(cfg.tempoS / mundo.dt);
      mundo.eventos.push({
        tipo: 'aviso',
        texto: `Acenda as ${f.velas.length} velas em ${cfg.tempoS} s!`,
      });
      if (!f.chamou) {
        f.chamou = true;
        this.chamar(mundo, f.centro, cfg.pestinhas);
      }
    }
    if (f.velas.every((x) => x.acesa)) {
      f.vencido = true;
      f.ate = null;
      this.servicos.soltarDoces(mundo, f.centro, cfg.doces);
      mundo.eventos.push({ tipo: 'ganhouXp', valor: cfg.xp, motivo: 'desafio' });
      mundo.eventos.push({ tipo: 'desafioVencido', desafio: 'velas', pos: { ...f.centro } });
    }
  }

  /** Pestinhas em volta de um ponto, sem nascer dentro de nada. */
  private chamar(mundo: Mundo, c: V2, n: number): Id[] {
    const ids: Id[] = [];
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const pos = this.servicos.livreMaisPerto({
        x: c.x + Math.cos(ang) * ESPALHAR,
        y: c.y + Math.sin(ang) * ESPALHAR,
      });
      ids.push(this.servicos.nascerPestinha(mundo, pos));
    }
    return ids;
  }

  /** Uma vez por tick, antes do movimento. */
  tick(mundo: Mundo, heroi: Entidade): void {
    for (const f of this.fins) {
      if (f.vencido) continue;
      if (f.tipo === 'velas') this.velasNoTick(mundo, f);
      else if (f.tipo === 'assombrada') this.casaNoTick(mundo, f, heroi);
    }
  }

  private velasNoTick(mundo: Mundo, f: EstadoFim): void {
    if (f.ate === null) return;
    const raio = this.cfg.velas.raioApagar;
    // Inimigo encostado numa vela acesa a apaga.
    for (const v of f.velas) {
      if (!v.acesa) continue;
      const apagou = mundo.entidades.some(
        (e) =>
          e.tipo === 'inimigo' &&
          vivo(e) &&
          Math.hypot(e.pos.x - v.pos.x, e.pos.y - v.pos.y) <= raio + e.raio,
      );
      if (!apagou) continue;
      v.acesa = false;
      mundo.eventos.push({ tipo: 'vela', objeto: v.objeto, acesa: false, pos: { ...v.pos } });
    }
    if (mundo.tick < f.ate) return;
    // O tempo acabou: as velas apagam e o desafio recomeça no próximo F.
    f.ate = null;
    for (const v of f.velas) {
      if (!v.acesa) continue;
      v.acesa = false;
      mundo.eventos.push({ tipo: 'vela', objeto: v.objeto, acesa: false, pos: { ...v.pos } });
    }
    mundo.eventos.push({ tipo: 'aviso', texto: 'As velas apagaram. F para tentar de novo.' });
  }

  private casaNoTick(mundo: Mundo, f: EstadoFim, heroi: Entidade): void {
    const ondas = this.cfg.assombrada.ondas;
    if (f.onda < 0) {
      const p = heroi.pos;
      if (p.x < f.area.x0 || p.x > f.area.x1 || p.y < f.area.y0 || p.y > f.area.y1) return;
      f.onda = 0;
      f.ids = this.chamar(mundo, f.centro, ondas[0]!);
      mundo.eventos.push({ tipo: 'aviso', texto: 'A casa assombrada acordou!' });
      return;
    }
    const dePe = f.ids.some((id) => {
      const e = mundo.entidades.find((x) => x.id === id);
      return !!e && vivo(e);
    });
    if (dePe) return;
    f.onda++;
    if (f.onda < ondas.length) {
      f.ids = this.chamar(mundo, f.centro, ondas[f.onda]!);
      return;
    }
    f.vencido = true;
    f.ids = [];
    this.servicos.adicionarBau(
      mundo,
      this.servicos.livreMaisPerto(f.centro),
      this.cfg.assombrada.doces,
    );
    mundo.eventos.push({ tipo: 'desafioVencido', desafio: 'assombrada', pos: { ...f.centro } });
  }
}
