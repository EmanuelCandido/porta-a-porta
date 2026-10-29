import * as Phaser from 'phaser';
import { MedidorDaRua, marcarInicioDaRun } from '../desempenho/medidor';
import { paraTela } from '../../render/iso';
import { modeloDaEspecie } from '../../render/especies';
import { assistenciaDeMira, miraAutomatica } from '../../sim/assistencia';
import { causarDano, inimigosDe, vivo } from '../../sim/combate';
import {
  campeoes,
  combate,
  controles,
  exploracao,
  habilidades,
  modelos,
  ondas,
  simulacao,
  tabelaDeEvolucoes,
  visual,
} from '../../sim/content';
import { MODELOS_DE_CASA, TECLAS } from '../../sim/content/esquemas';
import { posicionador, type V2 } from '../../sim/geometria';
import { enfileirar, passo, removerEntidade, type Mundo } from '../../sim/mundo';
import { Minijogo, type TipoMinijogo } from '../../sim/minijogos';
import { escolherEvolucao, evolucaoPendente, opcoesDeEvolucao } from '../../sim/evolucoes';
import { quantos } from '../../sim/regrasDaRua';
import { darXp, gastarPonto } from '../../sim/partida';
import { xpParaSubir } from '../../sim/progressao';
import { PassoFixo } from '../../sim/passoFixo';
import { aproximar, configurarZoomDaRoda } from '../camera';
import { EntradaDoJogador, rotuloDaAcao } from '../entrada';
import { usandoControle } from '../dispositivo';
import { publicarEstado, type EstadoTeste } from '../ganchoTeste';
import { carregarArtes, imagemDaArte } from '../interface/artes';
import type { DadosInterface } from '../interface/CenaInterface';
import type { DadosMapa } from '../interface/Minimapa';
import { painelDaFicha } from '../interface/painel';
import { CenarioDaRua, corNumerica, PROFUNDIDADE } from '../rua/CenarioDaRua';
import { EfeitosDeCombate } from '../rua/EfeitosDeCombate';
import { MarcasDeInteracao, type MarcaDeInteracao } from '../rua/MarcasDeInteracao';
import { intensidadeEmPixels, PausaDeImpacto, respostaDeImpacto } from '../rua/impacto';
import { VistaEntidades } from '../rua/VistaEntidades';
import type { DadosPorta } from '../interface/CenaPorta';
import type { DadosDesafio } from '../interface/CenaDesafio';
import type { DadosEvolucao } from '../interface/CenaEvolucao';
import type { DadosFimDaRun } from '../interface/CenaFimDaRun';
import type { ResumoDaRun } from '../../sim/run';
import { luzesParaTela, SessaoDaRun, SessaoDeTreino, type Sessao } from '../sessao';
import {
  audio,
  dicas,
  itens as cfgItens,
  inimigos,
  noite,
  precos as cfgPrecos,
  susto as cfgSusto,
} from '../../sim/content';
import { faixaDoSusto } from '../../sim/susto';
import type { DadosPausa } from '../interface/CenaPausa';
import type { PontoDaPorta } from '../../sim/portaAPorta';
import { mixer } from '../audio/mixer';
import { SequenciaDeAcertos, sonsDosEventos } from '../audio/sons';
import { DicasDaRua } from '../dicas';
import { devDisponivel, PainelDev, type AlvoDoPainel, type TesteDaRua } from '../dev/PainelDev';
import { VidaDoCenario } from '../rua/VidaDoCenario';

/** O que aparece como bloco no mapa da interface: casas, marcos e cobertura grande. */
const MODELOS_NO_MAPA: ReadonlySet<string> = new Set([
  ...MODELOS_DE_CASA,
  'predio',
  'igreja',
  'escola',
  'galpao',
  'chafariz',
  'coreto',
  'banca',
  'carro',
  'tapume',
]);
/** Até onde (tiles) o mapa mostra os inimigos comuns. */
const RAIO_DO_RADAR = 16;
/** Quanto tempo um aviso curto (onda, sem Luz) fica na tela, em ms. */
const AVISO_MS = 1800;
/** Pausa ao passar pelo portão da fase Porta a Porta, em ms. */
const PAUSA_PORTA_MS = 900;
/** Quantos avisos aparecem de uma vez no canto, e quantos ficam guardados na fila. */
const AVISOS_NA_TELA = 3;
const MAX_AVISOS_GUARDADOS = 8;
/** Duração do estado imune da passagem (s): mais que a passagem inteira. */
const PASSAGEM_IMUNE_S = 60;
/** De quantos tiles do portão o texto da placa começa a aparecer. */
const DISTANCIA_PLACA_PORTAO = 13;
/** De quantos tiles da casa acesa (ou do banco) o nome do trato e o preço aparecem. */
const DISTANCIA_PLACA_CASA = 7;
/** Altura das placas sobre as casas acesas, em px acima do chão. */
const ALTURA_PLACA_PX = 96;
/** Profundidade das placas: acima de tudo no mundo. */
const PROFUNDIDADE_PLACA = 1e6;
/**
 * Na textura da Neblina, o raio da visão é esta fração do raio da textura: o resto (até a borda e
 * os cantos) é névoa fechada, e a imagem fica grande o bastante para cobrir a tela.
 */
const FRACAO_DA_VISAO = 0.12;

/** A família de um ataque inimigo anunciado, para o aviso sonoro de cada ameaça. */
function familiaDoAtaque(mundo: Mundo, id: number, chave: string): string | null {
  const e = mundo.entidades.find((x) => x.id === id);
  if (e?.combate?.chefe) return 'chefe';
  const forma = habilidades.find((h) => h.id === chave)?.forma.tipo;
  if (forma === 'area') return 'area';
  if (forma === 'linha') return 'linha';
  if (forma === 'dash') return 'investida';
  if (forma === 'cone') return 'golpe';
  return null;
}

