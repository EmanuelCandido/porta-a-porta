import { recalcular, temEstado, vivo } from './combate';
import type { ServicosDaRua } from './elites';
import type { V2 } from './geometria';
import { novoSlot, type Lancador } from './habilidades';
import {
  alvoDe,
  andarDeLado,
  heroiDe,
  mira,
  type Comportamento,
  type ContextoIA,
  type EstadoIA,
} from './ia';
import { velocidadeDe } from './taticas';
import {
  TECLAS,
  type Combate,
  type DefInimigo,
  type Forma,
  type Habilidade,
  type Inimigos,
} from './content/esquemas';
import type { Entidade, Mundo } from './mundo';

/** O eco de um preço pago na run, que a Cobrança do Dono do Bairro invoca. */
export type EcoDaCobranca = { nome: string } & (
  { tipo: 'apagarPoste' | 'pestinhas' | 'areaEscura' } | { tipo: 'elite'; especie: string }
);

/** O que os chefes dos bairros 2 e 3 pedem às regras, além do que as elites já pedem. */
export interface ServicosDosChefes extends ServicosDaRua {
  /** Apaga para sempre as luzes da praça, menos as do objeto `exceto` (a casa do chefe). */
  apagarLuzes(mundo: Mundo, exceto: number | null): void;
  /** Apaga para sempre um poste aceso da praça; false se não sobrou nenhum. */
  apagarUmPoste(mundo: Mundo): boolean;
  /** Uma área de sombra por um tempo. */
  areaEscura(mundo: Mundo, pos: V2, raio: number, segundos: number): void;
  /** Onde o chefe da casa fica e a casa dele (praças com `arena.lugarDoChefe`). */
  lugarDoChefe: { pos: V2; casa: number | null } | null;
  /** Um eco por preço pago na run, na ordem em que foram pagos. */
  ecosDaCobranca: EcoDaCobranca[];
  cobranca: Inimigos['cobranca'];
}

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parar(e: Entidade): void {
  e.direcao = { x: 0, y: 0 };
  e.destino = null;
}

function rumo(de: V2, para: V2): V2 {
  const d = distancia(de, para);
  return d < 1e-6 ? { x: 0, y: 0 } : { x: (para.x - de.x) / d, y: (para.y - de.y) / d };
}

function andar(e: Entidade, dir: V2): void {
  e.direcao = dir;
  e.destino = null;
  if (dir.x !== 0 || dir.y !== 0) e.olhar = dir;
}

/** Pede o ataque se ele estiver pronto e ninguém estiver lançando. */
function atacar(mundo: Mundo, e: Entidade, ctx: ContextoIA, chave: string, alvo: V2): boolean {
  const s = e.lancador?.slots[chave];
  if (!s || s.recarga > 0 || e.lancador?.lancando || e.forcado) return false;
  e.olhar = rumo(e.pos, alvo);
  return ctx.executor.pedir(mundo, e, chave, { ...alvo });
}

/** Conta o tempo de um relógio da IA e diz se ele zerou. */
function relogio(ia: EstadoIA, chave: string, inicio: number, dt: number): boolean {
  const t = ((ia[chave] as number | undefined) ?? inicio) - dt;
  ia[chave] = t;
  return t <= 0;
}

/** A fase pela fração de Coragem: 1 acima do 1º limite, depois uma a mais por limite cruzado. */
function faseDe(e: Entidade, limites: number[]): number {
  const c = e.combate!;
  const f = c.coragem / c.attr.coragemMax;
  return 1 + limites.filter((l) => f < l).length;
}

/** Sai do véu (atacar revela), avisando a tela. */
function revelar(mundo: Mundo, e: Entidade): void {
  const c = e.combate;
  if (!c || !temEstado(c, 'invisivel')) return;
  c.estados = c.estados.filter((s) => s.tipo !== 'invisivel');
  mundo.eventos.push({ tipo: 'apareceu', id: e.id, pos: { ...e.pos } });
}

/**
 * Onde cai a próxima Lágrima da rajada: em cima do jogador, onde ele vai estar ou, no cerco, em
 * volta do ponto em que a rajada começou (a última no meio, para quem ficou parado).
 */
