import { definirModificadores, miravel, vivo } from './combate';
import type { Retangulo, V2 } from './geometria';
import {
  alvoDe,
  andarDeLado,
  comportamentoBase,
  heroiDe,
  mira,
  rumoComFlanco,
  tentarEsquiva,
  visivelPara,
  type Comportamento,
  type ContextoIA,
  type EstadoIA,
} from './ia';
import type { Entidade, Mundo } from './mundo';

/** O que os selvagens, as elites e o chefe pedem às regras da rua. */
export interface ServicosDaRua {
  /** Faz nascer um inimigo (pestinhas da Casa e do alarme, Guardas do Síndico). */
  invocar(mundo: Mundo, especie: string, pos: V2): Entidade;
  /** Grito do Corvo: chama pestinhas pelo bueiro mais perto. */
  alarme(mundo: Mundo, de: Entidade, raio: number, pestinhas: number): void;
  /** Vizinho Curioso viu o jogador: as pestinhas batem mais forte por um tempo. */
  bonusPestinhas(mundo: Mundo, mult: number, segundos: number): void;
  /** Tira o inimigo da rua sem recompensa (o Vizinho entrou em casa, o Gato sumiu). */
  sumir(mundo: Mundo, e: Entidade, texto: string): void;
  /** Tratos aceitos na run (o dano do Cobrador cresce com eles). */
  tratosAceitos(): number;
  /** Silêncio: corvos dormem e vigias enxergam metade. */
  silencio(): boolean;
  /**
   * A Casa Desperta desistiu e deitou de novo (a transformação ao contrário acabou): ela sai da rua
   * e a casa volta para o lote dela.
   */
  casaVoltou(mundo: Mundo, e: Entidade): void;
  /** Faixa da rua (x) onde a Casa Perseguidora anda: ela não cabe nas vielas. */
  faixaDaRua: { x0: number; x1: number };
  portaMaisPerto(p: V2): V2 | null;
  /** Um ponto escuro e livre a pelo menos `min` tiles de `longeDe` (Sombra Rasteira). */
  sombraLonge(p: V2, longeDe: V2, min: number): V2 | null;
  /** O caminho está livre de casas e cercas? */
  livre(p: V2): boolean;
}

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parar(e: Entidade): void {
  e.direcao = { x: 0, y: 0 };
  e.destino = null;
}

function andar(e: Entidade, dir: V2): void {
  e.direcao = dir;
  e.destino = null;
  if (dir.x !== 0 || dir.y !== 0) e.olhar = dir;
}

function rumo(de: V2, para: V2): V2 {
  const d = distancia(de, para);
  return d < 1e-6 ? { x: 0, y: 0 } : { x: (para.x - de.x) / d, y: (para.y - de.y) / d };
}

function girar(v: V2, graus: number): V2 {
  const t = (graus * Math.PI) / 180;
  return { x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) };
}

function dentro(p: V2, r: Retangulo, folga = 0): boolean {
  return p.x >= r.x0 - folga && p.x <= r.x1 + folga && p.y >= r.y0 - folga && p.y <= r.y1 + folga;
}

/** Pede o ataque se ele estiver pronto e ninguém estiver lançando. */
function atacar(mundo: Mundo, e: Entidade, ctx: ContextoIA, chave: string, alvo: V2): boolean {
  const s = e.lancador?.slots[chave];
  if (!s || s.recarga > 0 || e.lancador?.lancando || e.forcado) return false;
  e.olhar = rumo(e.pos, alvo);
  return ctx.executor.pedir(mundo, e, chave, { ...alvo });
}

/** Rumo de perseguição: o campo de fluxo até o jogador, ou reto até a isca. */
function perseguir(e: Entidade, alvo: Entidade, ctx: ContextoIA): V2 {
  if (alvo.tipo === 'jogador' && !alvo.marcas?.isca) return ctx.campo.direcao(e.pos, alvo.pos);
  return rumo(e.pos, alvo.pos);
}

