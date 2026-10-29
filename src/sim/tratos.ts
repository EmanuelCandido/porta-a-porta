import {
  aplicarEstado,
  causarDano,
  curar,
  definirModificadores,
  vivo,
  type Modificador,
} from './combate';
import type { Combate, EfeitoDeRun, Habilidade } from './content/esquemas';
import type { Evento } from './eventos';
import type { V2 } from './geometria';
import type { Executor } from './habilidades';
import type { MapaDeLuz } from './luz';
import { forcarMovimento, type Entidade, type Mundo, type Sistema } from './mundo';
import type { RegrasDaRua } from './regrasDaRua';

type Efeito<T extends EfeitoDeRun['tipo']> = Extract<EfeitoDeRun, { tipo: T }>;

/** O que os tratos precisam da rua para agir durante a luta. */
export interface ContextoTratos {
  /** Efeitos de tratos, Conjuntos, preços e itens ativos na run. */
  efeitos: readonly EfeitoDeRun[];
  heroi: Entidade;
  luz: MapaDeLuz;
  executor: Executor;
  regras: RegrasDaRua;
  habilidades: ReadonlyMap<string, Habilidade>;
  combate: Combate;
  /** Atributo que escala o dano do campeão (pulso do Farol). */
  atributoPrincipal: 'forca' | 'feitico';
}

/** Estado dos tratos numa rua (para a interface e os testes). */
export interface EstadoTratos {
  naSombra: boolean;
  espantalhoUsado: boolean;
  /** Habilidades lançadas na rua, para o Coro (toda 3ª se repete). */
  lancadas: number;
  ecos: number;
  explosoes: number;
  /** Tick da última Q gratuita da Coroa de Abóbora (uma por tick). */
  coroaNoTick: number;
}

const DO = <T extends EfeitoDeRun['tipo']>(efeitos: readonly EfeitoDeRun[], tipo: T) =>
  efeitos.filter((e): e is Efeito<T> => e.tipo === tipo);

/**
 * Os tratos que agem na luta (GDD e GAMEPLAY.md, "Builds"): bônus na sombra, Fome de Doce, Gato no
 * Telhado, Espantalho, Eco e Coro, Sino da Igreja, Disco Riscado, pulsos que curam ou machucam,
 * explosões de abóbora com chamas, luz e encadeamento, e o escudo do Segundo Fôlego. Os bônus fixos
 * (atributos, preços) a run já pôs na ficha; aqui fica só o que depende do que acontece na rua.
 */
export class TratosNaRua {
  readonly estado: EstadoTratos = {
    naSombra: false,
    espantalhoUsado: false,
    lancadas: 0,
    ecos: 0,
    explosoes: 0,
    coroaNoTick: -1,
  };
  readonly sistema: Sistema;
  private iniciado = false;

  constructor(private readonly ctx: ContextoTratos) {
    this.sistema = {
      antesDeMover: (mundo) => this.antesDeMover(mundo),
      depoisDoTick: (mundo, eventos) => this.depoisDoTick(mundo, eventos),
    };
  }

  private de<T extends EfeitoDeRun['tipo']>(tipo: T): Efeito<T>[] {
    return DO(this.ctx.efeitos, tipo);
  }

  tem(tipo: EfeitoDeRun['tipo']): boolean {
    return this.ctx.efeitos.some((e) => e.tipo === tipo);
  }

  private iniciar(): void {
    this.iniciado = true;
    const j = this.ctx.heroi;
    const c = j.combate!;
    for (const ef of this.de('escudoAoEntrar')) {
      aplicarEstado(
        j,
        {
          tipo: 'escudo',
          valor: c.attr.coragemMax * ef.fracao,
          restante: ef.duracao,
          origem: 'escudoAoEntrar',
        },
        this.ctx.combate.estados,
      );
    }
    if (this.tem('noiteEterna')) j.marcas = { ...j.marcas, noiteEterna: true };
    else if (j.marcas?.noiteEterna) j.marcas = { ...j.marcas, noiteEterna: false };
  }