function pontoDaLagrima(
  mundo: Mundo,
  e: Entidade,
  ia: EstadoIA,
  alvo: Entidade,
  def: DefInimigo,
  faltam: number,
): V2 {
  const lagrimas = def.ataques[0] ?? '';
  switch (ia['desenho']) {
    case 'adiante':
      return mira(mundo, e, alvo, lagrimas, def);
    case 'cerco': {
      const c = (ia['centro'] as V2 | undefined) ?? alvo.pos;
      if (faltam <= 1) return { ...c };
      const total = def.param['lagrimasPorRajada'] ?? 4;
      const a = Number(ia['giro'] ?? 0) + ((total - faltam) * Math.PI * 2) / Math.max(1, total - 1);
      const r = def.param['raioDoCerco'] ?? 1.4;
      return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    }
    default:
      return { ...alvo.pos };
  }
}

/** Grita e avisa a interface quando o chefe entra numa fase nova. */
function novaFase(mundo: Mundo, e: Entidade, def: DefInimigo, fase: number, texto: string): void {
  mundo.eventos.push({ tipo: 'faseChefe', fase, nome: def.nome });
  mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto });
}

/**
 * A Moradora do 13 (GDD, "Chefe secreto"): copia as 4 habilidades do campeão, nos postos e com as
 * evoluções dele, e uma fração dos atributos de dano. Como todo ataque inimigo, cada cópia é
 * anunciada no chão (aviso mínimo do `param`), não gasta Energia, recarrega mais devagar e o
 * projétil não passa da velocidade máxima dos inimigos.
 */
export function espelharCampeao(
  moradora: Entidade,
  heroi: Entidade,
  def: DefInimigo,
  combate: Combate,
): void {
  const origem = heroi.lancador;
  const c = moradora.combate;
  if (!origem || !c) return;
  const p = def.param;
  const aviso = p['avisoMinimoS'] ?? 0.5;
  const vMax = p['velocidadeMaxProjetil'] ?? 9;
  const fRecarga = p['fatorRecarga'] ?? 1;
  const slots: Lancador['slots'] = {};
  for (const t of TECLAS) {
    const s = origem.slots[t];
    if (!s) continue;
    const forma: Forma =
      s.def.forma.tipo === 'linha' && s.def.forma.velocidade > vMax
        ? { ...s.def.forma, velocidade: vMax }
        : s.def.forma;
    const copia: Habilidade = {
      ...s.def,
      forma,
      custo: 0,
      aviso: true,
      lancamento: Math.max(s.def.lancamento, aviso),
      recarga: s.def.recarga.map((r) => r * fRecarga),
    };
    slots[t] = { ...novoSlot(copia, Math.max(1, s.posto)), evolucao: s.evolucao };
  }
  moradora.lancador = {
    slots,
    lancando: null,
    interrompido: false,
    guardado: null,
    passiva: null,
    contagemPassiva: 0,
    lancadas: 0,
  };
  // O dano das cópias vem dos mesmos atributos do campeão, numa fração deles.
  const a = heroi.combate?.attr;
  if (a) {
    const f = p['fatorAtributos'] ?? 1;
    c.base = {
      ...c.base,
      forca: a.forca * f,
      feitico: a.feitico * f,
      critico: a.critico,
      danoCritico: a.danoCritico ?? combate.danoCritico,
    };
    recalcular(c);
  }
  moradora.marcas = {
    ...moradora.marcas,
    visual: heroi.especie,
    matiz: p['matiz'] ?? 180,
  };
}

/** Até onde uma habilidade alcança, para a IA saber se dá para usá-la daqui. */
function alcanceDe(f: Forma): number {
  switch (f.tipo) {
    case 'linha':
    case 'cone':
    case 'alvo':
      return f.alcance;
    case 'area':
      return f.centradaNoLancador || f.acompanha ? f.raio : f.alcance + f.raio * 0.5;
    case 'dash':
      return f.distancia;
    case 'propria':
      return Infinity;
  }
}

/**
 * Chefes dos bairros 2 e 3 (GDD, "Chefes"). Cada um é uma máquina de estados por fase que usa os
 * ataques anunciados do executor; a fase vai em `ia.fase` (a barra da interface lê o nome dela).
 */