/** O Guarda de Condomínio vivo mais perto (o Síndico se esconde atrás dele). */
function guardaMaisPerto(mundo: Mundo, e: Entidade): Entidade | null {
  let melhor: Entidade | null = null;
  let dm = Infinity;
  for (const o of mundo.entidades) {
    if (o.especie !== 'guarda_condominio' || !vivo(o)) continue;
    const d = distancia(o.pos, e.pos);
    if (d < dm) {
      dm = d;
      melhor = o;
    }
  }
  return melhor;
}

/** Corpo a corpo genérico: persegue e usa o golpe anunciado quando encosta. */
function brigao(chaveGolpe: number, alcanceParam: string): Comportamento {
  return (mundo, e, def, ctx) => {
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo || e.lancador?.lancando) return parar(e);
    if (tentarEsquiva(mundo, e, ctx)) return;
    const chave = def.ataques[chaveGolpe];
    const alcance = (def.param[alcanceParam] ?? 1.2) + alvo.raio;
    if (chave && distancia(e.pos, alvo.pos) <= alcance) {
      parar(e);
      atacar(mundo, e, ctx, chave, alvo.pos);
      return;
    }
    // Os do mesmo tipo chegam por lados diferentes (Guardas cercam em vez de virem em fila).
    andar(e, rumoComFlanco(e, alvo, perseguir(e, alvo, ctx), ctx));
  };
}

/**
 * Selvagens dos quintais (GDD): Cão de Guarda, Corvo da Árvore e Gato Preto; elites (Casa
 * Perseguidora, Vizinho Curioso, Cobrador, Sombra Rasteira) e os Guardas do Síndico. Cada um é uma
 * máquina de estados simples que usa os ataques anunciados do executor.
 */