function iguais(a: V2, b: V2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * A cena que joga um mapa: a rua de treino (`?modo=treino` ou `?rua=`) ou as ruas geradas, com
 * ondas, Postes Corrompidos, luz, Susto e a interface. A sessão guarda o que passa de uma rua para
 * a outra; a cena só desenha e traduz a entrada em comandos.
 */
export class CenaRua extends Phaser.Scene {
  private preparando = true;
  private quadrosPreparados = 0;
  private medidor!: MedidorDaRua;
  /** Névoa e bordas escuras da noite, paradas na tela. */
  private atmosfera?: Phaser.GameObjects.Image;
  private sessao!: Sessao;
  private cenario!: CenarioDaRua;
  private entrada!: EntradaDoJogador;
  private vista!: VistaEntidades;
  /** Fumaça, folhas, morcegos, crianças, gatos e janelas da cidade: só desenho. */
  private vida!: VidaDoCenario;
  private efeitos!: EfeitosDeCombate;
  private passoFixo!: PassoFixo;
  private pausaImpacto = new PausaDeImpacto();
  private painelDev: PainelDev | null = null;
  /** Até quando (ms) a câmera olha para o chefe que acabou de aparecer. */
  private focoNoChefeAte = 0;
  /** Acertos seguidos sobem de tom (o som da rua). */
  private sequenciaDeAcertos = new SequenciaDeAcertos();
  /** O som estava ligado no último quadro (M avisa quando muda). */
  private somLigado = mixer.ligado;
  /** Dicas da rua 1-1 da primeira run (null nas outras ruas) e a do quadro atual. */
  private dicasDaRua: DicasDaRua | null = null;
  private textoDaDica: string | null = null;
  /** Dica de uma linha da primeira vez (Susto), com o fim. */
  private dicaDaVez: { texto: string; ate: number } | null = null;
  private sustoExplicado = false;
  private tremorPendentePx = 0;
  private tremorAtualPx = 0;
  private revelacaoTrato: { inicio: number; zoom: number; texto: string } | null = null;
  private ultimaDirecao: V2 = { x: 0, y: 0 };
  private ultimaMira: V2 | null = null;
  /** Deslocamento suavizado da câmera para a frente do movimento, em px de tela. */
  private olhar: V2 = { x: 0, y: 0 };
  private marcador?: Phaser.GameObjects.Graphics;
  private estado!: EstadoTeste;
  private versaoLuz = -1;
  /**
   * Avisos de eventos (onda, poste religado, baú...): uma fila pequena no canto da interface, e
   * não um balão no meio da tela. Escrever em `aviso` põe um na fila (o mesmo texto só renova).
   */
  private avisos: { texto: string; ate: number }[] = [];
  private set aviso(a: { texto: string; ate: number }) {
    const igual = this.avisos.find((x) => x.texto === a.texto);
    if (igual) igual.ate = Math.max(igual.ate, a.ate);
    else this.avisos.push({ ...a });
    if (this.avisos.length > MAX_AVISOS_GUARDADOS) this.avisos.shift();
  }
  /** O que o F (ou G) faz aqui: uma linha discreta acima da barra de habilidades. */
  private interacao: { texto: string; ate: number } | null = null;
  /** A habilidade estava na mira no quadro anterior (aí o Esc cancela a mira, e não pausa). */
  private mirandoNoQuadro = false;
  /**
   * Alguma janela (porta, loja, pausa) estava aberta no quadro anterior: o Esc que a fecha chega
   * aqui também, e não pode abrir a pausa.
   */
  private janelaNoQuadro = false;
  private titulo: { texto: string; ate: number } | null = null;
  private fimEm: number | null = null;
  /**
   * Passagem entre mapas: saindo (andando sozinha pela rua escolhida, a tela fechando num círculo)
   * ou entrando (o círculo abrindo no mapa novo, ela chegando andando).
   */
  private passagem: {
    modo: 'saindo' | 'entrando';
    inicio: number;
    fim: number;
    /** Entrando: o quadro do create (o relógio só começa no quadro seguinte). */
    quadro?: number;
  } | null = null;
  private iris: Phaser.GameObjects.Graphics | null = null;
  /** O estado imune que a passagem pôs (tirado pela referência no fim). */
  private imuneDaPassagem: object | null = null;
  /** Placas do mundo cujo texto só aparece de perto (portões, casas acesas, banco). */
  private placasDePerto: {
    texto: Phaser.GameObjects.Text;
    pos: { x: number; y: number };
    distancia: number;
  }[] = [];
  /** A janela da porta ou do banco está aberta: a rua fica parada. */
  private janelaAberta = false;
  /** Testes de tela: o minijogo da Casa Desconfiada responde sozinho. */
  private minijogoAutomatico = false;
  /** Casas Desconfiadas que acordaram nesta rua (o modo dev não as rearma). */
  private casasAcordadas = new Set<number>();
  /** Quantos minijogos avulsos o modo dev já abriu (muda a semente de cada um). */
  private minijogosAvulsos = 0;
  /** Placas no mundo: textos e as artes do Codex (trato da casa, condição do portão) sobre eles. */
  private placas: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
  private nevoa: Phaser.GameObjects.Image | null = null;
  /** Anel de progresso de religar um poste ou subir no mirante. */
  private canalG: Phaser.GameObjects.Graphics | null = null;
  /** As marcas sobre as portas com interação (campainhas, Casas Desconfiadas, casas acesas). */
  private marcas: MarcasDeInteracao | null = null;
  private pertoDe: PontoDaPorta = null;

  constructor() {
    super('CenaRua');
  }

  private criarSessao(params: URLSearchParams): Sessao {
    const existente = this.registry.get('sessao') as Sessao | undefined;
    if (existente) return existente;
    const treino = params.get('modo') === 'treino' || params.has('rua');
    const s = treino
      ? new SessaoDeTreino(params)
      : new SessaoDaRun(
          Number(params.get('semente') ?? simulacao.sementePadrao),
          Number(params.get('posicao')?.split('-')[0] ?? params.get('bairro') ?? 1) - 1,
          params.get('campeao') ?? 'bruxinha',
          Number(params.get('posicao')?.split('-')[1] ?? 1) - 1,
          params.get('porta') === '1',
          params.get('chefe') === '1',
          {
            // `?primeira=1`: as dicas e a porta simples da primeira run, sem gravar o progresso.
            opcoes:
              params.has('lua') || params.has('primeira')
                ? {
                    ...(params.has('lua') ? { lua: Number(params.get('lua')) } : {}),
                    ...(params.get('primeira') === '1' ? { primeiraRun: true } : {}),
                  }
                : undefined,
            comecarNaMoradora: params.get('moradora') === '1',
          },
        );
    this.registry.set('sessao', s);
    return s;
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    this.preparando = true;
    this.quadrosPreparados = 0;
    const params = new URLSearchParams(window.location.search);
    this.sessao = this.criarSessao(params);
    const { mapa } = this.sessao;
    this.medidor = new MedidorDaRua(this, mapa.rua.id);
    this.passoFixo = new PassoFixo(simulacao.ticksPorSegundo, simulacao.maxTicksPorQuadro);
    this.pausaImpacto = new PausaDeImpacto();
    this.sequenciaDeAcertos = new SequenciaDeAcertos();
    this.somLigado = mixer.ligado;
    this.dicasDaRua = this.sessao.pegarDicasDaRua?.() ? new DicasDaRua(dicas.rua) : null;
    this.textoDaDica = null;
    this.dicaDaVez = null;
    this.tremorPendentePx = 0;
    this.tremorAtualPx = 0;
    this.revelacaoTrato = null;
    this.ultimaDirecao = { x: 0, y: 0 };
    this.ultimaMira = null;
    this.olhar = { x: 0, y: 0 };
    this.versaoLuz = -1;
    this.fimEm = null;
    this.avisos = [];
    this.interacao = null;
    this.passagem = null;
    this.iris = null;
    this.imuneDaPassagem = null;
    this.placasDePerto = [];
    this.janelaAberta = false;
    this.focoNoChefeAte = 0;
    this.placas = [];
    this.pertoDe = null;
    this.cenario = new CenarioDaRua(this, mapa.rua, {
      figurantes: false,
      noite: params.get('noite') !== '0',
      luzes: mapa.luz ? luzesParaTela(mapa.luz) : undefined,
    });
    if (mapa.regras && !mapa.regras.estado.chefe && !mapa.porta) {
      const composicao =
        mapa.regras.opcoes.composicaoOndas ?? ondas.composicao[mapa.regras.opcoes.bairro];
      for (const [especie, quantidade] of Object.entries(composicao ?? {}))
        if (quantidade > 0) this.cenario.prepararModelo(modeloDaEspecie(especie));
    }

    const modo = params.get('lancamento');
    this.entrada = new EntradaDoJogador(
      this,
      this.cenario.iso,
      modo === 'apertar' || modo === 'soltar' ? modo : undefined,
    );
    this.vista = new VistaEntidades(this, this.cenario);
    this.vida = new VidaDoCenario(this, this.cenario);
    this.efeitos = new EfeitosDeCombate(this, this.cenario.iso);
    this.vista.aoPisar = (pos) => this.efeitos.poeira(pos);
    this.marcador = this.add.graphics().setDepth(PROFUNDIDADE.marcadores).setAlpha(0);
    this.canalG = this.add.graphics().setDepth(PROFUNDIDADE_PLACA - 2);
    this.marcas = new MarcasDeInteracao(this, this.cenario.iso, PROFUNDIDADE_PLACA - 3);

    const dados: DadosInterface = {
      preparando: () => this.preparando,
      painel: () => {
        const agora = this.time.now;
        return painelDaFicha(this.sessao.mapa.partida.ficha, this.entrada.teclaMirando, {
          ...this.sessao.painel(),
          dica:
            this.revelacaoTrato?.texto ??
            (this.dicaDaVez && this.dicaDaVez.ate > agora ? this.dicaDaVez.texto : null) ??
            this.textoDaDica,
          avisos: this.avisos
            .filter((a) => a.ate > agora)
            .slice(-AVISOS_NA_TELA)
            .map((a) => ({ texto: a.texto, restanteMs: a.ate - agora })),
          interacao: this.interacao && this.interacao.ate > agora ? this.interacao.texto : null,
          titulo: this.titulo && this.titulo.ate > agora ? this.titulo.texto : null,
        });
      },
      subirPosto: (t) => gastarPonto(this.sessao.mapa.partida.ficha, t, combate),
      pausar: () => this.pausar(),
      mapa: () => this.dadosDoMapa(),
    };
    if (this.scene.isActive('CenaInterface')) this.scene.stop('CenaInterface');
    this.scene.launch('CenaInterface', dados);

    const camera = this.cameras.main;
    const limites = this.cenario.limitesDaCamera();
    if (this.cenario.temMundo) camera.removeBounds();
    else camera.setBounds(limites.x0, limites.y0, limites.x1 - limites.x0, limites.y1 - limites.y0);
    configurarZoomDaRoda(this, params);
    const inicio = paraTela({ ...mapa.partida.jogador.pos, z: 0 }, this.cenario.iso);
    this.cenario.enquadrar(camera, inicio);

    this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.L).on('down', () => {
      this.estado.noite = this.cenario.alternarNoite();
    });

    this.titulo = { texto: mapa.titulo, ate: this.time.now + AVISO_MS };
    this.estado = {
      cena: 'CenaRua',
      pronta: false,
      modo: this.sessao.modo,
      rua: mapa.rua.id,
      noite: this.cenario.noite,
      tick: 0,
      jogador: { ...mapa.partida.jogador.pos },
      destino: null,
      alternarNoite: () => (this.estado.noite = this.cenario.alternarNoite()),
      // Só para os testes: Energia cheia e recargas zeradas, para usar as 4 habilidades seguidas.
      recarregarTudo: () => {
        const { combate: c, lancador } = this.sessao.mapa.partida.jogador;
        if (c) c.energia = c.attr.energiaMax;
        if (lancador) for (const t of TECLAS) lancador.slots[t]!.recarga = 0;
      },
      // Onde um ponto do mundo aparece no canvas, em fração da largura e da altura (0 a 1).
      naTela: (x: number, y: number) => {
        const cam = this.cameras.main;
        const p = paraTela({ x, y, z: 0 }, this.cenario.iso);
        const v = cam.worldView;
        return {
          x: ((p.x - v.x) * cam.zoom) / cam.width,
          y: ((p.y - v.y) * cam.zoom) / cam.height,
        };
      },
      // Só para os testes: derruba os Postes Corrompidos (o portão abre no tick seguinte).
      derrubarPostes: () => {
        const r = this.sessao.mapa.regras;
        if (!r) return;
        for (const p of r.estado.postes) {
          if (p.combate && p.combate.coragem > 0) {
            causarDano(this.sessao.mapa.partida.mundo, p, {
              origem: this.sessao.mapa.partida.jogador.id,
              bruto: 1e7,
              tipo: 'habilidade',
              verdadeiro: true,
            });
          }
        }
        // Os eventos saíram fora de um tick: as regras os leem agora.
        r.sistema.depoisDoTick?.(
          this.sessao.mapa.partida.mundo,
          this.sessao.mapa.partida.mundo.eventos,
        );
      },
      // Só para os testes: a Bruxinha não leva dano (canais de exploração sem interrupção).
      imortal: () => {
        this.sessao.mapa.partida.jogador.combate?.estados.push({ tipo: 'imune', restante: 1e6 });
      },
      // Só para os testes: a Coragem acaba (a tela do fim da run abre depois da pausa).
      derrotar: () => {
        const { mundo, jogador } = this.sessao.mapa.partida;
        if (jogador.combate) jogador.combate.estados = [];
        causarDano(mundo, jogador, {
          origem: jogador.id,
          bruto: 1e9,
          tipo: 'ataque',
          verdadeiro: true,
        });
      },
      // Só para os testes: na fase Porta a Porta, uma casa vira a Janela Vermelha.
      janelaVermelha: () => {
        const casa = this.sessao.run?.acenderJanelaVermelha() ?? -1;
        this.criarPlacas();
        return casa;
      },
      // Só para os testes: um encontro raro a 3 tiles do jogador (Criança, Festa ou Carrinho).
      forcarEncontro: (tipo: number) => {
        const { mapa } = this.sessao;
        const j = mapa.partida.jogador;
        const tipos = ['crianca_perdida', 'festa_na_garagem', 'carrinho_de_pipoca'] as const;
        const pos = { x: j.pos.x + 3, y: j.pos.y };
        mapa.regras?.iniciarEncontro(mapa.partida.mundo, { tipo: tipos[tipo]!, pos });
        return pos;
      },
      // Só para os testes: o primeiro baú fechado da rua vira amaldiçoado (sai em 5% dos baús).
      amaldicoarBau: () => {
        const run = this.sessao.run;
        const b = this.sessao.mapa.regras?.estado.baus.find((x) => !x.aberto);
        const oferta = run?.tratoAmaldicoado();
        if (!b || !oferta) return false;
        Object.assign(b, {
          tipo: 'amaldicoado',
          revelado: false,
          doces: 0,
          item: null,
          rerolls: 0,
        });
        Object.assign(b, oferta);
        return { x: b.entidade.pos.x, y: b.entidade.pos.y };
      },
      // Só para os testes: quantas entidades da espécie estão no mundo (pilhas, espelhos...).
      contar: (especie: string) =>
        this.sessao.mapa.partida.mundo.entidades.filter((e) => e.especie === especie).length,
      // Só para os testes: deixa o chefe da praça com esta fração da Coragem (troca de fase).
      ferirChefe: (fracao: number) => {
        const c = this.sessao.mapa.regras?.estado.chefe?.combate;
        if (c) c.coragem = c.attr.coragemMax * fracao;
      },
      // Só para os testes: o minijogo da Casa Desconfiada joga sozinho, certo (ou não).
      acertarMinijogos: (sim: boolean) => {
        this.minijogoAutomatico = sim;
      },
      // Só para os testes: as Casas Desconfiadas desta rua com este minijogo.
      forcarMinijogo: (tipo: TipoMinijogo) => {
        for (const d of this.sessao.mapa.regras?.exploracao?.estado.desconfiadas ?? [])
          d.minijogo = tipo;
      },
      // Só para os testes: o perdão do primeiro erro da run já foi usado.
      gastarPerdao: () => {
        const run = this.sessao.run;
        if (run) run.estado.desconfiadaPerdoada = true;
      },
      // Só para os testes: tira os inimigos a até `raio` tiles do jogador (a porta só abre assim).
      afastarInimigos: (raio: number) => {
        const { mundo, jogador: j } = this.sessao.mapa.partida;
        for (const e of [...mundo.entidades])
          if (e.tipo === 'inimigo' && Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) <= raio)
            removerEntidade(mundo, e.id);
      },
      // Só para os testes: leva a Bruxinha a um ponto (o navegador de teste anda devagar).
      levarJogador: (x: number, y: number) => {
        const j = this.sessao.mapa.partida.jogador;
        j.pos = { x, y };
        j.posAnterior = { x, y };
      },
      // Só para os testes: n pestinhas em volta do jogador (para ver o cerco).
      // Opcional: a espécie e um encanto à força (para ver o nome e a aura na tela).
      cercar: (n: number, especie = 'pestinha_lencol', encanto?: string) => {
        const { mapa } = this.sessao;
        const r = mapa.regras;
        const j = mapa.partida.jogador;
        if (!r) return 0;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const e = r.criarInimigo(mapa.partida.mundo, especie, {
            x: j.pos.x + Math.cos(a) * 3.5,
            y: j.pos.y + Math.sin(a) * 3.5,
          });
          if (encanto)
            e.marcas = { ...e.marcas, encanto, escudoGolpes: encanto === 'encouracado' ? 3 : 0 };
        }
        return n;
      },
      // Só para os testes: o objeto quebrável mais perto do jogador (lixeira, caixa de correio...).
      // Só para os testes: um golpe básico na direção de um ponto do mundo (sem depender da mira).
      golpearPara: (x: number, y: number) => {
        const { mundo, jogador } = this.sessao.mapa.partida;
        enfileirar(mundo, {
          tipo: 'golpear',
          id: jogador.id,
          x: x - jogador.pos.x,
          y: y - jogador.pos.y,
        });
      },
      // Só para os testes: o ponto é chão livre para andar (fora de casas e objetos)?
      pontoLivre: (x: number, y: number) => this.sessao.mapa.regras?.chaoLivre({ x, y }) ?? true,
      // `tipo` filtra pela espécie ou pelo interativo ("alarme", "fio", "portao_quintal").
      quebravelPerto: (tipo?: string) => {
        const { mundo, jogador } = this.sessao.mapa.partida;
        let melhor: { x: number; y: number; raio: number; especie: string } | null = null;
        let d = Infinity;
        for (const e of mundo.entidades) {
          if (!e.marcas?.quebravel) continue;
          if (tipo && e.especie !== tipo && e.marcas.interativo !== tipo) continue;
          const k = Math.hypot(e.pos.x - jogador.pos.x, e.pos.y - jogador.pos.y);
          if (k < d) {
            d = k;
            melhor = { ...e.pos, raio: e.raio, especie: e.especie };
          }
        }
        return melhor;
      },
      // Fins de beco com desafio e o atalho escuro da rua.
      fins: () =>
        this.sessao.mapa.regras?.fins?.fins.map((f) => ({
          tipo: f.tipo,
          centro: { ...f.centro },
          vencido: f.vencido,
          velas: f.velas.map((v) => ({ ...v.pos, acesa: v.acesa })),
        })) ?? [],
      atalho: () => this.sessao.mapa.regras?.gerada.atalho ?? null,
      // Velas do jardim da Viúva (arena do chefe do bairro 2).
      velasDaViuva: () =>
        this.sessao.mapa.regras?.velasDaViuva?.velas.map((v) => ({ ...v.pos, acesa: v.acesa })) ??
        [],
      // Só para os testes: anda até um ponto pelo caminho (o clique para andar saiu com o WASD).
      andarAte: (x: number, y: number) => {
        const { mundo, jogador } = this.sessao.mapa.partida;
        enfileirar(mundo, { tipo: 'moverPara', id: jogador.id, x, y });
      },
      // Só para os testes: um crítico real no primeiro boneco de treino.
      acertarCritico: () => {
        const { mundo, jogador, bonecos } = this.sessao.mapa.partida;
        const alvo = bonecos[0];
        if (alvo)
          causarDano(mundo, alvo, {
            origem: jogador.id,
            bruto: 40,
            tipo: 'habilidade',
            critico: true,
          });
      },
      danos: 0,
      quebrados: 0,
      lancou: [] as string[],
      recusou: [] as string[],
      ataques: 0,
    };
    this.ligarModoDev();
    // Esc (sem mira) ou P pausam a rua e abrem o menu de pausa.
    const teclado = this.input.keyboard;
    teclado?.on('keydown-ESC', () => {
      if (!this.mirandoNoQuadro) this.pausar();
    });
    teclado?.on('keydown-P', () => this.pausar());
    // Depuração e testes: `?avancar=N` adianta a simulação N segundos (sem desenhar) ao abrir.
    const avancar = Number(params.get('avancar') ?? 0);
    if (avancar > 0 && mapa.partida.mundo.tick === 0) {
      for (let i = 0; i < avancar * simulacao.ticksPorSegundo; i++) passo(mapa.partida.mundo);
      mapa.partida.mundo.eventos = [];
    }
    if (mapa.regras && (this.sessao.run?.estado.rotas.length ?? 0) > 1)
      this.criarPlacasDosPortoes();
    this.nevoa = null;
    if (mapa.porta) {
      this.criarPlacas();
      const vermelha = this.sessao.run?.estado.porta?.ofertas.some((o) => o.vermelha);
      this.aviso = {
        texto: vermelha
          ? 'Uma janela vermelha acendeu: um trato lendário, com dois preços.'
          : 'Bata nas portas acesas (F) · o banco tem loja e cura · siga para o norte',
        ate: this.time.now + AVISO_MS * 3,
      };
    }
    // Veio do título (o círculo fechou lá): a rua aparece clareando.
    if (this.registry.get('vemDoTitulo')) {
      this.registry.remove('vemDoTitulo');
      this.cameras.main.fadeIn(visual.interface.animacao.abrirMs, 0, 0, 0);
    }
    // Veio de uma passagem: o mapa novo abre num círculo, com a personagem entrando andando.
    if (this.registry.get('passagem')) {
      this.registry.remove('passagem');
      // O relógio começa no quadro depois deste: montar o mapa deixa o quadro do create comprido,
      // e o update deste mesmo quadro ainda vê o `time.now` de antes do create.
      this.passagem = { modo: 'entrando', inicio: -1, fim: -1, quadro: this.game.loop.frame };
      this.protegerNaPassagem(true);
    }
    this.publicar();
    publicarEstado(this.estado);
    this.vista.sincronizar(mapa.partida.mundo, 1, 0);
    this.estado.preparacao = () => this.cenario.preparacao;
    this.desenharIris();
  }

  // ------------------------------------------------------------------ vida no cenário

  /** A vida do cenário lê onde o jogador está, os inimigos acordados e se há luta perto. */
  private atualizarVida(tempo: number, dtS: number): void {
    const { partida, regras } = this.sessao.mapa;
    const j = partida.jogador;
    const jogador = this.vista.posDesenhada(j.id) ?? j.pos;
    const raio = visual.vida.criancas.raioLuta;
    const inimigos = partida.mundo.entidades
      .filter(
        (e) => e.tipo === 'inimigo' && vivo(e) && !e.marcas?.adormecido && !e.marcas?.quebravel,
      )
      .map((e) => e.pos);
    const emLuta = inimigos.some((p) => Math.hypot(p.x - jogador.x, p.y - jogador.y) <= raio);
    this.vida.atualizar(tempo, dtS, {
      jogador,
      inimigos,
      emLuta,
      rota: regras?.gerada.rota ?? null,
    });
    this.estado.vida = this.vida.contagem;
  }

  // ------------------------------------------------------------------ pausa

  /**
   * Menu de pausa: a rua para (como com a janela da porta aberta) e o menu mostra os tratos e
   * preços da run, o Susto e os controles, com som, tela cheia e sair.
   */
  private pausar(): void {
    if (this.preparando) return;
    if (this.janelaAberta || this.passagem || this.fimEm !== null) return;
    if (this.janelaNoQuadro) return;
    const run = this.sessao.run;
    const { mapa } = this.sessao;
    const s = (run?.bolso ?? mapa.regras?.bolso)?.susto ?? null;
    const dados: DadosPausa = {
      campeaoId: mapa.partida.ficha.campeaoId,
      tratos:
        run?.estado.tratos.map((id) => {
          const d = run.defTrato(id);
          return { nome: d.nome, poder: d.poder, marcas: [...d.marcas] };
        }) ?? [],
      precos:
        run?.estado.precos.map((p) => {
          const d = run.conteudo.precos.precos[p.id];
          return {
            nome: d?.nome ?? p.id,
            efeito: d?.bairro ?? '',
            doTrato: run.defTrato(p.trato).nome,
          };
        }) ?? [],
      susto: s
        ? { valor: s.valor, faixa: faixaDoSusto(s, cfgSusto).nome, frenesi: s.frenesi }
        : null,
      aoContinuar: () => {
        this.janelaAberta = false;
        this.estado.pausa = null;
      },
      aoMostrar: (consulta) => {
        this.estado.pausa = consulta;
      },
      aoSair: () => {
        this.registry.remove('sessao');
        this.scene.stop('CenaInterface');
        this.scene.start('CenaTitulo');
      },
    };
    this.janelaAberta = true;
    this.entrada.tirarPedidos();
    this.scene.launch('CenaPausa', dados);
  }

  // ------------------------------------------------------------------ passagem entre mapas

  /** Durante a passagem, ninguém machuca a personagem (ela não está mais no controle). */
  private protegerNaPassagem(ligar: boolean): void {
    const c = this.sessao.mapa.partida.jogador.combate;
    if (!c) return;
    const antes = this.imuneDaPassagem;
    if (antes) c.estados = c.estados.filter((e) => e !== antes);
    this.imuneDaPassagem = null;
    if (!ligar) return;
    const imune = { tipo: 'imune' as const, restante: PASSAGEM_IMUNE_S };
    c.estados.push(imune);
    this.imuneDaPassagem = imune;
  }

  /** Na passagem, a personagem anda sozinha para o norte (para a saída, ou entrando na rua). */
  private andarSozinha(): void {
    const { mundo, jogador } = this.sessao.mapa.partida;
    this.entrada.tirarPedidos();
    const p = this.passagem;
    if (p?.modo === 'entrando' && p.inicio < 0 && this.game.loop.frame > (p.quadro ?? -1)) {
      p.inicio = this.time.now;
      p.fim = p.inicio + visual.interface.passagem.entrarMs;
    }
    if (p?.modo === 'entrando' && p.inicio >= 0 && this.time.now >= p.fim) {
      enfileirar(mundo, { tipo: 'direcao', id: jogador.id, x: 0, y: 0 });
      this.passagem = null;
      this.protegerNaPassagem(false);
      return;
    }
    enfileirar(mundo, { tipo: 'direcao', id: jogador.id, x: 0, y: -1 });
  }

  /**
   * O círculo da passagem: um anel preto em volta da personagem que fecha até a tela ficar preta
   * (saindo) ou abre a partir do preto (entrando).
   */
  private desenharIris(): void {
    const p = this.passagem;
    const cfg = visual.interface.passagem;
    const agora = this.time.now;
    let fracao: number | null = null;
    if (p?.modo === 'saindo') {
      const t = (agora - (p.fim - cfg.fecharMs)) / cfg.fecharMs;
      if (t > 0) fracao = 1 - Math.min(1, t) ** 2;
    } else if (p?.modo === 'entrando') {
      const t = p.inicio < 0 ? 0 : Math.min(1, (agora - p.inicio) / cfg.abrirMs);
      if (t < 1) fracao = 1 - (1 - t) ** 3;
    }
    if (fracao === null) {
      this.iris?.clear();
      return;
    }
    if (!this.iris) this.iris = this.add.graphics().setDepth(PROFUNDIDADE_PLACA + 10);
    const camera = this.cameras.main;
    const j = this.sessao.mapa.partida.jogador;
    const pos = this.vista.posDesenhada(j.id) ?? j.pos;
    const c = paraTela({ ...pos, z: 20 }, this.cenario.iso);
    const meia = Math.hypot(camera.width, camera.height) / camera.zoom;
    const raio = Math.max(0, meia * fracao);
    const espessura = meia * 3;
    this.iris
      .clear()
      .lineStyle(espessura, 0x000000, 1)
      .strokeCircle(c.x, c.y, raio + espessura / 2);
  }

  // ------------------------------------------------------------------ Porta a Porta

  /** Placas sobre as casas acesas com o trato e o preço (GDD: "mostrando o poder e o preço"). */
  private criarPlacas(): void {
    for (const p of this.placas) p.destroy();
    this.placas = [];
    this.placasDePerto = [];
    const { porta } = this.sessao.mapa;
    const run = this.sessao.run;
    if (!porta || !run) return;
    const estilo = {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: visual.paleta.luz,
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };
    for (const o of run.estado.porta?.ofertas ?? []) {
      const casa = porta.gerada.casas[o.casa];
      if (!casa) continue;
      const def = run.defTrato(o.trato);
      const precos = o.precos.map((id) => cfgPrecos.precos[id]?.nome ?? id).join(' + ');
      const janela = o.vermelha ? 'Janela Vermelha\n' : '';
      const texto = o.aceito
        ? `✔ ${def.nome}`
        : `${janela}${def.nome}\n${precos ? `Preço: ${precos}` : 'Sem preço'}`;
      const p = paraTela({ ...casa.topo, z: ALTURA_PLACA_PX }, this.cenario.iso);
      const placa = this.add
        .text(p.x, p.y, texto, {
          ...estilo,
          // A Janela Vermelha chama atenção no vermelho de alerta.
          color: o.aceito
            ? visual.acentos.fantasma
            : o.vermelha
              ? visual.acentos.perigo
              : visual.paleta.luz,
        })
        .setOrigin(0.5, 0)
        .setResolution(2)
        .setAlpha(0)
        .setDepth(PROFUNDIDADE_PLACA);
      this.placas.push(placa);
      this.placasDePerto.push({
        texto: placa,
        pos: { ...casa.topo },
        distancia: DISTANCIA_PLACA_CASA,
      });
      // A arte do trato sobre a casa fica sempre (aceito ou não, o morador mostra o que ofereceu);
      // o nome e o preço aparecem embaixo dela quando o jogador chega perto.
      const arte = imagemDaArte(this, 'trato', o.trato, p.x, p.y - 22, 36);
      if (arte) this.placas.push(arte.setDepth(PROFUNDIDADE_PLACA));
    }
    if (porta.gerada.banco) {
      const p = paraTela({ ...porta.gerada.banco, z: 40 }, this.cenario.iso);
      const placa = this.add
        .text(p.x, p.y, 'Banco\nloja e cura', { ...estilo, color: visual.acentos.doce })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setAlpha(0)
        .setDepth(PROFUNDIDADE_PLACA);
      this.placas.push(placa);
      this.placasDePerto.push({
        texto: placa,
        pos: { ...porta.gerada.banco },
        distancia: DISTANCIA_PLACA_CASA,
      });
    }
  }

  /**
   * Placas sobre os portões de saída (GAMEPLAY.md, "Rotas"): a condição da noite, a elite, a
   * recompensa e quantos postes amigos acendem na rua de cada caminho.
   */
  private criarPlacasDosPortoes(): void {
    const { regras } = this.sessao.mapa;
    const run = this.sessao.run;
    if (!regras || !run) return;
    const rotas = run.estado.rotas;
    const s = regras.gerada.saida;
    const larg = (s.x1 - s.x0) / rotas.length;
    // Sobre cada ramal da Encruzilhada (sem ramais, partes iguais da saída).
    const centroDoPortao = (k: number) => {
      const r = regras.gerada.saidas?.[k];
      return r ? (r.x0 + r.x1) / 2 : s.x0 + larg * (k + 0.5);
    };
    rotas.forEach((r, k) => {
      const cond = noite.condicoes[r.condicao];
      const elites = r.elites
        .map((e) => `${inimigos.inimigos[e.especie]?.nome ?? e.especie}${e.reforcado ? ' +' : ''}`)
        .join(' e ');
      const rec = noite.recompensas[r.recompensa as keyof typeof noite.recompensas];
      const texto = [
        cond?.nome ?? r.condicao,
        elites ? `Elite: ${elites}` : 'Sem elite',
        `${rec?.nome ?? r.recompensa} · ${r.postes} postes`,
      ].join('\n');
      const pos = { x: centroDoPortao(k), y: regras.gerada.ySaida };
      const p = paraTela({ ...pos, z: 78 }, this.cenario.iso);
      // O ícone da condição fica sempre sobre o arco; o texto só aparece de perto.
      const arte = imagemDaArte(this, 'condicao', r.condicao, p.x, p.y - 20, 36);
      if (arte) this.placas.push(arte.setDepth(PROFUNDIDADE_PLACA));
      const placa = this.add
        .text(p.x, p.y + 6, texto, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: cond?.rara ? visual.acentos.doce : visual.paleta.luz,
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setResolution(2)
        .setAlpha(0)
        .setDepth(PROFUNDIDADE_PLACA);
      this.placas.push(placa);
      this.placasDePerto.push({ texto: placa, pos, distancia: DISTANCIA_PLACA_PORTAO });
    });
  }

  /** O texto das placas aparece ao chegar perto e some ao se afastar (a arte fica sempre). */
  private atualizarPlacasDePerto(): void {
    const j = this.sessao.mapa.partida.jogador;
    for (const p of this.placasDePerto) {
      const d = Math.hypot(p.pos.x - j.pos.x, p.pos.y - j.pos.y);
      p.texto.setAlpha(Math.max(0, Math.min(1, (p.distancia - d) / 3)));
    }
  }

  /** Neblina: esconde os inimigos longe e cobre o mundo em volta com um véu cinza. */
  private atualizarNeblina(): void {
    const { regras, partida } = this.sessao.mapa;
    const rota = this.sessao.run?.estado.rotaAtual;
    const visao = regras && rota ? noite.condicoes[rota.condicao]?.visao : undefined;
    if (!visao || regras?.estado.chefe) {
      this.vista.neblina = null;
      return;
    }
    const centro = this.vista.posDesenhada(partida.jogador.id) ?? partida.jogador.pos;
    this.vista.neblina = { centro, raio: visao };
    // Um véu só, em degradê: a elipse do chão (raio da visão) é clara, e a névoa fecha em volta
    // até cobrir a tela inteira. A textura guarda o raio de dentro numa fração fixa.
    const cfg = visual.luzNaTela.neblina;
    const fora = visao + cfg.transicaoTiles;
    const chave = `neblina:${visao}:${cfg.transicaoTiles}`;
    if (!this.textures.exists(chave)) {
      const L = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = L;
      canvas.height = L;
      const ctx = canvas.getContext('2d')!;
      const n = Number.parseInt(cfg.cor.slice(1), 16);
      const rgba = (a: number) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      const g = ctx.createRadialGradient(L / 2, L / 2, 0, L / 2, L / 2, L / 2);
      g.addColorStop(0, rgba(0));
      g.addColorStop(FRACAO_DA_VISAO, rgba(0));
      g.addColorStop(Math.min(0.99, (FRACAO_DA_VISAO * fora) / visao), rgba(cfg.alfa));
      g.addColorStop(1, rgba(cfg.alfa));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, L, L);
      this.textures.addCanvas(chave, canvas);
    }
    if (!this.nevoa || this.nevoa.texture.key !== chave) {
      this.nevoa?.destroy();
      this.nevoa = this.add.image(0, 0, chave).setDepth(PROFUNDIDADE_PLACA - 1);
    }
    // Um círculo de raio R tiles no chão vira uma elipse de R·√2·meioTileX por metade disso.
    const { iso } = this.cenario;
    const raioPx = (visao * Math.SQRT2 * iso.meioTileX) / FRACAO_DA_VISAO;
    const p = paraTela({ ...centro, z: 0 }, iso);
    this.nevoa.setPosition(p.x, p.y).setDisplaySize(raioPx * 2, raioPx);
  }

  /** Mostra o que o F faz aqui (bater, sentar, abrir o baú). */
  private dicaDeInteracao(): void {
    const { mapa } = this.sessao;
    // A tecla (ou o botão do controle) de interagir.
    const F = rotuloDaAcao('interagir');
    const j = mapa.partida.jogador;
    const run = this.sessao.run;
    let dica: string | null = null;
    if (mapa.porta && run) {
      this.pertoDe = mapa.porta.regras.perto(j.pos);
      const p = this.pertoDe;
      if (p?.tipo === 'casa') {
        const o = run.oferta(p.casa);
        dica = o ? `${F}: bater na porta — ${run.defTrato(o.trato).nome}` : null;
      } else if (p?.tipo === 'banco') dica = `${F}: sentar no banco (loja e cura)`;
    } else if (mapa.regras) {
      const raio = this.sessao.run?.conteudo.run.bau.raioInteracao ?? 1.2;
      const bau = mapa.regras.estado.baus.find(
        (b) =>
          !b.aberto &&
          Math.hypot(b.entidade.pos.x - j.pos.x, b.entidade.pos.y - j.pos.y) <=
            raio + b.entidade.raio,
      );
      if (bau) dica = `${F}: abrir o baú`;
      // Carrinho de Pipoca aberto, perto do jogador.
      const enc = mapa.regras.encontros;
      const carrinho = enc?.encontro.tipo === 'carrinho_de_pipoca' ? enc.entidade : null;
      if (
        carrinho &&
        enc?.situacao === 'ativo' &&
        Math.hypot(carrinho.pos.x - j.pos.x, carrinho.pos.y - j.pos.y) <=
          (this.sessao.run?.conteudo.run.encontros.carrinhoDePipoca.raioAtender ?? 1.6) +
            carrinho.raio
      )
        dica = `${F}: comprar no Carrinho de Pipoca (40% de desconto)`;
      const ex = mapa.regras.exploracao;
      const perto = !bau && ex ? ex.pertoDe(j.pos) : null;
      if (perto && !ex?.estado.canal) {
        dica =
          perto.acao === 'campainha'
            ? `Campainha: ${F} pede doce · ${rotuloDaAcao('travessura')} pede travessura (luta por um prêmio maior)`
            : perto.acao === 'desconfiada'
              ? `Casa Desconfiada: ${F} bate na porta (minijogo rápido; errar acorda a casa)`
              : perto.acao === 'poste'
                ? `${F}: religar o poste (fique parado)`
                : `${F}: subir na caixa-d'água (fique parado)`;
      }
      if (!bau && mapa.regras.velasDaViuva?.pertoDe(j.pos) != null)
        dica = mapa.regras.velasDaViuva.umaPorVez
          ? `${F}: acender esta vela (a outra apaga)`
          : `${F}: acender a vela`;
      const fim = !bau ? mapa.regras.fins?.pertoDe(j.pos) : null;
      if (fim) {
        const f = mapa.regras.fins!.fins[fim.fim]!;
        dica =
          f.tipo === 'poco'
            ? `${F}: jogar ${mapa.regras.fins!.precoDoPoco} doces no Poço dos Desejos`
            : `${F}: acender a vela`;
      }
    }
    if (dica) this.interacao = { texto: dica, ate: this.time.now + 120 };
  }

  /** A porta da Casa Desconfiada abriu: a rua para e o minijogo abre por cima. */
  private abrirDesafio(): void {
    const exploracao = this.sessao.mapa.regras?.exploracao;
    const minijogo = exploracao?.minijogo;
    if (!minijogo || this.janelaAberta) return;
    const dados: DadosDesafio = {
      minijogo,
      origem: exploracao.estado.desafio?.origem ?? 'desconfiada',
      aoFechar: () => {
        this.janelaAberta = false;
      },
      automatico: () => this.minijogoAutomatico,
    };
    this.janelaAberta = true;
    this.entrada.tirarPedidos();
    this.scene.launch('CenaDesafio', dados);
  }

  private abrirJanela(): void {
    const run = this.sessao.run;
    const p = this.pertoDe;
    if (!run || !p || this.janelaAberta) return;
    const dados: DadosPorta = {
      run,
      tipo: p.tipo,
      casa: p.tipo === 'casa' ? p.casa : undefined,
      aoAceitar: (precos) => this.mostrarPrecoDoTrato(precos),
      aoFechar: () => {
        this.janelaAberta = false;
        this.criarPlacas();
      },
    };
    this.janelaAberta = true;
    this.scene.launch('CenaPorta', dados);
  }

  /**
   * Um baú amaldiçoado foi aberto ou o jogador apertou F no Carrinho de Pipoca: a rua para e a
   * carta do trato (ou a loja do carrinho) abre por cima.
   */
  private abrirOfertaDoBau(): boolean {
    const run = this.sessao.run;
    const tipo = run?.estado.ofertaDoBau
      ? 'bau'
      : run?.estado.lojaDoCarrinho?.aberta
        ? 'carrinho'
        : null;
    if (!run || !tipo) return false;
    const dados: DadosPorta = {
      run,
      tipo,
      aoAceitar: (precos) => this.mostrarPrecoDoTrato(precos),
      aoFechar: () => {
        run.fecharCarrinho();
        this.janelaAberta = false;
      },
    };
    this.janelaAberta = true;
    this.scene.launch('CenaPorta', dados);
    return true;
  }

  /** Uma habilidade chegou ao posto da evolução: a rua para e a escolha abre por cima. */
  private abrirEvolucao(): boolean {
    const { ficha } = this.sessao.mapa.partida;
    const tecla = evolucaoPendente(ficha, tabelaDeEvolucoes, combate.niveis);
    if (!tecla) return false;
    const slot = ficha.lancador.slots[tecla]!;
    const dados: DadosEvolucao = {
      tecla,
      habilidade: { id: slot.def.id, nome: slot.def.nome, forma: slot.def.forma.tipo },
      opcoes: opcoesDeEvolucao(ficha, tecla, tabelaDeEvolucoes, combate.niveis).map((o) => ({
        id: o.evo.id,
        nome: o.evo.nome,
        descricao: o.evo.descricao,
      })),
      despertar: tecla === 'R',
      ...(this.sessao.dicaDeUmaVez?.('evolucao') ? { dica: dicas.evolucao } : {}),
      escolher: (id) => {
        escolherEvolucao(ficha, tecla, id, tabelaDeEvolucoes, combate.niveis);
        this.janelaAberta = false;
      },
    };
    this.janelaAberta = true;
    this.scene.launch('CenaEvolucao', dados);
    return true;
  }

  /**
   * A atmosfera da noite por cima da rua (visual.json → luzNaTela.atmosfera): uma névoa azul leve
   * em toda a tela e as bordas mais escuras. Fica parada na tela e cobre ela em qualquer zoom.
   */
  private atualizarAtmosfera(): void {
    const cam = this.cameras.main;
    if (!this.atmosfera) {
      const chave = 'atmosfera';
      if (!this.textures.exists(chave)) {
        const { neblina, bordas } = visual.luzNaTela.atmosfera;
        const W = 512;
        const H = 288;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.globalAlpha = neblina.alfa;
        ctx.fillStyle = neblina.cor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        const raio = Math.hypot(W, H) / 2;
        const g = ctx.createRadialGradient(W / 2, H / 2, raio * 0.45, W / 2, H / 2, raio);
        const rgba = (cor: string, a: number) => {
          const n = Number.parseInt(cor.slice(1), 16);
          return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
        };
        g.addColorStop(0, rgba(bordas.cor, 0));
        g.addColorStop(1, rgba(bordas.cor, bordas.alfa));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        this.textures.addCanvas(chave, canvas);
      }
      this.atmosfera = this.add
        .image(0, 0, chave)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(PROFUNDIDADE_PLACA - 10);
    }
    const { width, height } = this.scale;
    this.atmosfera
      .setVisible(this.cenario.noite)
      .setPosition(width / 2, height / 2)
      .setDisplaySize(width / cam.zoom + 4, height / cam.zoom + 4);
  }

  override update(tempo: number, delta: number): void {
    this.medidor.iniciarQuadro();
    const { mapa } = this.sessao;
    const { mundo } = mapa.partida;
    if (this.preparando) {
      this.entrada.tirarPedidos();
      this.medidor.etapa('figurasIniciais', () => this.vista.sincronizar(mundo, 1, 0));
      this.medidor.etapa('decoracaoInicial', () => this.atualizarVida(tempo, 0));
      this.medidor.etapa('preparacao', () => this.cenario.atualizar(tempo, true));
      this.quadrosPreparados = this.cenario.preparada ? this.quadrosPreparados + 1 : 0;
      if (this.quadrosPreparados >= visual.desempenho.quadrosDeAcomodacao) {
        this.preparando = false;
        this.estado.pronta = true;
        this.estado.preparacaoInicial = this.cenario.preparacao;
        if (this.titulo) this.titulo.ate = tempo + AVISO_MS;
        this.medidor.pronta();
        this.cameras.main.fadeIn(visual.interface.animacao.abrirMs, 0, 0, 0);
      }
      this.publicar();
      this.medidor.concluirQuadro(true);
      return;
    }
    this.atualizarAtmosfera();
    const deltaJogavel = this.pausaImpacto.tempoJogavel(delta);
    this.textoDaDica = this.dicasDaRua?.atualizar(tempo / 1000, mapa.partida.jogador.pos) ?? null;
    if (mixer.ligado !== this.somLigado) {
      this.somLigado = mixer.ligado;
      this.aviso = {
        texto: mixer.ligado ? 'Som ligado (M)' : 'Som desligado (M)',
        ate: tempo + 900,
      };
    }
    // Também consome eventos externos ao tick (depuração e interações da interface).
    this.consumirEventos();
    this.atualizarRevelacaoDoTrato();
    if (!this.janelaAberta && this.fimEm === null && !this.abrirOfertaDoBau()) this.abrirEvolucao();
    this.painelDev?.aplicarInterruptores();
    if (this.janelaAberta || this.painelDev?.interruptores.pausado) {
      // A janela da porta (ou a pausa do modo dev) está aberta: a rua espera, e as teclas não
      // viram comando.
      this.entrada.tirarPedidos();
    } else if (this.fimEm === null || this.passagem?.modo === 'saindo') {
      if (this.passagem) this.andarSozinha();
      else this.lerEntrada();
      const ticks = this.pausaImpacto.restanteMs > 0 ? 0 : this.passoFixo.avancar(deltaJogavel);
      for (let i = 0; i < ticks; i++) {
        passo(mundo);
        this.consumirEventos();
        // Uma escolha que para a rua (baú amaldiçoado, Carrinho) para os ticks deste quadro também.
        const r = this.sessao.run?.estado;
        if (r?.ofertaDoBau || r?.lojaDoCarrinho?.aberta || this.pausaImpacto.restanteMs > 0) break;
        // O minijogo da Casa Desconfiada abriu: a rua para já neste quadro.
        if (this.janelaAberta) break;
      }
      if (!this.passagem) this.dicaDeInteracao();
    }
    this.consumirEventos();
    this.aplicarTremor();

    const dtS = delta / 1000;
    this.medidor.etapa('entidades', () => this.vista.sincronizar(mundo, this.passoFixo.alfa, dtS));
    this.medidor.etapa('decoracao', () => this.atualizarVida(tempo, dtS));
    this.medidor.etapa('luzes', () => this.atualizarLuzes(tempo));
    this.atualizarNeblina();
    this.seguirComCamera(dtS);
    this.medidor.etapa('efeitos', () => this.desenharCombate(dtS));
    this.desenharCanal();
    this.desenharMarcasDeInteracao();
    this.atualizarMarcador(delta);
    this.atualizarPlacasDePerto();
    this.mirandoNoQuadro = this.entrada.teclaMirando !== null;
    this.janelaNoQuadro = this.janelaAberta;
    this.medidor.etapa('cenario', () => this.cenario.atualizar(tempo));
    this.publicar();
    this.verificarFim();
    this.desenharIris();
    this.medidor.concluirQuadro(this.janelaAberta || !!this.painelDev?.interruptores.pausado);
  }

  /** Modo desenvolvedor (F1): liga o painel de balanceamento a esta rua (docs/PLANO_MUNDO_VIVO.md). */
  private ligarModoDev(): void {
    if (!devDisponivel()) return;
    const painel = PainelDev.obter();
    const partida = () => this.sessao.mapa.partida;
    const alvo: AlvoDoPainel = {
      campeaoId: () => partida().ficha.campeaoId,
      mundo: () => partida().mundo,
      heroi: () => partida().jogador,
      atalhos: {
        curar: () => {
          const c = partida().jogador.combate;
          if (c) Object.assign(c, { coragem: c.attr.coragemMax, energia: c.attr.energiaMax });
        },
        matarInimigos: () => {
          const { mundo, jogador } = partida();
          for (const e of inimigosDe(mundo, jogador.tipo)) {
            if (!vivo(e) || e.combate?.chefe) continue;
            if (Math.hypot(e.pos.x - jogador.pos.x, e.pos.y - jogador.pos.y) > 12) continue;
            causarDano(mundo, e, {
              origem: jogador.id,
              bruto: 1e7,
              tipo: 'habilidade',
              verdadeiro: true,
            });
          }
        },
        derrubarPostes: () => (this.estado['derrubarPostes'] as () => void)(),
        irAoPortao: () => {
          const s = this.sessao.mapa.regras?.gerada.saida;
          if (s)
            (this.estado['levarJogador'] as (x: number, y: number) => void)(
              (s.x0 + s.x1) / 2,
              s.y1 + 1.5,
            );
        },
        ferirChefe: () => (this.estado['ferirChefe'] as (f: number) => void)(0.5),
        doces: () => {
          const bolso = this.sessao.run?.bolso;
          if (bolso) bolso.doces += 500;
        },
        subirNivel: () => {
          const { mundo, jogador, ficha } = partida();
          const p = ficha.progresso;
          darXp(mundo, jogador, ficha, xpParaSubir(p.nivel, combate.niveis) - p.xp, combate);
        },
      },
    };
    alvo.teste = this.testeDaRua();
    painel.ligar(alvo);
    this.painelDev = painel;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => painel.desligar(alvo));
  }

  /** Aba Testar do modo dev: inimigos, minijogos e Casas Desconfiadas desta rua. */
  private testeDaRua(): TesteDaRua | undefined {
    this.casasAcordadas = new Set();
    const regras = this.sessao.mapa.regras;
    if (!regras) return undefined;
    const partida = () => this.sessao.mapa.partida;
    const casas = () => regras.exploracao?.estado.desconfiadas ?? [];
    const sorteados = casas().map((d) => d.minijogo);
    let forcado: TipoMinijogo | null = null;
    const raioRecusa = exploracao.desconfiada.raioRecusa;
    const afastar = (raio: number) => (this.estado['afastarInimigos'] as (r: number) => void)(raio);
    return {
      criarInimigos: (especie, n) => {
        const { mundo, jogador: j } = partida();
        for (let k = 0; k < n; k++) {
          if (inimigos.inimigos[especie]?.elite) {
            regras.nascerElite(mundo, especie, false);
            continue;
          }
          const a = (k / n) * Math.PI * 2;
          const p = { x: j.pos.x + Math.cos(a) * 3.5, y: j.pos.y + Math.sin(a) * 3.5 };
          regras.criarInimigo(mundo, especie, regras.chaoLivre(p) ? p : { ...j.pos });
        }
      },
      afastarInimigos: () => afastar(12),
      minijogoAvulso: (tipo) => {
        if (this.janelaAberta) return;
        const { mundo, jogador } = partida();
        this.minijogosAvulsos++;
        const minijogo = new Minijogo(
          tipo,
          exploracao.desconfiada.minijogos,
          (mundo.tick * 7919 + this.minijogosAvulsos * 104729) >>> 0,
          mundo.dt,
          {
            bairro: this.sessao.run?.estado.bairro ?? 0,
            fantasia: jogador.especie,
            fantasias: Object.keys(campeoes),
          },
        );
        const dados: DadosDesafio = {
          minijogo,
          origem: 'desconfiada',
          aoFechar: () => {
            this.janelaAberta = false;
            const r = minijogo.resultado ?? 'erro';
            this.aviso = {
              texto: `Minijogo avulso: ${exploracao.desconfiada.textos[r]}`,
              ate: this.time.now + AVISO_MS,
            };
          },
          automatico: () => this.minijogoAutomatico,
        };
        this.janelaAberta = true;
        this.entrada.tirarPedidos();
        this.scene.launch('CenaDesafio', dados);
      },
      casas,
      acordada: (i) => this.casasAcordadas.has(i),
      irACasa: (i) => {
        const d = casas()[i];
        if (!d) return;
        (this.estado['levarJogador'] as (x: number, y: number) => void)(d.x, d.y);
        afastar(raioRecusa + 1);
      },
      rearmarCasas: () => {
        casas().forEach((d, i) => {
          if (!d.batida || this.casasAcordadas.has(i) || regras.exploracao?.estado.desafio) return;
          d.batida = false;
          d.resultado = null;
          d.semente = (d.semente * 1103515245 + 12345) >>> 0;
          this.cenario.mostrarGrupo(`desconfiada:${i}`);
        });
      },
      forcarMinijogo: (tipo) => {
        forcado = tipo;
        casas().forEach((d, i) => (d.minijogo = tipo ?? sorteados[i]!));
      },
      minijogoForcado: () => forcado,
      perdaoGasto: () => this.sessao.run?.estado.desconfiadaPerdoada ?? false,
      alternarPerdao: () => {
        const run = this.sessao.run;
        if (run) run.estado.desconfiadaPerdoada = !run.estado.desconfiadaPerdoada;
      },
    };
  }

  /** A run acabou: a tela do fim abre por cima da rua parada. */
  private abrirFimDaRun(resumo: ResumoDaRun): void {
    this.janelaAberta = true;
    const novidades = this.sessao.novidades ?? null;
    this.estado.fimDaRun = { venceu: resumo.venceu, faltou: resumo.faltou, novidades };
    const dados: DadosFimDaRun = {
      resumo,
      novidades,
      rumo: this.sessao.rumo ?? null,
      novaRun: () => {
        marcarInicioDaRun();
        this.sessao.recomecar?.();
        this.scene.restart();
      },
      aoMostrarBotoes: () => {
        this.estado.fimDaRun = {
          venceu: resumo.venceu,
          faltou: resumo.faltou,
          novidades,
          botoes: true,
        };
      },
      titulo: () => {
        this.registry.remove('sessao');
        this.scene.stop('CenaInterface');
        this.scene.start('CenaTitulo');
      },
    };
    this.scene.launch('CenaFimDaRun', dados);
  }

  private verificarFim(): void {
    const { regras, porta } = this.sessao.mapa;
    if (this.sessao.resumo) return;
    if (this.fimEm !== null) {
      if (this.time.now >= this.fimEm) {
        this.fimEm = null;
        const venceu = porta ? true : (regras?.estado.venceu ?? false);
        // O mapa novo abre com a passagem (só quando ela fechou a tela neste).
        if (this.passagem) this.registry.set('passagem', true);
        if (this.sessao.aoTerminar?.(venceu)) this.scene.restart();
        else {
          this.registry.remove('passagem');
          this.passagem = null;
          this.desenharIris();
          if (this.sessao.resumo) this.abrirFimDaRun(this.sessao.resumo);
        }
      }
      return;
    }
    if (porta?.regras.saiu) {
      const run = this.sessao.run;
      const recusou = (run?.estado.porta?.aceitos ?? 1) === 0;
      this.titulo = {
        texto: recusou ? 'Bom vizinho! +80 doces e uma Medalha' : 'Para a próxima rua...',
        ate: this.time.now + PAUSA_PORTA_MS * 2,
      };
      this.iniciarPassagem(PAUSA_PORTA_MS * (recusou ? 2 : 1));
      this.estado.fim = 'porta';
      return;
    }
    if (!regras) return;
    if (regras.estado.venceu || regras.estado.derrota) {
      const venceu = regras.estado.venceu;
      this.titulo = {
        texto: venceu
          ? regras.estado.chefe
            ? this.sessao.run && this.sessao.run.estado.bairro >= this.sessao.run.totalDeBairros - 1
              ? 'O último chefe caiu!'
              : 'Chefe vencido! O próximo bairro espera.'
            : 'Rua vencida!'
          : 'A Coragem acabou...',
        ate: this.time.now + visual.interface.pausaFimMs,
      };
      if (venceu) this.iniciarPassagem(0);
      else this.fimEm = this.time.now + visual.interface.pausaFimMs;
      mixer.vinheta(venceu ? 'vitoria' : 'derrota');
      this.estado.fim = venceu ? 'vitoria' : 'derrota';
    }
  }

  /** Começa a passagem para o próximo mapa: ela segue andando e a tela fecha no fim. */
  private iniciarPassagem(minimoMs: number): void {
    const agora = this.time.now;
    const ms = Math.max(visual.interface.passagem.andarMs, minimoMs);
    this.passagem = { modo: 'saindo', inicio: agora, fim: agora + ms };
    this.fimEm = agora + ms;
    this.protegerNaPassagem(true);
  }

  /** Trilha do chefe na arena dele; na rua, a música engrossa quando há briga perto. */
  private atualizarMusica(): void {
    const { regras, partida } = this.sessao.mapa;
    const chefe = regras?.estado.chefe;
    mixer.trilha(chefe && vivo(chefe) ? 'chefe' : 'rua');
    const cfg = audio.musica.combate;
    const j = partida.jogador;
    let perto = 0;
    for (const e of partida.mundo.entidades) {
      if (e.tipo !== 'inimigo' || !vivo(e)) continue;
      if (Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) <= cfg.raioTiles) perto++;
      if (perto >= cfg.minimo) break;
    }
    mixer.intensidade(perto >= cfg.minimo ? 1 : 0);
  }

  private atualizarLuzes(tempo: number): void {
    const { mapa } = this.sessao;
    // O jogador não leva luz própria: só o pulso da lanterna (Espaço) acende em volta dele.
    if (mapa.luz && mapa.luz.versao !== this.versaoLuz) {
      this.versaoLuz = mapa.luz.versao;
      this.cenario.definirLuzes(luzesParaTela(mapa.luz));
    }
    const postes = mapa.partida.mundo.entidades
      .filter((e) => e.especie === 'poste_corrompido' && vivo(e))
      .map((e) => ({ pos: e.pos, indice: Number(e.marcas?.indice ?? 0) }));
    this.cenario.desenharHalosCorrompidos(postes, tempo);
    // Casas ficam transparentes com o jogador ou inimigos atrás delas.
    const pontos = mapa.partida.mundo.entidades
      .filter((e) => (e.tipo === 'jogador' || e.tipo === 'inimigo') && vivo(e))
      .slice(0, 30)
      .map((e) => {
        const p = this.vista.posDesenhada(e.id) ?? e.pos;
        return { tela: paraTela({ ...p, z: 16 }, this.cenario.iso), profundidade: p.x + p.y };
      });
    this.cenario.atualizarOclusao(pontos, this.game.loop.delta / 1000);
  }

  /** O que a simulação contou desde o último quadro. */
  private consumirEventos(): void {
    const { mundo, jogador: j } = this.sessao.mapa.partida;
    const eventos = mundo.eventos;
    // A música segue a rua mesmo sem nada acontecendo (rua calma, sem eventos no quadro).
    this.atualizarMusica();
    if (eventos.length === 0) return;
    mundo.eventos = [];
    const impacto = respostaDeImpacto(eventos, j.id, visual.combateNaTela);
    this.pausaImpacto.iniciar(impacto.pausaS);
    this.tremorPendentePx = Math.max(this.tremorPendentePx, impacto.tremorPx);
    if (impacto.posteCaiu) this.cenario.clarearAposPoste();
    const frenesi = (this.sessao.mapa.regras?.bolso.susto.frenesi ?? 0) > 0;
    mixer.tocarPedidos(
      sonsDosEventos(
        eventos,
        {
          jogador: j.id,
          campeao: this.sessao.mapa.partida.ficha.campeaoId,
          agoraS: this.time.now / 1000,
          familiaDoAtaque: (id, chave) =>
            familiaDoAtaque(this.sessao.mapa.partida.mundo, id, chave),
        },
        this.sequenciaDeAcertos,
        audio,
      ),
    );
    this.dicasDaRua?.consumir(eventos, j.id);
    if (!this.sustoExplicado && eventos.some((e) => e.tipo === 'susto' && e.delta > 0)) {
      this.sustoExplicado = true;
      if (this.sessao.dicaDeUmaVez?.('susto'))
        this.dicaDaVez = { texto: dicas.susto, ate: this.time.now + dicas.linhaS * 1000 };
    }
    this.vista.consumir(eventos);
    this.efeitos.consumir(eventos, { jogador: j.id, frenesi });
    const agora = this.time.now;
    for (const ev of eventos) {
      switch (ev.tipo) {
        case 'dano':
          (this.estado.danos as number)++;
          break;
        case 'objetoAtingido':
          this.cenario.tremerObjeto(ev.objeto);
          break;
        case 'objetoVirou':
          this.cenario.ocultarObjeto(ev.objeto);
          break;
        case 'objetoVoltou':
          this.cenario.mostrarObjeto(ev.objeto);
          break;
        case 'desafioIniciado':
          this.abrirDesafio();
          break;
        case 'desafioResultado': {
          this.cenario.ocultarGrupo(`desconfiada:${ev.indice}`);
          const item = ev.item ? ` + ${cfgItens.itens[ev.item]?.nome ?? ev.item}` : '';
          const doces = ev.doces > 0 ? ` +${ev.doces} doces${item}` : '';
          this.aviso = { texto: `${ev.texto}${doces}`, ate: agora + AVISO_MS * 1.4 };
          if (ev.resultado === 'erro' && !ev.perdoado) {
            this.casasAcordadas.add(ev.indice);
            mixer.tocar('casaAcordou');
            this.tremorPendentePx = Math.max(
              this.tremorPendentePx,
              visual.combateNaTela.tremor.explosaoPx,
            );
          }
          break;
        }
        case 'quebrou':
          if (ev.grupo) this.cenario.ocultarGrupo(ev.grupo);
          else if (ev.objeto >= 0) this.cenario.ocultarObjeto(ev.objeto);
          (this.estado.quebrados as number)++;
          break;
        case 'lancou':
          if (ev.id === j.id) (this.estado.lancou as string[]).push(ev.tecla);
          break;
        case 'recusado':
          if (ev.id === j.id) {
            (this.estado.recusou as string[]).push(`${ev.tecla}:${ev.motivo}`);
            if (ev.motivo === 'energia') this.aviso = { texto: 'Sem Energia', ate: agora + 700 };
          }
          break;
        case 'ataqueAuto':
        case 'golpeou':
          if (ev.id === j.id) (this.estado.ataques as number)++;
          break;
        case 'onda':
          this.aviso = { texto: `Onda ${ev.numero}!`, ate: agora + AVISO_MS };
          break;
        case 'portaoAbriu':
          this.cenario.ocultarGrupo(ev.grupo ?? 'portao');
          this.aviso = {
            texto: ev.grupo
              ? 'A rua interditada abriu! Siga o caminho.'
              : 'O portão abriu! Siga até o largo da saída.',
            ate: agora + AVISO_MS * 2,
          };
          break;
        case 'campainha': {
          this.cenario.ocultarGrupo(`campainha:${ev.indice}`);
          const textos: Record<typeof ev.resultado, string> = {
            doces: 'Gostosura! O morador deu doces.',
            item: `O morador deu: ${cfgItens.itens[ev.texto]?.nome ?? ev.texto}`,
            travessura: 'Travessura! Vença as pestinhas da porta pelo prêmio!',
            historia: `"${ev.texto}"`,
            fechada: ev.texto,
          };
          this.aviso = {
            texto: textos[ev.resultado],
            ate: agora + AVISO_MS * (ev.resultado === 'historia' ? 2.2 : 1.2),
          };
          break;
        }
        case 'travessuraVencida': {
          const item = ev.item ? `, ${cfgItens.itens[ev.item]?.nome ?? ev.item}` : '';
          this.aviso = {
            texto: `Travessura vencida! +${ev.doces} doces${item}`,
            ate: agora + AVISO_MS * 1.5,
          };
          break;
        }
        case 'luzesApagadas':
          // Postes ficam cinza, sem halo; casas com as janelas apagadas.
          for (const i of ev.objetos) {
            const o = this.sessao.mapa.rua.objetos[i];
            if (!o) continue;
            if (o.modelo === 'poste') this.cenario.trocarObjeto(i, { ...o, estado: 'apagado' });
            // As outras luzes são janelas: o objeto é uma casa.
            else this.cenario.trocarObjeto(i, { ...o, apagada: true } as typeof o);
          }
          break;
        case 'encontro': {
          const textos: Record<string, Partial<Record<typeof ev.situacao, string>>> = {
            crianca_perdida: {
              ativo: 'Uma criança perdida! Leve-a até o portão sem que ninguém a acerte.',
              cumprido: 'A criança voltou para casa: +150 doces e uma Medalha de Bom Vizinho.',
              falhou: 'A criança se assustou e fugiu correndo.',
            },
            festa_na_garagem: { ativo: 'Festa na Garagem! Essas pestinhas valem o triplo.' },
            carrinho_de_pipoca: {
              ativo: 'O Carrinho de Pipoca chegou! F para comprar, por 30 s.',
              cumprido: 'O Carrinho de Pipoca foi embora.',
            },
          };
          const texto = textos[ev.encontro]?.[ev.situacao];
          if (texto) this.aviso = { texto, ate: agora + AVISO_MS * 1.5 };
          break;
        }
        case 'bauRevelado':
          if (ev.tipoBau !== 'comum')
            this.aviso = {
              texto:
                ev.tipoBau === 'raro'
                  ? 'Um baú raro! Fita roxa na tampa.'
                  : 'Um baú amaldiçoado... ele treme.',
              ate: agora + AVISO_MS,
            };
          break;
        case 'posteReligado': {
          const o = this.sessao.mapa.rua.objetos[ev.objeto];
          if (o?.modelo === 'poste')
            this.cenario.trocarObjeto(ev.objeto, { ...o, estado: 'amigo' });
          this.aviso = { texto: 'Poste religado! A luz dele cura.', ate: agora + AVISO_MS };
          break;
        }
        case 'vela': {
          const o = this.sessao.mapa.rua.objetos[ev.objeto];
          if (o?.modelo === 'vela')
            this.cenario.trocarObjeto(ev.objeto, { ...o, apagada: !ev.acesa });
          break;
        }
        case 'desejo':
          this.aviso = { texto: 'O poço atendeu o desejo!', ate: agora + AVISO_MS };
          break;
        case 'desafioVencido':
          this.aviso = {
            texto:
              ev.desafio === 'velas'
                ? 'As três velas acesas! Doces e XP.'
                : 'A casa sossegou. Um baú apareceu.',
            ate: agora + AVISO_MS,
          };
          break;
        case 'segredo':
          this.aviso = {
            texto: `Abóbora Dourada! ${ev.achados}/${ev.total}`,
            ate: agora + AVISO_MS,
          };
          break;
        case 'mirante':
          this.aviso = {
            texto: "Do alto da caixa-d'água dá para ver o bairro (Tab abre o mapa).",
            ate: agora + AVISO_MS * 2,
          };
          break;
        case 'descoberta':
          this.aviso = {
            texto: `Explorou ${Math.round(ev.fracao * 100)}% do bairro: doces e XP!`,
            ate: agora + AVISO_MS,
          };
          break;
        case 'canalCancelado':
          this.aviso = { texto: 'Interrompido: fique parado até terminar.', ate: agora + 900 };
          break;
        case 'posteCaiu':
          this.aviso = { texto: 'Um Poste Corrompido caiu!', ate: agora + AVISO_MS };
          break;
        case 'frenesi':
          if (ev.ativo) this.aviso = { texto: 'FRENESI!', ate: agora + AVISO_MS };
          break;
        case 'nivel':
          this.aviso = {
            texto: `Nível ${ev.nivel}! ${rotuloDaAcao('subirPosto')} ${usandoControle() ? 'botão' : 'tecla'} da habilidade para subir uma`,
            ate: agora + AVISO_MS,
          };
          break;
        case 'aviso':
          this.aviso = { texto: ev.texto, ate: agora + AVISO_MS };
          break;
        case 'faseChefe':
          if (ev.fase > 1)
            this.aviso = { texto: `${ev.nome}: fase ${ev.fase}!`, ate: agora + AVISO_MS };
          else {
            // Entrada do chefe: o nome dele em letras grandes e a câmera vai até ele um instante.
            const cfg = visual.camera.entradaDoChefe;
            this.titulo = { texto: ev.nome, ate: agora + cfg.tituloMs };
            this.focoNoChefeAte = agora + cfg.focoMs;
          }
          break;
        case 'pedidoCumprido':
          this.aviso = {
            texto: 'Pedido cumprido! A recompensa vem na próxima porta.',
            ate: agora + AVISO_MS,
          };
          break;
        case 'bauAberto':
          this.aviso = { texto: `Baú aberto: +${ev.doces} doces!`, ate: agora + AVISO_MS };
          break;
        default:
          break;
      }
    }
  }

  private aplicarTremor(): void {
    const cam = this.cameras.main;
    if (!cam.shakeEffect.isRunning) this.tremorAtualPx = 0;
    if (this.tremorPendentePx > 0 && this.tremorPendentePx >= this.tremorAtualPx) {
      this.tremorAtualPx = this.tremorPendentePx;
      const i = intensidadeEmPixels(this.tremorAtualPx, cam.width, cam.height, cam.zoom);
      cam.shake(visual.combateNaTela.tremor.duracaoMs, new Phaser.Math.Vector2(i.x, i.y), true);
    }
    this.tremorPendentePx = 0;
  }

  private mostrarPrecoDoTrato(precos: string[]): void {
    const cfg = visual.combateNaTela.trato;
    const texto =
      precos.length > 0
        ? cfg.textoPreco.replace(
            '{precos}',
            precos.map((id) => cfgPrecos.precos[id]?.bairro ?? id).join(' · '),
          )
        : cfg.textoSemPreco;
    this.revelacaoTrato = { inicio: this.time.now, zoom: this.cameras.main.zoom, texto };
    this.precoNaHora(precos);
  }

  /**
   * O preço aparece no bairro na hora (só tela; a regra vale nas próximas ruas): a casa de quem
   * vendeu o trato apaga as janelas, o ícone do preço sobe dela e, nos preços de luz, os postes
   * perto apagam.
   */
  private precoNaHora(precos: string[]): void {
    if (precos.length === 0) return;
    const cfg = visual.combateNaTela.trato;
    const j = this.sessao.mapa.partida.jogador;
    const casa = this.cenario.apagarCasaPerto(j.pos, cfg.raioCasa) ?? j.pos;
    const efeitos = precos.flatMap((id) => cfgPrecos.precos[id]?.efeitos ?? []);
    let postes = 0;
    if (efeitos.some((e) => e.tipo === 'ruaSemLuz'))
      postes = this.cenario.apagarPostesPerto(j.pos, cfg.postesRuaSemLuz, cfg.raioPostes);
    else if (efeitos.some((e) => e.tipo === 'postesApagados'))
      postes = this.cenario.apagarPostesPerto(j.pos, 1, cfg.raioPostes);
    this.estado.precoNaHora = { casa: casa !== j.pos, postes, precos };
    const topo = paraTela({ ...casa, z: visual.alturaAndarPx * 2 }, this.cenario.iso);
    precos.forEach((id, i) => {
      const x = topo.x + (i - (precos.length - 1) / 2) * cfg.iconeLadoPx;
      const icone = imagemDaArte(this, 'preco', id, x, topo.y, cfg.iconeLadoPx);
      if (!icone) return;
      icone.setDepth(1e6);
      this.tweens.add({
        targets: icone,
        y: topo.y - cfg.sobePx,
        alpha: { from: 1, to: 0 },
        duration: cfg.iconeS * 1000,
        ease: 'Sine.easeOut',
        onComplete: () => icone.destroy(),
      });
    });
    this.tremorPendentePx = Math.max(this.tremorPendentePx, visual.combateNaTela.tremor.explosaoPx);
  }

  private atualizarRevelacaoDoTrato(): void {
    const r = this.revelacaoTrato;
    if (!r) return;
    const cfg = visual.combateNaTela.trato;
    const t = Math.min(1, (this.time.now - r.inicio) / (cfg.duracaoS * 1000));
    this.cameras.main.setZoom(r.zoom * (1 - (1 - cfg.fatorZoom) * Math.sin(Math.PI * t)));
    if (t >= 1) this.revelacaoTrato = null;
  }

  private desenharCombate(dtS: number): void {
    const { partida, regras } = this.sessao.mapa;
    const j = partida.jogador;
    const l = j.lancador!;
    const t = this.entrada.teclaMirando;
    this.efeitos.atualizar({
      alfa: this.passoFixo.alfa,
      dtS,
      mundo: partida.mundo,
      habilidades: partida.executor.estado,
      mira: t ? { def: l.slots[t]!.def, origem: j.pos, cursor: this.miraAtual(t) } : null,
      jogador: j.id,
      frenesi: (regras?.bolso.susto.frenesi ?? 0) > 0,
    });
  }

  /**
   * Para onde o controle mira: o analógico direito; sem ele, para onde a personagem anda (ou olha,
   * parada). Null quando quem joga está no mouse.
   */
  private direcaoDoControle(): V2 | null {
    const dir = this.entrada.analogicoDireito();
    if (dir) return dir;
    if (!this.entrada.usandoControle) return null;
    const andando = this.entrada.direcao();
    if (Math.hypot(andando.x, andando.y) > 0) return andando;
    const o = this.sessao.mapa.partida.jogador.olhar;
    return Math.hypot(o.x, o.y) > 0 ? o : { x: 1, y: 0 };
  }

  /** O ponto da mira no chão: o cursor, ou à frente da personagem no controle (com assistência). */
  private pontoDaMira(alcance = controles.controle.miraAFrente): V2 {
    const dir = this.direcaoDoControle();
    if (!dir) return this.entrada.cursor();
    const { partida } = this.sessao.mapa;
    const j = partida.jogador;
    const alvos = inimigosDe(partida.mundo, j.tipo).map((e) => e.pos);
    return assistenciaDeMira(j.pos, dir, alvos, alcance, combate.assistenciaMiraGraus);
  }

  /** Para onde a habilidade mira: o cursor, ou o analógico direito com assistência. */
  private miraAtual(tecla: string, dirAnalogico?: V2): V2 {
    const { partida } = this.sessao.mapa;
    const j = partida.jogador;
    const analogico = dirAnalogico ?? this.entrada.analogicoDireito();
    const dir = analogico ?? this.direcaoDoControle();
    if (!dir) return this.entrada.cursor();
    const f = j.lancador!.slots[tecla]!.def.forma;
    // Áreas, alvos e cones: a mira automática procura os inimigos (no controle, acertar a área
    // pelo analógico era difícil e ela caía no fim do alcance).
    if (f.tipo === 'area' || f.tipo === 'alvo' || f.tipo === 'cone') {
      const m = controles.controle.miraAutomatica;
      const alvos = inimigosDe(partida.mundo, j.tipo).map((e) => e.pos);
      return miraAutomatica(j.pos, dir, alvos, f.alcance, f.tipo === 'area' ? f.raio : 1, {
        ...m,
        graus: analogico ? m.grausAnalogico : m.graus,
      });
    }
    const alcance = f.tipo === 'linha' ? f.alcance : f.tipo === 'dash' ? f.distancia : 1;
    const alvos = inimigosDe(partida.mundo, j.tipo).map((e) => e.pos);
    return assistenciaDeMira(j.pos, dir, alvos, alcance, combate.assistenciaMiraGraus);
  }

  /** Números de combate para os testes do Playwright. */
  private publicar(): void {
    const { partida, regras } = this.sessao.mapa;
    const { jogador: j, bonecos, executor, mundo, ficha } = partida;
    const l = j.lancador!;
    this.estado.tick = mundo.tick;
    this.estado.passagem = this.passagem?.modo ?? null;
    this.estado.impacto = {
      pausaMs: this.pausaImpacto.restanteMs,
      tremorPx: this.cameras.main.shakeEffect.isRunning ? this.tremorAtualPx : 0,
      escuridao: this.cenario.opacidadeEscuridao,
      zoom: this.cameras.main.zoom,
      precoDoTrato: this.revelacaoTrato?.texto ?? null,
    };
    this.estado.dica = { passo: this.dicasDaRua?.passo ?? null, texto: this.textoDaDica };
    this.estado.dicaDaVez = this.dicaDaVez?.texto ?? null;
    this.estado.avisos = this.avisos.filter((a) => a.ate > this.time.now).map((a) => a.texto);
    this.estado.interacao =
      this.interacao && this.interacao.ate > this.time.now ? this.interacao.texto : null;
    this.estado.som = {
      ligado: mixer.ligado,
      contexto: mixer.estadoDoContexto,
      tocados: mixer.tocados,
      deArquivo: mixer.tocadosDeArquivo,
      musica: mixer.estadoDaMusica,
    };
    this.estado.jogador = { ...j.pos };
    this.estado.corpo = this.vista.corpoDe(j.id);
    this.estado.destino = j.destino ? { ...j.destino } : null;
    this.estado.energia = j.combate!.energia;
    this.estado.coragem = j.combate!.coragem;
    this.estado.recargas = Object.fromEntries(TECLAS.map((t) => [t, l.slots[t]!.recarga]));
    this.estado.lancando = l.lancando?.chave ?? null;
    this.estado.mirando = this.entrada.teclaMirando;
    this.estado.contagemPassiva = l.contagemPassiva;
    this.estado.bonecos = bonecos.map((b) => ({ ...b.pos, coragem: b.combate!.coragem }));
    this.estado.projeteis = executor.estado.projeteis.length;
    this.estado.areas = executor.estado.areas.length;
    this.estado.dashando = j.forcado !== null;
    this.estado.campeao = ficha.campeaoId;
    this.estado.habilidades = Object.fromEntries(TECLAS.map((t) => [t, l.slots[t]!.def.id]));
    this.estado.nivel = ficha.progresso.nivel;
    this.estado.pontos = ficha.progresso.pontos;
    this.estado.postos = Object.fromEntries(TECLAS.map((t) => [t, l.slots[t]!.posto]));
    if (regras) {
      this.estado.inimigos = mundo.entidades
        .filter((e) => e.tipo === 'inimigo' && vivo(e))
        .map((e) => ({ especie: e.especie, x: e.pos.x, y: e.pos.y, coragem: e.combate!.coragem }));
      this.estado.campainhas = (regras.exploracao?.estado.campainhas ?? []).map((c) => ({
        x: c.x,
        y: c.y,
        tocada: c.tocada,
      }));
      this.estado.desconfiadas = (regras.exploracao?.estado.desconfiadas ?? []).map((c) => ({
        x: c.x,
        y: c.y,
        minijogo: c.minijogo,
        batida: c.batida,
        resultado: c.resultado,
      }));
      const mj = regras.exploracao?.minijogo;
      this.estado.minijogo = mj ? { tipo: mj.tipo, resultado: mj.resultado } : null;
      this.estado.ondas = regras.estado.ondasLancadas;
      this.estado.portaoAberto = regras.estado.portaoAberto;
      this.estado.postesCaidos = regras.estado.postesCaidos;
      this.estado.doces = regras.bolso.doces;
      this.estado.iscas = quantos(regras.bolso, 'doce_isca');
      this.estado.susto = regras.bolso.susto.valor;
      this.estado.luz = j.combate!.luz;
      this.estado.saida = { ...regras.gerada.saida };
      this.estado.saidas = regras.gerada.saidas?.map((r) => ({ ...r })) ?? [];
      this.estado.baus = regras.estado.baus.map((b) => ({ ...b.entidade.pos, aberto: b.aberto }));
      this.estado.selvagens = mundo.entidades
        .filter((e) => ['cao_de_guarda', 'corvo', 'gato_preto'].includes(e.especie) && vivo(e))
        .map((e) => ({ especie: e.especie, x: e.pos.x, y: e.pos.y }));
      this.estado.chefe = regras.chefeNaTela();
      const ch = regras.estado.chefe;
      this.estado.chefePos = ch && vivo(ch) ? { ...ch.pos } : null;
      this.estado.grades = regras.estado.grades.length;
      this.estado.elites = regras.estado.elites
        .filter(vivo)
        .map((e) => ({ especie: e.especie, x: e.pos.x, y: e.pos.y }));
      const ex = regras.exploracao;
      this.estado.exploracao = ex
        ? {
            fracao: ex.fracao(),
            campainhas: ex.estado.campainhas.map((c) => ({ x: c.x, y: c.y, tocada: c.tocada })),
            postes: ex.estado.postes.map((p) => ({ x: p.x, y: p.y, aceso: p.aceso })),
            segredos: ex.estado.segredos.map((sg) => ({ x: sg.x, y: sg.y, achado: sg.achado })),
            mirante: ex.estado.mirante ? { ...ex.estado.mirante } : null,
            canal: ex.estado.canal !== null,
          }
        : null;
      this.estado.rota = regras.gerada.rota;
      this.estado.lugar =
        regras.gerada.zonas.find(
          (z) =>
            j.pos.x >= z.area.x0 &&
            j.pos.x <= z.area.x1 &&
            j.pos.y >= z.area.y0 &&
            j.pos.y <= z.area.y1,
        )?.nome ?? null;
    }
    const run = this.sessao.run;
    if (run) {
      this.estado.fase = run.estado.fase;
      this.estado.semente = run.estado.semente;
      this.estado.lua = run.lua;
      this.estado.moradora = run.estado.moradora;
      this.estado.matiz = Number(j.marcas?.matiz ?? 0);
      this.estado.bairro = run.estado.bairro;
      this.estado.tratos = [...run.estado.tratos];
      this.estado.precos = run.estado.precos.map((p) => p.id);
      this.estado.itens = [...run.estado.itens];
      this.estado.medalhas = run.estado.medalhas;
      this.estado.doces = run.bolso.doces;
      this.estado.relogio = run.relogio();
      this.estado.consumiveis = run.bolso.consumiveis.map((c) => `${c.id}:${c.qtd}`);
      this.estado.rotas = run.estado.rotas.map((r) => r.condicao);
      this.estado.condicao = run.estado.rotaAtual?.condicao ?? null;
      this.estado.pedido = run.estado.pedido;
      this.estado.situacaoPedido = this.sessao.mapa.regras?.estado.pedido ?? null;
      this.estado.nomesItens = run.estado.itens.map((id) => cfgItens.itens[id]?.nome ?? id);
    }
    const porta = this.sessao.mapa.porta;
    this.estado.mapa = porta ? 'porta' : this.sessao.mapa.regras ? 'rua' : 'treino';
    this.estado.janela = this.janelaAberta;
    const pendente = evolucaoPendente(ficha, tabelaDeEvolucoes, combate.niveis);
    this.estado.evolucaoPendente = this.janelaAberta && pendente ? pendente : null;
    this.estado.evolucoes = Object.fromEntries(
      TECLAS.map((t) => [t, ficha.lancador.slots[t]!.evolucao]),
    );
    if (porta) {
      this.estado.porta = {
        casas: porta.gerada.casas.map((c) => ({ ...c.porta, acesa: c.acesa })),
        banco: porta.gerada.banco,
        saida: { ...porta.gerada.saida },
        ofertas: (run?.estado.porta?.ofertas ?? []).map((o) => ({ ...o })),
      };
      this.estado.saida = { ...porta.gerada.saida };
    }
  }

  /** Transforma a entrada em comandos (a fila vale no próximo tick). */
  /** A parte fixa do mapa da interface (refeita só quando a rua muda). */
  private mapaFixo: Omit<DadosMapa, 'entidades' | 'saida' | 'centro' | 'nevoa'> | null = null;

  /** Mapa da rua para a interface: chão, casas, quintais e quem está onde. */
  private dadosDoMapa(): DadosMapa | null {
    const { mapa } = this.sessao;
    const { rua, regras } = mapa;
    if (!this.mapaFixo || this.mapaFixo.chave !== rua.id) {
      // O mapa enquadra a rota (as zonas com nome), não o mundo inteiro.
      const zonas = regras?.gerada.zonas ?? [];
      const folga = 4;
      const area =
        zonas.length > 0
          ? {
              x0: Math.max(0, Math.min(...zonas.map((z) => z.area.x0)) - folga),
              y0: Math.max(0, Math.min(...zonas.map((z) => z.area.y0)) - folga),
              x1: Math.min(rua.largura, Math.max(...zonas.map((z) => z.area.x1)) + folga),
              y1: Math.min(rua.profundidade, Math.max(...zonas.map((z) => z.area.y1)) + folga),
            }
          : { x0: 0, y0: 0, x1: rua.largura, y1: rua.profundidade };
      const blocos = rua.objetos
        .filter((o) => MODELOS_NO_MAPA.has(o.modelo))
        .map((o) => {
          const { largura: w, profundidade: d } = modelos[o.modelo].pegada;
          return posicionador(w, d, o.x, o.y, o.rot).pegada;
        });
      this.mapaFixo = {
        chave: rua.id,
        area,
        piso: rua.piso,
        blocos,
        quintais: regras?.gerada.quintais.map((q) => q.area) ?? [],
      };
    }
    const elites = new Set(regras?.estado.elites.map((e) => e.id) ?? []);
    const chefe = regras?.estado.chefe?.id;
    const entidades: DadosMapa['entidades'] = [];
    for (const e of mapa.partida.mundo.entidades) {
      if (e.tipo === 'jogador') entidades.push({ x: e.pos.x, y: e.pos.y, tipo: 'jogador' });
      else if (e.marcas?.bau) {
        if (!regras?.exploracao || regras.exploracao.revelado(e.pos))
          entidades.push({ x: e.pos.x, y: e.pos.y, tipo: 'bau' });
      } else if (e.marcas?.isca) entidades.push({ x: e.pos.x, y: e.pos.y, tipo: 'isca' });
      else if (e.tipo === 'inimigo' && vivo(e)) {
        // Como num radar: inimigos comuns só aparecem perto do jogador (Postes e chefes sempre).
        const longe =
          Math.hypot(e.pos.x - mapa.partida.jogador.pos.x, e.pos.y - mapa.partida.jogador.pos.y) >
          RAIO_DO_RADAR;
        if (longe && e.especie !== 'poste_corrompido' && e.id !== chefe) continue;
        const tipo =
          e.especie === 'poste_corrompido'
            ? 'poste'
            : e.id === chefe
              ? 'chefe'
              : elites.has(e.id)
                ? 'elite'
                : 'inimigo';
        entidades.push({ x: e.pos.x, y: e.pos.y, tipo });
      }
    }
    for (const poste of regras?.estado.postes ?? [])
      if (!vivo(poste)) entidades.push({ x: poste.pos.x, y: poste.pos.y, tipo: 'posteCaido' });
    // Exploração: só aparece no mapa o que já foi revelado (e os segredos, depois de vistos).
    const ex = regras?.exploracao;
    if (ex) {
      const e = ex.estado;
      for (const c of e.campainhas)
        if (!c.tocada && ex.revelado(c)) entidades.push({ x: c.x, y: c.y, tipo: 'campainha' });
      for (const p of e.postes)
        if (!p.aceso && ex.revelado(p)) entidades.push({ x: p.x, y: p.y, tipo: 'posteApagado' });
      for (const sg of e.segredos)
        if (!sg.achado && sg.conhecido) entidades.push({ x: sg.x, y: sg.y, tipo: 'segredo' });
      if (e.mirante && !e.mirante.usado && ex.revelado(e.mirante))
        entidades.push({ x: e.mirante.x, y: e.mirante.y, tipo: 'mirante' });
    }
    const g = regras?.gerada ?? mapa.porta?.gerada;
    const saida = g
      ? {
          x0: g.saida.x0,
          x1: g.saida.x1,
          y: g.ySaida,
          aberta: regras ? regras.estado.portaoAberto : true,
        }
      : null;
    const j = mapa.partida.jogador;
    const nevoa = ex
      ? {
          colunas: ex.estado.colunas,
          linhas: ex.estado.linhas,
          celula: ex.estado.celula,
          vista: ex.estado.vista,
          versao: ex.estado.versao,
        }
      : null;
    return { ...this.mapaFixo, entidades, saida, centro: { ...j.pos }, nevoa };
  }

  /** Ataque básico na direção do cursor (ou do analógico direito). */
  private golpear(dirAnalogico?: V2): void {
    const { mundo, jogador: j } = this.sessao.mapa.partida;
    let dir = dirAnalogico ?? null;
    if (!dir) {
      // No controle, o golpe vai para o inimigo mais perto à frente (a assistência de mira).
      const c = this.pontoDaMira();
      dir = { x: c.x - j.pos.x, y: c.y - j.pos.y };
    }
    enfileirar(mundo, { tipo: 'golpear', id: j.id, ...dir });
  }

  private lerEntrada(): void {
    const { mundo, jogador: j, ficha } = this.sessao.mapa.partida;
    for (const p of this.entrada.tirarPedidos()) {
      switch (p.tipo) {
        case 'habilidade':
          enfileirar(mundo, {
            tipo: 'lancar',
            id: j.id,
            tecla: p.tecla,
            alvo: this.miraAtual(p.tecla, p.dirAnalogico),
          });
          break;
        case 'ponto':
          gastarPonto(ficha, p.tecla, combate);
          break;
        case 'rolar':
          // Rola para onde está andando; parado, para onde olha.
          enfileirar(mundo, { tipo: 'rolar', id: j.id, ...this.entrada.direcao() });
          break;
        case 'golpear':
          this.golpear(p.dirAnalogico);
          break;
        case 'lanterna':
          enfileirar(mundo, { tipo: 'usar', id: j.id, acao: 'lanterna', x: 0, y: 0 });
          break;
        case 'consumivel': {
          const c = this.pontoDaMira();
          enfileirar(mundo, { tipo: 'usar', id: j.id, acao: `consumivel:${p.indice}`, ...c });
          break;
        }
        case 'travessura':
          enfileirar(mundo, { tipo: 'usar', id: j.id, acao: 'travessura', x: 0, y: 0 });
          break;
        case 'interagir':
          if (this.sessao.mapa.porta) this.abrirJanela();
          else enfileirar(mundo, { tipo: 'usar', id: j.id, acao: 'interagir', x: 0, y: 0 });
          break;
        default:
          break;
      }
    }
    // Segurando o botão: um golpe por quadro pedido (a simulação respeita a recarga).
    if (this.entrada.segurandoAtaque) this.golpear();
    // A mira acompanha o cursor, ou a frente da personagem no controle (áreas que seguem a mira);
    // segurando uma habilidade no controle, a mira automática dela (o chão mostra onde vai cair).
    const segurando = this.entrada.teclaMirando;
    const cursor =
      segurando && this.direcaoDoControle() ? this.miraAtual(segurando) : this.pontoDaMira();
    if (
      !this.ultimaMira ||
      Math.hypot(cursor.x - this.ultimaMira.x, cursor.y - this.ultimaMira.y) > 0.2
    ) {
      enfileirar(mundo, { tipo: 'mirar', id: j.id, ...cursor });
      this.ultimaMira = cursor;
    }

    const direcao = this.entrada.direcao();
    if (!iguais(direcao, this.ultimaDirecao)) {
      enfileirar(mundo, { tipo: 'direcao', id: j.id, ...direcao });
      this.ultimaDirecao = direcao;
    }
  }

  /** A câmera alcança o jogador com suavização e olha alguns tiles à frente do movimento. */
  private seguirComCamera(dtS: number): void {
    const j = this.sessao.mapa.partida.jogador;
    const chefe = this.sessao.mapa.regras?.estado.chefe;
    // Na entrada do chefe, a câmera olha para ele e depois volta para o jogador (suavizando).
    const foco = chefe && this.time.now < this.focoNoChefeAte ? chefe : j;
    const pos = this.vista.posDesenhada(foco.id) ?? foco.pos;
    const andou = { x: j.pos.x - j.posAnterior.x, y: j.pos.y - j.posAnterior.y };
    const { iso } = this.cenario;
    const { olharAFrenteTiles, rigidezOlharPorS, rigidezSeguirPorS } = visual.camera;
    const n = Math.hypot(andou.x, andou.y);
    const frente =
      n > 0
        ? paraTela(
            { x: (andou.x / n) * olharAFrenteTiles, y: (andou.y / n) * olharAFrenteTiles, z: 0 },
            iso,
          )
        : { x: 0, y: 0 };
    this.olhar = {
      x: aproximar(this.olhar.x, frente.x, rigidezOlharPorS, dtS),
      y: aproximar(this.olhar.y, frente.y, rigidezOlharPorS, dtS),
    };
    const alvo = paraTela({ ...pos, z: 0 }, iso);
    const camera = this.cameras.main;
    const meio = camera.midPoint;
    this.cenario.enquadrar(camera, {
      x: aproximar(meio.x, alvo.x + this.olhar.x, rigidezSeguirPorS, dtS),
      y: aproximar(meio.y, alvo.y + this.olhar.y, rigidezSeguirPorS, dtS),
    });
  }

  /** Religando um poste ou subindo no mirante: um anel que se fecha sobre o jogador. */
  private desenharCanal(): void {
    const g = this.canalG;
    if (!g) return;
    g.clear();
    const { regras, partida } = this.sessao.mapa;
    const fr = regras?.exploracao?.progressoDoCanal(partida.mundo.tick);
    if (fr === null || fr === undefined) return;
    const pos = this.vista.posDesenhada(partida.jogador.id) ?? partida.jogador.pos;
    const c = paraTela({ ...pos, z: 58 }, this.cenario.iso);
    const r = 11;
    g.fillStyle(0x000000, 0.55).fillCircle(c.x, c.y, r + 3);
    g.lineStyle(3, corNumerica(visual.paleta.luz), 0.3).strokeCircle(c.x, c.y, r);
    g.lineStyle(3, corNumerica(visual.paleta.luz), 1)
      .beginPath()
      .arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + fr * Math.PI * 2)
      .strokePath();
  }

  /** Marca cada porta que dá para usar agora; a que o jogador alcança acende e mostra a tecla. */
  private desenharMarcasDeInteracao(): void {
    if (!this.marcas) return;
    const { mapa } = this.sessao;
    const j = mapa.partida.jogador;
    const marcas: MarcaDeInteracao[] = [];
    if (!this.janelaAberta && !this.passagem && this.fimEm === null) {
      const run = this.sessao.run;
      if (mapa.porta && run) {
        const p = this.pertoDe;
        const { casas, banco } = mapa.porta.regras.gerada;
        casas.forEach((c, i) => {
          if (c.acesa && run.oferta(i))
            marcas.push({ pos: c.porta, perto: p?.tipo === 'casa' && p.casa === i });
        });
        if (banco) marcas.push({ pos: banco, perto: p?.tipo === 'banco' });
      } else {
        const ex = mapa.regras?.exploracao;
        if (ex && !ex.estado.canal) {
          const perto = ex.pertoDe(j.pos);
          const e = ex.estado;
          e.campainhas.forEach((c, i) => {
            if (!c.tocada && ex.revelado(c))
              marcas.push({ pos: c, perto: perto?.acao === 'campainha' && perto.indice === i });
          });
          e.desconfiadas.forEach((c, i) => {
            if (!c.batida && ex.revelado(c))
              marcas.push({ pos: c, perto: perto?.acao === 'desconfiada' && perto.indice === i });
          });
        }
      }
    }
    const pos = this.vista.posDesenhada(j.id) ?? j.pos;
    this.marcas.desenhar(marcas, pos, rotuloDaAcao('interagir'), this.time.now);
    this.estado.marcasDeInteracao = marcas.length;
  }

  private atualizarMarcador(delta: number): void {
    if (!this.marcador || this.marcador.alpha <= 0) return;
    this.marcador.setAlpha(
      Math.max(0, this.marcador.alpha - delta / visual.marcadorDestino.duracaoMs),
    );
  }
}