export function comportamentosDosChefes(s: ServicosDosChefes): Record<string, Comportamento> {
  return {
    /**
     * A Moradora do 13: mantém a distância do campeão e lança as cópias das habilidades dele, uma
     * por vez (o R primeiro), com uma pausa entre elas. No corredor dos espelhos, enquanto houver
     * espelho inteiro ela repete a habilidade que o jogador acabou de usar (`ia.eco`, posto pelas
     * regras) e, abaixo da metade da Coragem (Reflexo partido), as recargas encurtam. Quebrar
     * todos os espelhos acaba com as duas coisas.
     */
    moradora(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const l = e.lancador;
      if (!e.combate || !l) return;
      if (ia['fase'] === undefined) ia['fase'] = 1;
      const espelhos = mundo.entidades.some((x) => x.especie === 'espelho' && x.marcas?.quebravel);
      const semCorredor = !ia['corredor'];
      if (espelhos) ia['corredor'] = true;
      if (ia['fase'] === 1 && faseDe(e, [p['fase2'] ?? 0.5]) >= 2) {
        ia['fase'] = 2;
        novaFase(mundo, e, def, 2, 'Agora eu sou você!');
      }
      // Recargas curtas no Reflexo partido, só enquanto um espelho a sustenta (fora do corredor,
      // como antes, sempre).
      const rapida = ia['fase'] === 2 && (espelhos || semCorredor);
      if (rapida !== !!ia['rapida']) {
        ia['rapida'] = rapida;
        const f = p['fatorRecargaFase2'] ?? 1;
        for (const t of TECLAS) {
          const s = l.slots[t];
          if (s) s.def = { ...s.def, recarga: s.def.recarga.map((r) => (rapida ? r * f : r / f)) };
        }
      }
      const eco = ia['eco'];
      if (!espelhos) delete ia['eco'];
      const j = heroiDe(mundo);
      if (!j || !vivo(j)) {
        parar(e);
        return;
      }
      const d = distancia(e.pos, j.pos);
      const longe = p['distancia'] ?? 4;
      if (l.lancando || e.forcado) parar(e);
      else if (d > longe + 1) andar(e, rumo(e.pos, j.pos));
      else if (d < longe - 1) andar(e, rumo(j.pos, e.pos));
      else andarDeLado(mundo, e, j.pos, p['trocaLadoS'] ?? 2, (q) => s.livre(q));
      // O espelho repete a habilidade do jogador na hora, mesmo em recarga (anunciada como todas).
      if (espelhos && typeof eco === 'string' && !l.lancando && !e.forcado) {
        delete ia['eco'];
        const s = l.slots[eco];
        if (s) {
          s.recarga = 0;
          if (atacar(mundo, e, ctx, eco, j.pos)) {
            ia['pausa'] = p['pausaEntreHabilidades'] ?? 1;
            return;
          }
        }
      }
      if (!relogio(ia, 'pausa', 1.2, mundo.dt) || l.lancando) return;
      for (const t of ['R', 'E', 'W', 'Q'] as const) {
        const s = l.slots[t];
        if (!s || (s.recarga > 0 && s.cargas <= 0)) continue;
        if (d > alcanceDe(s.def.forma) + j.raio) continue;
        if (atacar(mundo, e, ctx, t, mira(mundo, e, j, t, def))) {
          ia['pausa'] = p['pausaEntreHabilidades'] ?? 1;
          return;
        }
      }
    },

    /**
     * Viúva do Mirante (bairro 2): no alto da sacada, chove Lágrimas em sequência onde o jogador
     * está. Abaixo de 60%, apaga a praça (só a lanterna e as janelas da casa dela iluminam) e chama
     * Sombras a cada 10 s. Abaixo de 25%, desce e luta corpo a corpo, alternando a investida e o
     * véu (2 s invisível; a lanterna e atacar revelam).
     */
    viuva(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const dt = mundo.dt;
      if (!e.combate) return;
      if (ia['fase'] === undefined) {
        ia['fase'] = 1;
        e.marcas = { ...e.marcas, alturaPx: p['alturaNoMirante'] ?? 48 };
      }
      const agora = faseDe(e, [p['fase2'] ?? 0.6, p['fase3'] ?? 0.25]);
      for (let f = (ia['fase'] as number) + 1; f <= agora; f++) {
        ia['fase'] = f;
        if (f === 2) {
          novaFase(mundo, e, def, 2, 'Que a noite caia!');
          s.apagarLuzes(mundo, s.lugarDoChefe?.casa ?? null);
          ia['sombras'] = 1;
        } else if (f === 3) {
          novaFase(mundo, e, def, 3, 'Então eu mesma desço!');
          e.marcas = { ...e.marcas, alturaPx: 0 };
          const chao = { x: e.pos.x + (p['desce'] ?? 2.5), y: e.pos.y };
          if (s.livre(chao)) {
            e.pos = { ...chao };
            e.posAnterior = { ...chao };
          }
        }
      }
      const fase = ia['fase'] as number;
      const [lagrimas, investida, garras] = def.ataques;

      // Escuridão: Sombras a cada 10 s, num canto escuro longe do jogador (no máximo 3 vivas).
      if (fase >= 2 && relogio(ia, 'sombras', 1, dt)) {
        ia['sombras'] = p['sombrasACadaS'] ?? 10;
        const vivas = mundo.entidades.filter(
          (x) => x.especie === 'sombra_da_viuva' && vivo(x),
        ).length;
        const j = heroiDe(mundo);
        if (j && vivas < (p['sombrasMax'] ?? 3)) {
          const q = s.sombraLonge(j.pos, j.pos, p['distanciaDasSombras'] ?? 4);
          if (q) s.invocar(mundo, 'sombra_da_viuva', q);
        }
      }

      if (fase < 3) {
        // No mirante: parada, rajadas de Lágrimas seguindo o jogador.
        parar(e);
        const pausa = relogio(ia, 'pausa', 1.5, dt);
        if (e.lancador?.lancando) return;
        const alvo = alvoDe(mundo, e, ctx);
        if (!alvo || !lagrimas) return;
        const rajada = (ia['rajada'] as number | undefined) ?? 0;
        if (rajada > 0) {
          if (atacar(mundo, e, ctx, lagrimas, pontoDaLagrima(mundo, e, ia, alvo, def, rajada))) {
            ia['rajada'] = rajada - 1;
            if (rajada === 1)
              ia['pausa'] =
                fase === 1
                  ? (p['pausaEntreRajadas'] ?? 2.2)
                  : (p['pausaEntreRajadasNoEscuro'] ?? 3);
          }
          return;
        }
        if (pausa) {
          ia['rajada'] = p['lagrimasPorRajada'] ?? 5;
          // Cada rajada um desenho: em cima, adiantada e (no escuro) o cerco em volta.
          const padroes = fase === 1 ? ['direto', 'adiante'] : ['direto', 'adiante', 'cerco'];
          const n = ((ia['padrao'] as number | undefined) ?? -1) + 1;
          ia['padrao'] = n;
          ia['desenho'] = padroes[n % padroes.length];
          ia['centro'] = { ...alvo.pos };
          ia['giro'] = mundo.rng.entre(0, Math.PI * 2);
        }
        return;
      }

      // No chão: investida de longe, garras de perto e o véu a cada tanto.
      if (e.lancador?.lancando || e.forcado) return;
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo) return parar(e);
      const c = e.combate;
      if (relogio(ia, 'veu', (p['veuACadaS'] ?? 8) / 2, dt) && !temEstado(c, 'invisivel')) {
        ia['veu'] = p['veuACadaS'] ?? 8;
        c.estados.push({ tipo: 'invisivel', restante: p['veuS'] ?? 2 });
        mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: '...' });
        // Some no véu e reaparece nas costas do jogador (as garras ainda são anunciadas).
        const costas = rumo({ x: 0, y: 0 }, alvo.olhar);
        const atras = p['atrasDoJogador'] ?? 0;
        const q = { x: alvo.pos.x - costas.x * atras, y: alvo.pos.y - costas.y * atras };
        if (atras > 0 && (costas.x !== 0 || costas.y !== 0) && s.livre(q)) {
          e.pos = { ...q };
          e.posAnterior = { ...q };
        }
      }
      const d = distancia(e.pos, alvo.pos);
      if (garras && d <= (p['alcanceGarras'] ?? 1.4) + alvo.raio) {
        parar(e);
        if (e.lancador?.slots[garras]?.recarga === 0) revelar(mundo, e);
        atacar(mundo, e, ctx, garras, alvo.pos);
        return;
      }
      if (
        investida &&
        d >= (p['investidaDesde'] ?? 2.5) &&
        d <= (p['alcanceInvestida'] ?? 6) &&
        ctx.campo.grade.linhaLivre(e.pos, alvo.pos) &&
        e.lancador?.slots[investida]?.recarga === 0
      ) {
        parar(e);
        revelar(mundo, e);
        atacar(mundo, e, ctx, investida, mira(mundo, e, alvo, investida, def));
        return;
      }
      andar(e, ctx.campo.direcao(e.pos, alvo.pos));
    },

    /**
     * O Dono do Bairro (bairro 3): a própria casa grande de três andares, parada atrás da cerca
     * oeste. Andar 1: varridas de feixes roxos pelas janelas. Andar 2 (abaixo de 66%): chuva de
     * tijolos da chaminé e a escada que vira rampa e empurra quem está diante da casa. Andar 3
     * (abaixo de 33%): o telhado vira um rosto e a Cobrança invoca, a cada 8 s, o eco de um preço
     * pago na run. Em todos os andares, as portas soltam pestinhas.
     */
    dono(mundo, e, def, ctx) {
      const ia = e.ia as EstadoIA;
      const p = def.param;
      const dt = mundo.dt;
      if (!e.combate) return;
      parar(e);
      if (ia['fase'] === undefined) {
        ia['fase'] = 1;
        // A barra fina fica acima do telhado, não no meio da casa.
        e.marcas = { ...e.marcas, barraAcimaPx: p['barraAcimaPx'] ?? 120 };
      }
      const agora = faseDe(e, [p['andar2'] ?? 0.66, p['andar3'] ?? 0.33]);
      for (let f = (ia['fase'] as number) + 1; f <= agora; f++) {
        ia['fase'] = f;
        ia['seq'] = 0;
        // A cada andar, um poste da rua apaga: a luz decide onde dá para ficar.
        s.apagarUmPoste(mundo);
        if (f === 2) novaFase(mundo, e, def, 2, 'A chaminé ainda funciona!');
        else if (f === 3) {
          novaFase(mundo, e, def, 3, 'Todo trato tem seu preço!');
          e.marcas = { ...e.marcas, visual: 'dono_do_bairro_rosto' };
          ia['cobranca'] = 2;
        }
      }
      const fase = ia['fase'] as number;
      const [feixe, tijolo, rampa] = def.ataques;
      // Diante da casa: onde as portas soltam pestinhas e onde a rampa empurra.
      const frente = { x: e.pos.x + e.raio + (p['rampaAFrente'] ?? 2.6), y: e.pos.y };

      if (relogio(ia, 'portas', (p['pestinhasACadaS'] ?? 12) / 2, dt)) {
        ia['portas'] = p['pestinhasACadaS'] ?? 12;
        const vivas = mundo.entidades.filter((x) => x.marcas?.daCasa && vivo(x)).length;
        const n = Math.min(p['pestinhasPorVez'] ?? 2, (p['pestinhasMax'] ?? 8) - vivas);
        for (let k = 0; k < n; k++) {
          const x = s.invocar(mundo, 'pestinha_lencol', {
            x: e.pos.x + e.raio + 1.2,
            y: e.pos.y + (k % 2 === 0 ? -1.2 : 1.2),
          });
          x.marcas = { ...x.marcas, daCasa: true };
        }
      }
      if (fase >= 3 && relogio(ia, 'cobranca', 2, dt)) {
        ia['cobranca'] = p['cobrancaACadaS'] ?? 8;
        cobrar(mundo, e, ia, frente);
      }

      if (e.lancador?.lancando) return;
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo) return;
      if (
        fase >= 2 &&
        rampa &&
        Math.abs(alvo.pos.x - frente.x) <= 2 &&
        Math.abs(alvo.pos.y - frente.y) <= 2 &&
        atacar(mundo, e, ctx, rampa, frente)
      )
        return;

      // A sequência em curso: a varrida de feixes ou a chuva de tijolos.
      const seq = (ia['seq'] as number | undefined) ?? 0;
      if (seq > 0) {
        const k = (ia['total'] as number) - seq;
        if (ia['tipo'] === 'feixe' && feixe) {
          const n = ia['total'] as number;
          const abertura = ((p['aberturaDaVarrida'] ?? 60) * Math.PI) / 180;
          const a =
            (ia['angulo'] as number) +
            (ia['sentido'] as number) * (-abertura / 2 + (abertura * k) / Math.max(1, n - 1));
          const alvoDoFeixe = { x: e.pos.x + Math.cos(a) * 10, y: e.pos.y + Math.sin(a) * 10 };
          if (atacar(mundo, e, ctx, feixe, alvoDoFeixe)) ia['seq'] = seq - 1;
        } else if (tijolo) {
          // O primeiro cai onde o jogador vai estar; os outros, espalhados em volta dele.
          const r = k === 0 ? 0 : (p['espalharTijolos'] ?? 1.6);
          const base = k === 0 ? mira(mundo, e, alvo, tijolo, def) : alvo.pos;
          const q = {
            x: base.x + mundo.rng.entre(-r, r),
            y: base.y + mundo.rng.entre(-r, r),
          };
          if (atacar(mundo, e, ctx, tijolo, q)) ia['seq'] = seq - 1;
        }
        if (ia['seq'] === 0) ia['pausa'] = p['pausaEntreVarridas'] ?? 2.5;
        return;
      }
      if (!relogio(ia, 'pausa', 1.5, dt)) return;
      // Andar 1 só varre; o 2 só chove tijolos; o 3 alterna os dois.
      const vez = ((ia['vez'] as number | undefined) ?? 0) + 1;
      ia['vez'] = vez;
      const tipo = fase === 1 || (fase === 3 && vez % 2 === 0) ? 'feixe' : 'tijolo';
      ia['tipo'] = tipo;
      ia['total'] = tipo === 'feixe' ? (p['feixesPorVarrida'] ?? 5) : (p['tijolosPorChuva'] ?? 3);
      ia['seq'] = ia['total'];
      ia['angulo'] = Math.atan2(alvo.pos.y - e.pos.y, alvo.pos.x - e.pos.x);
      // A varrida vai no sentido em que o jogador anda (correr junto com ela não salva); parado,
      // o sentido é sorteado.
      const v = velocidadeDe(alvo, dt);
      const giro = (alvo.pos.x - e.pos.x) * v.y - (alvo.pos.y - e.pos.y) * v.x;
      ia['sentido'] = Math.abs(giro) > 0.5 ? Math.sign(giro) : mundo.rng.proximo() < 0.5 ? 1 : -1;
    },
  };

  /** Um eco da Cobrança: o próximo preço pago, em ciclo. */
  function cobrar(mundo: Mundo, e: Entidade, ia: EstadoIA, frente: V2): void {
    const ecos = s.ecosDaCobranca;
    const cfg = s.cobranca;
    if (ecos.length === 0 || !cfg) return;
    const i = ((ia['eco'] as number | undefined) ?? 0) % ecos.length;
    ia['eco'] = i + 1;
    const eco = ecos[i]!;
    const j = heroiDe(mundo);
    mundo.eventos.push({
      tipo: 'grito',
      id: e.id,
      pos: { ...e.pos },
      texto: `Cobrança: ${eco.nome}!`,
    });
    const escuro = () => {
      if (j) s.areaEscura(mundo, { ...j.pos }, cfg.areaEscura.raio, cfg.areaEscura.duracaoS);
    };
    switch (eco.tipo) {
      case 'apagarPoste':
        if (!s.apagarUmPoste(mundo)) escuro();
        break;
      case 'areaEscura':
        escuro();
        break;
      case 'pestinhas':
        for (let k = 0; k < cfg.pestinhas; k++)
          s.invocar(mundo, 'pestinha_lencol', { x: frente.x, y: frente.y - 1 + k });
        break;
      case 'elite': {
        const vivas = mundo.entidades.filter((x) => x.marcas?.cobranca && vivo(x)).length;
        if (vivas >= cfg.maxElites) {
          escuro();
          break;
        }
        const x = s.invocar(mundo, eco.especie, { x: frente.x + 3, y: frente.y });
        x.marcas = { ...x.marcas, cobranca: true };
        break;
      }
    }
  }
}