  private antesDeMover(mundo: Mundo): void {
    if (!this.iniciado) this.iniciar();
    const j = this.ctx.heroi;
    const c = j.combate;
    if (!c || !vivo(j)) return;
    const naSombra = !this.ctx.luz.iluminado(j.pos);

    // Bônus enquanto estiver na sombra (Sombra Amiga, Cortina Pesada, Conjunto Sombra de 2).
    const sombra: Modificador[] = naSombra
      ? this.de('naSombra').map((ef) => ({
          origem: 'run:sombra',
          atributo: ef.atributo,
          mult: ef.mult,
        }))
      : [];
    definirModificadores(c, 'run:sombra', sombra);

    // Fome de Doce: cada 100 doces carregados dão dano, até o máximo.
    const fome = this.de('fomeDeDoce').map((ef): Modificador => ({
      origem: 'run:fome',
      atributo: 'dano',
      mult: Math.min(ef.maximo, Math.floor(this.ctx.regras.bolso.doces / 100) * ef.porCem),
    }));
    definirModificadores(c, 'run:fome', fome);

    // Gato no Telhado: sair da sombra deixa invisível por um instante.
    if (this.estado.naSombra && !naSombra) {
      for (const ef of this.de('saiDaSombraInvisivel')) {
        aplicarEstado(j, { tipo: 'invisivel', restante: ef.duracao }, this.ctx.combate.estados);
      }
    }
    this.estado.naSombra = naSombra;

    // Espantalho: uma vez por rua, com pouca Coragem, explode e empurra todo mundo em volta.
    for (const ef of this.de('espantalho')) {
      if (this.estado.espantalhoUsado || c.coragem / c.attr.coragemMax > ef.limiar) continue;
      this.estado.espantalhoUsado = true;
      for (const e of this.inimigosPerto(mundo, j.pos, ef.raio)) {
        causarDano(mundo, e, { origem: j.id, bruto: ef.dano, tipo: 'explosao' });
        const d = Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) || 1;
        if (vivo(e))
          forcarMovimento(
            e,
            { x: (e.pos.x - j.pos.x) / d, y: (e.pos.y - j.pos.y) / d },
            ef.empurrao,
            10,
            false,
          );
      }
      mundo.eventos.push({ tipo: 'explosaoAbobora', centro: { ...j.pos }, raio: ef.raio });
      mundo.eventos.push({ tipo: 'aviso', texto: 'Espantalho!' });
    }
  }

  private depoisDoTick(mundo: Mundo, eventos: readonly Evento[]): void {
    const j = this.ctx.heroi;
    for (const ev of eventos) {
      switch (ev.tipo) {
        case 'lancou':
          if (ev.id === j.id && !ev.eco) this.aoLancar(mundo, ev.tecla, ev.alvo);
          break;
        case 'acertoAuto':
          if (ev.dono === j.id) this.aoAcertarAuto();
          break;
        case 'pulsoLanterna':
          this.aoPulsar(mundo, ev.pos, ev.raio);
          break;
        case 'derrotado': {
          const e = mundo.entidades.find((x) => x.id === ev.id);
          if (e && e.tipo === 'inimigo' && e.especie !== 'poste_corrompido')
            this.aoDerrotar(mundo, e, ev.por);
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------------ habilidades

  private aoLancar(mundo: Mundo, tecla: string, alvo: V2): void {
    this.estado.lancadas++;
    const j = this.ctx.heroi;
    // Eco: o Q (ou a tecla do trato) se repete depois de um tempo.
    for (const ef of this.de('repeteHabilidade')) {
      if (ef.tecla === tecla) this.ecoar(tecla, alvo, ef.atraso, ef.fracao);
    }
    // Conjunto Eco de 2: chance de repetir qualquer habilidade.
    for (const ef of this.de('chanceDeRepetir')) {
      if (mundo.rng.proximo() < ef.chance) this.ecoar(tecla, alvo, ef.atraso, ef.fracao);
    }
    // Espelho do Mirante: toda habilidade também sai de um reflexo, mais fraca.
    for (const ef of this.de('reflexo')) this.ecoar(tecla, alvo, ef.atraso, ef.fracao);
    // Coro (Eco de 4): toda 3ª habilidade se repete.
    for (const ef of this.de('coro')) {
      if (this.estado.lancadas % ef.aCada === 0) this.ecoar(tecla, alvo, ef.atraso, ef.fracao);
    }
    // Sino da Igreja: o R também reinicia a recarga do E.
    if (tecla === 'R' && this.tem('rReiniciaE')) {
      const e = j.lancador?.slots['E'];
      if (e) {
        e.recarga = 0;
        e.cargas = e.def.cargas;
        mundo.eventos.push({ tipo: 'recargaReiniciada', id: j.id, tecla: 'E' });
      }
    }
  }

  private ecoar(tecla: string, alvo: V2, atraso: number, fracao: number): void {
    const { executor, heroi } = this.ctx;
    this.estado.ecos++;
    executor.estado.adiados.push({
      faltam: atraso,
      executar: (mundo) => executor.executar(mundo, heroi, tecla, alvo, fracao),
    });
  }

  /** Disco Riscado: cada auto-ataque que acerta tira um pouco de todas as recargas. */
  private aoAcertarAuto(): void {
    const l = this.ctx.heroi.lancador;
    if (!l) return;
    for (const ef of this.de('autoReduzRecargas')) {
      for (const s of Object.values(l.slots)) s.recarga = Math.max(0, s.recarga - ef.segundos);
    }
  }

  // ------------------------------------------------------------------ lanterna

  private aoPulsar(mundo: Mundo, centro: V2, raio: number): void {
    const j = this.ctx.heroi;
    const c = j.combate!;
    for (const ef of this.de('pulsoCura'))
      curar(mundo, j, c.attr.coragemMax * ef.fracao, 'vagalume');
    for (const ef of this.de('pulsoCausaDano')) {
      const bruto = ef.base + ef.razao * c.attr[this.ctx.atributoPrincipal];
      for (const e of this.inimigosPerto(mundo, centro, raio))
        causarDano(mundo, e, { origem: j.id, bruto, tipo: 'explosao', fonte: 'farol' });
    }
  }

  // ------------------------------------------------------------------ abóboras

  private aoDerrotar(mundo: Mundo, caido: Entidade, por: number): void {
    const efs = this.de('explodeAoDerrotar');
    if (efs.length === 0) return;
    // Explosões só encadeiam com a Colheita (Conjunto Abóbora de 4).
    if (caido.marcas?.explodiuDeAbobora && !this.tem('colheita')) return;
    if (por !== this.ctx.heroi.id) return;
    // Vários efeitos: a chance de pelo menos um, com a maior fração e o maior raio.
    const chance = 1 - efs.reduce((p, ef) => p * (1 - ef.chance), 1);
    if (mundo.rng.proximo() >= chance) return;
    const fracao = Math.max(...efs.map((ef) => ef.fracao));
    const raio = Math.max(...efs.map((ef) => ef.raio));
    this.explodir(mundo, caido.pos, caido.combate!.attr.coragemMax * fracao, raio);
  }

  /** Explosão de abóbora: machuca em volta, e com tratos acende luz, põe fogo e enche o Susto. */
  explodir(mundo: Mundo, centro: V2, bruto: number, raio: number): void {
    const j = this.ctx.heroi;
    this.estado.explosoes++;
    mundo.eventos.push({ tipo: 'explosaoAbobora', centro: { ...centro }, raio });
    for (const e of this.inimigosPerto(mundo, centro, raio)) {
      e.marcas = { ...e.marcas, explodiuDeAbobora: true };
      causarDano(mundo, e, { origem: j.id, bruto, tipo: 'explosao', fonte: 'abobora' });
      // Quem não caiu não fica marcado: a marca só diz que a queda veio de uma explosão.
      if (vivo(e)) e.marcas = { ...e.marcas, explodiuDeAbobora: false };
    }
    for (const ef of this.de('colheita')) this.ctx.regras.susto.encher(mundo, ef.susto, 'colheita');
    // Coroa de Abóbora: a explosão dispara uma Q de graça no centro dela (uma por tick, sem cadeia).
    if (this.tem('explosaoDisparaQ') && this.estado.coroaNoTick !== mundo.tick) {
      this.estado.coroaNoTick = mundo.tick;
      this.ctx.executor.executar(mundo, j, 'Q', { ...centro }, 1);
    }
    for (const ef of this.de('explosoesIluminam')) {
      this.ctx.luz.adicionar({
        tipo: 'explosao',
        x: centro.x,
        y: centro.y,
        raio: ef.raio,
        cura: false,
        ate: mundo.tick + Math.round(ef.duracao / mundo.dt),
      });
    }
    for (const ef of this.de('chaoEmChamas')) {
      const def = this.ctx.habilidades.get(ef.habilidade);
      if (def) this.ctx.executor.criarArea(j, def, centro);
    }
  }

  private inimigosPerto(mundo: Mundo, centro: V2, raio: number): Entidade[] {
    return mundo.entidades.filter(
      (e) =>
        e.tipo === 'inimigo' &&
        vivo(e) &&
        Math.hypot(e.pos.x - centro.x, e.pos.y - centro.y) <= raio + e.raio,
    );
  }
}