export function comportamentosDaRua(s: ServicosDaRua): Record<string, Comportamento> {
  return {
    /** Cão de Guarda: guarda o quintal; com o jogador perto, morde e dá investidas de 5 tiles. */
    cao(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const casa = (ia['casa'] as V2 | undefined) ?? (ia['casa'] = { ...e.pos });
      const area = ia['area'] as Retangulo | undefined;
      if (e.forcado || e.lancador?.lancando) return;
      const alvo = alvoDe(mundo, e, ctx);
      const naColeira = (q: V2) => !area || dentro(q, area, p['coleira'] ?? 2);
      const ve =
        alvo &&
        naColeira(alvo.pos) &&
        (ia.estado === 'caca' || distancia(e.pos, alvo.pos) <= (p['alcanceVisao'] ?? 5));
      if (!alvo || !ve) {
        ia.estado = 'volta';
        if (distancia(e.pos, casa) > 0.3) andar(e, rumo(e.pos, casa));
        else {
          parar(e);
          // De volta à casinha, recupera a Coragem (como os acampamentos de um MOBA).
          const c = e.combate;
          if (c)
            c.coragem = Math.min(c.attr.coragemMax, c.coragem + c.attr.coragemMax * 0.2 * mundo.dt);
        }
        return;
      }
      ia.estado = 'caca';
      const d = distancia(e.pos, alvo.pos);
      const [investida, mordida] = def.ataques;
      if (mordida && d <= (p['alcanceMordida'] ?? 1.3) + alvo.raio) {
        parar(e);
        atacar(mundo, e, ctx, mordida, alvo.pos);
        return;
      }
      if (
        investida &&
        d <= (p['alcanceInvestida'] ?? 5) &&
        ctx.campo.grade.linhaLivre(e.pos, alvo.pos) &&
        atacar(mundo, e, ctx, investida, mira(mundo, e, alvo, investida, def))
      ) {
        parar(e);
        return;
      }
      andar(e, rumo(e.pos, alvo.pos));
    },

    /** Corvo da Árvore: não ataca; ao ver o jogador, grita e chama pestinhas (alarme). */
    corvo(mundo, e, def, ctx) {
      parar(e);
      const ia = e.ia as EstadoIA;
      const p = def.param;
      if (s.silencio()) {
        ia.estado = 'dormindo';
        return;
      }
      ia.relogio = Math.max(0, (ia.relogio ?? 0) - mundo.dt);
      const j = heroiDe(mundo);
      if (!j || !miravel(j)) return;
      if (!visivelPara(e, j, ctx, p['alcanceVisao'] ?? 6, p['visaoNaSombra'] ?? 2)) return;
      e.olhar = rumo(e.pos, j.pos);
      if (ia.relogio > 0) return;
      ia.relogio = p['recargaAlarme'] ?? 10;
      ia.estado = 'alarme';
      mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: 'Cróóó!' });
      s.alarme(mundo, e, p['raioAlarme'] ?? 6, p['pestinhasPorAlarme'] ?? 2);
    },

    /** Gato Preto: foge do jogador; some 20 s depois de ser visto. Pegá-lo dá um trato grátis. */
    gato(mundo, e, def) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const j = heroiDe(mundo);
      if (!j || !vivo(j)) return parar(e);
      const d = distancia(e.pos, j.pos);
      if (ia['visto'] === undefined && d <= (p['distanciaFuga'] ?? 4) * 1.8) {
        ia['visto'] = 0;
        mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: 'Miau!' });
      }
      if (typeof ia['visto'] === 'number') {
        ia['visto'] += mundo.dt;
        if (ia['visto'] >= (p['tempoParaSumir'] ?? 20)) {
          s.sumir(mundo, e, 'O Gato Preto sumiu...');
          return;
        }
      }
      if (d > (p['distanciaFuga'] ?? 4)) return parar(e);
      const fuga = rumo(j.pos, e.pos);
      // Foge em linha; se bater numa parede, tenta de lado.
      for (const g of [0, 45, -45, 90, -90, 135, -135]) {
        const dir = girar(fuga, g);
        if (s.livre({ x: e.pos.x + dir.x * 0.7, y: e.pos.y + dir.y * 0.7 })) {
          andar(e, dir);
          return;
        }
      }
      parar(e);
    },

    /**
     * Casa Perseguidora (e a Casa Desperta): levanta do lote, sai pela porta, persegue devagar e dá o
     * Pisão de raio 2,6; abaixo de 50% invoca 2 pestinhas. A Desperta desiste de quem foge.
     */
    casa(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      // Levantando do lote (ou deitando de volta): parada até a transformação acabar.
      if (mundo.tick < Number(e.marcas?.transformacaoAte ?? -1)) return parar(e);
      if (e.marcas?.adormecendo) {
        parar(e);
        s.casaVoltou(mundo, e);
        return;
      }
      // Saindo do lote: anda reto do meio dele até a calçada da porta.
      const saida = ia['saida'] as V2 | undefined;
      if (saida) {
        // Presa num obstáculo (um portão, uma lixeira) sem chegar mais perto: larga a saída.
        const d = distancia(e.pos, saida);
        const melhor = Number(ia['saidaMelhor'] ?? Infinity);
        if (d < melhor - 0.01) {
          ia['saidaMelhor'] = d;
          ia['saidaParada'] = 0;
        } else ia['saidaParada'] = Number(ia['saidaParada'] ?? 0) + mundo.dt;
        if (d > 0.3 && Number(ia['saidaParada']) < (p['saidaPresaS'] ?? 0.5)) {
          andar(e, rumo(e.pos, saida));
          return;
        }
        delete ia['saida'];
        delete ia['saidaMelhor'];
        delete ia['saidaParada'];
      }
      // A Casa Desperta desiste de quem foge para longe: deita onde está e volta para o lote.
      const fugaS = p['fugaS'] ?? 0;
      const j = heroiDe(mundo);
      if (fugaS > 0 && j) {
        const longe = distancia(e.pos, j.pos) > (p['fugaDistancia'] ?? 12);
        ia['longe'] = longe ? Number(ia['longe'] ?? 0) + mundo.dt : 0;
        if (Number(ia['longe']) >= fugaS && !e.lancador?.lancando) {
          const t = Math.round((p['transformacaoS'] ?? 0) / mundo.dt);
          e.marcas = {
            ...e.marcas,
            transformacaoDe: mundo.tick,
            transformacaoAte: mundo.tick + t,
            reversa: true,
            adormecendo: true,
          };
          mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: 'Zzz...' });
          return parar(e);
        }
      }
      const c = e.combate;
      if (
        c &&
        !ia['invocou'] &&
        (p['pestinhasInvocadas'] ?? 2) > 0 &&
        c.coragem / c.attr.coragemMax < (p['limiarInvocar'] ?? 0.5)
      ) {
        ia['invocou'] = true;
        const n = p['pestinhasInvocadas'] ?? 2;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          s.invocar(mundo, 'pestinha_lencol', {
            x: e.pos.x + Math.cos(a) * 1.4,
            y: e.pos.y + Math.sin(a) * 1.4,
          });
        }
        mundo.eventos.push({
          tipo: 'grito',
          id: e.id,
          pos: { ...e.pos },
          texto: 'A porta rangeu!',
        });
      }
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo || e.lancador?.lancando) return parar(e);
      const chave = def.ataques[0];
      if (chave && distancia(e.pos, alvo.pos) <= (p['alcancePisao'] ?? 1.9) + alvo.raio) {
        parar(e);
        atacar(mundo, e, ctx, chave, alvo.pos);
        return;
      }
      const dir = perseguir(e, alvo, ctx);
      // Não cabe nas vielas: fica na faixa da rua, esperando na boca da viela.
      const prox = e.pos.x + dir.x * 0.6;
      const f = s.faixaDaRua;
      if (prox < f.x0 || prox > f.x1) {
        const so = {
          x: 0,
          y: Math.sign(alvo.pos.y - e.pos.y) * (Math.abs(alvo.pos.y - e.pos.y) > 0.3 ? 1 : 0),
        };
        if (so.y === 0) return parar(e);
        andar(e, so);
        return;
      }
      andar(e, dir);
    },

    /**
     * Vizinho Curioso: patrulha a calçada olhando em volta; se o jogador entrar no cone de visão,
     * dá +30% de dano às pestinhas por 10 s e foge para dentro da casa mais perto.
     */
    vizinho(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      if (ia.estado === 'fuga') {
        const porta = ia['porta'] as V2 | undefined;
        if (!porta || distancia(e.pos, porta) < 0.45) {
          s.sumir(mundo, e, 'O Vizinho entrou em casa');
          return;
        }
        // A* até a porta, desviando de carros, bancas e do mobiliário da calçada.
        ia['caminho'] ??= ctx.campo.grade.caminho(e.pos, porta) ?? [porta];
        const caminho = ia['caminho'] as V2[];
        while (caminho.length > 1 && distancia(e.pos, caminho[0]!) < 0.35) caminho.shift();
        if (e.combate)
          definirModificadores(e.combate, 'fuga', [
            {
              origem: 'fuga',
              atributo: 'velocidade',
              mult: (p['velocidadeFuga'] ?? 3.2) / Math.max(e.velocidade, 0.1) - 1,
            },
          ]);
        andar(e, rumo(e.pos, caminho[0] ?? porta));
        return;
      }
      // Patrulha entre dois pontos, varrendo o olhar.
      const a = ia['a'] as V2 | undefined;
      const b = ia['b'] as V2 | undefined;
      ia.relogio = (ia.relogio ?? 0) + mundo.dt;
      if (a && b) {
        const indo = (ia['indo'] as V2 | undefined) ?? b;
        if (distancia(e.pos, indo) < 0.3) ia['indo'] = indo === b ? a : b;
        const dir = rumo(e.pos, (ia['indo'] as V2 | undefined) ?? b);
        andar(e, dir);
        e.olhar = girar(dir, Math.sin(ia.relogio * ((p['giroPorS'] ?? 40) / 30)) * 45);
      } else parar(e);
      const j = heroiDe(mundo);
      if (!j || !miravel(j)) return;
      const alcance = (p['alcanceVisao'] ?? 6) * (s.silencio() ? 0.5 : 1);
      if (!visivelPara(e, j, ctx, alcance, p['visaoNaSombra'] ?? 2)) return;
      const ang = Math.abs(
        Math.atan2(
          e.olhar.x * (j.pos.y - e.pos.y) - e.olhar.y * (j.pos.x - e.pos.x),
          e.olhar.x * (j.pos.x - e.pos.x) + e.olhar.y * (j.pos.y - e.pos.y),
        ),
      );
      if ((ang * 180) / Math.PI > (p['anguloVisao'] ?? 70) / 2) return;
      ia.estado = 'fuga';
      ia['porta'] = s.portaMaisPerto(e.pos);
      mundo.eventos.push({
        tipo: 'grito',
        id: e.id,
        pos: { ...e.pos },
        texto: 'Ei! Pestinhas, aqui!',
      });
      s.bonusPestinhas(mundo, p['bonusPestinhas'] ?? 0.3, p['bonusS'] ?? 10);
    },

    /** Cobrador: o dano cresce com os tratos; corrente que puxa de longe e cobrança de perto. */
    cobrador(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      if (!ia['ajustado'] && e.combate) {
        ia['ajustado'] = true;
        definirModificadores(e.combate, 'divida', [
          {
            origem: 'divida',
            atributo: 'dano',
            mult: (p['danoPorTrato'] ?? 0.1) * s.tratosAceitos(),
          },
        ]);
      }
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo || e.lancador?.lancando) return parar(e);
      const d = distancia(e.pos, alvo.pos);
      const [corrente, golpe] = def.ataques;
      if (golpe && d <= (p['alcanceGolpe'] ?? 1.4) + alvo.raio) {
        parar(e);
        atacar(mundo, e, ctx, golpe, alvo.pos);
        return;
      }
      if (
        corrente &&
        d <= (p['alcanceCorrente'] ?? 6) &&
        d > 2.5 &&
        ctx.campo.grade.linhaLivre(e.pos, alvo.pos) &&
        atacar(mundo, e, ctx, corrente, mira(mundo, e, alvo, corrente, def))
      ) {
        parar(e);
        return;
      }
      andar(e, perseguir(e, alvo, ctx));
    },

    /** Sombra Rasteira: só anda na sombra (30% mais rápida); na luz, some e reaparece longe. */
    sombra(mundo, e, def, ctx) {
      const p = def.param;
      if (e.combate) {
        definirModificadores(e.combate, 'naSombra', [
          { origem: 'naSombra', atributo: 'velocidade', mult: p['bonusNaSombra'] ?? 0.3 },
        ]);
      }
      const j = heroiDe(mundo);
      if (ctx.luz.iluminado(e.pos) && j) {
        const q = s.sombraLonge(e.pos, j.pos, p['distanciaReaparecer'] ?? 4);
        if (q) {
          e.pos = { ...q };
          e.posAnterior = { ...q };
          e.forcado = null;
          mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: '...' });
        }
        return parar(e);
      }
      brigao(0, 'alcanceBote')(mundo, e, def, ctx);
    },

    /** Guarda de Condomínio (adds do Síndico): cerca o jogador e bate com o cassetete. */
    guarda: brigao(0, 'alcanceGolpe'),

    /**
     * Poste Corrompido: a torre de sempre (src/sim/ia.ts) e, uma vez, abaixo de `limiarAjuda` da
     * Coragem, a luz roxa chama pestinhas em volta dele.
     */
    torre(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const c = e.combate;
      const p = def.param;
      const n = p['pestinhasAjuda'] ?? 0;
      if (
        c &&
        n > 0 &&
        !ia['ajuda'] &&
        c.coragem > 0 &&
        c.coragem / c.attr.coragemMax < (p['limiarAjuda'] ?? 0)
      ) {
        ia['ajuda'] = true;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + Math.PI / 4;
          const q = { x: e.pos.x + Math.cos(a) * 1.3, y: e.pos.y + Math.sin(a) * 1.3 };
          s.invocar(mundo, 'pestinha_lencol', s.livre(q) ? q : { ...e.pos });
        }
        mundo.eventos.push({
          tipo: 'grito',
          id: e.id,
          pos: { ...e.pos },
          texto: 'Zzzt! Pestinhas!',
        });
      }
      comportamentoBase('torre')?.(mundo, e, def, ctx);
    },

    /**
     * Síndico Zeloso (GDD): anda pela praça mantendo distância e lança Multas em leque; a cada 15 s
     * fecha um Portão de grades. Abaixo de 50%, chama 2 Guardas e passa a usar a Vistoria (4 × 4,
     * atordoa).
     */
    chefe(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const c = e.combate;
      if (!c) return;
      const fase2 = c.coragem / c.attr.coragemMax < (p['fase2'] ?? 0.5);
      if (fase2 && !ia['fase2']) {
        ia['fase2'] = true;
        mundo.eventos.push({ tipo: 'faseChefe', fase: 2, nome: def.nome });
        mundo.eventos.push({
          tipo: 'grito',
          id: e.id,
          pos: { ...e.pos },
          texto: 'Chamem os guardas!',
        });
        const n = p['guardas'] ?? 2;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + Math.PI / 4;
          s.invocar(mundo, 'guarda_condominio', {
            x: e.pos.x + Math.cos(ang) * 1.8,
            y: e.pos.y + Math.sin(ang) * 1.8,
          });
        }
      }
      ia['portao'] =
        ((ia['portao'] as number | undefined) ?? (p['intervaloPortao'] ?? 15) / 2) - mundo.dt;
      ia['vistoria'] = ((ia['vistoria'] as number | undefined) ?? 2) - mundo.dt;
      if (e.lancador?.lancando) return parar(e);
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo) return parar(e);
      if (tentarEsquiva(mundo, e, ctx)) return;
      const [multa, portao, vistoria] = def.ataques;
      if ((ia['portao'] as number) <= 0 && portao && atacar(mundo, e, ctx, portao, alvo.pos)) {
        ia['portao'] = p['intervaloPortao'] ?? 15;
        return parar(e);
      }
      if (
        fase2 &&
        (ia['vistoria'] as number) <= 0 &&
        vistoria &&
        atacar(mundo, e, ctx, vistoria, mira(mundo, e, alvo, vistoria, def))
      ) {
        ia['vistoria'] = p['intervaloVistoria'] ?? 7;
        // Quem fica preso na Vistoria (atordoado) leva a Multa em seguida.
        ia['combo'] = true;
        return parar(e);
      }
      const d = distancia(e.pos, alvo.pos);
      if (ia['combo'] && multa) {
        delete ia['combo'];
        const sm = e.lancador?.slots[multa];
        if (sm) sm.recarga = 0;
      }
      if (
        multa &&
        d <= (p['alcanceMulta'] ?? 8) &&
        ctx.campo.grade.linhaLivre(e.pos, alvo.pos) &&
        atacar(mundo, e, ctx, multa, mira(mundo, e, alvo, multa, def))
      )
        return parar(e);
      const ideal = p['distanciaIdeal'] ?? 4;
      const livre = (q: V2) => s.livre(q);
      // Fase 2: fica atrás do Guarda mais perto (ele na frente, o Síndico multando por trás).
      const guarda = fase2 ? guardaMaisPerto(mundo, e) : null;
      if (guarda && d < ideal + 3) {
        const g = rumo(alvo.pos, guarda.pos);
        const atras = p['atrasDosGuardas'] ?? 1.3;
        const ponto = { x: guarda.pos.x + g.x * atras, y: guarda.pos.y + g.y * atras };
        if (distancia(e.pos, ponto) > 0.4 && livre(ponto)) {
          andar(e, rumo(e.pos, ponto));
          e.olhar = rumo(e.pos, alvo.pos);
          return;
        }
      }
      if (d > ideal + 1.5) andar(e, perseguir(e, alvo, ctx));
      else if (d < ideal - 1.5) {
        const fuga = rumo(alvo.pos, e.pos);
        if (livre({ x: e.pos.x + fuga.x * 0.7, y: e.pos.y + fuga.y * 0.7 })) andar(e, fuga);
        else andarDeLado(mundo, e, alvo.pos, p['trocaLadoS'] ?? 2.5, livre);
      } else andarDeLado(mundo, e, alvo.pos, p['trocaLadoS'] ?? 2.5, livre);
      e.olhar = rumo(e.pos, alvo.pos);
    },
  };
}
