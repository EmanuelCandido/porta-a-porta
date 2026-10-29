import { z } from 'zod';
import { ATRIBUTOS } from '../combate';

export const corHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor no formato #RRGGBB');
const opacidade = z.number().min(0).max(1);
const positivo = z.number().positive();

const ponto3 = z.tuple([z.number(), z.number(), z.number()]);

/** Lado do corpo de uma peça: E (esquerda do personagem, +y) ou D (direita, −y). */
const ladoDaPeca = z.enum(['E', 'D']);

/**
 * Uma região da malha, em metros nos eixos dela (frente em +x, esquerda em +y, z para cima): uma
 * caixa ou uma cápsula (segmento de `a` a `b` com `raio`), e o triângulo cujo centro cai nela é da
 * parte; ou, nas malhas montadas em peças (`pecas` no JSON da malha), as peças pelo nome (sem o
 * sufixo .001), só as do `lado` pedido quando ele vem.
 */
const esquemaRegiaoDaMalha = z.union([
  z.object({ caixa: z.object({ min: ponto3, max: ponto3 }).strict() }).strict(),
  z.object({ capsula: z.object({ a: ponto3, b: ponto3, raio: positivo }).strict() }).strict(),
  z
    .object({
      pecas: z.array(z.string()).min(1),
      lado: ladoDaPeca.optional(),
      /** Só as peças da frente (centro em x > 0) ou de trás: as patas de um bicho de quatro. */
      x: z.enum(['frente', 'tras']).optional(),
    })
    .strict(),
]);

/**
 * Pivô de uma parte: um ponto em metros, ou o meio do topo das peças nomeadas (o ombro em cima da
 * manga, o quadril em cima da coxa), só do `lado` pedido.
 */
const esquemaPivo = z.union([
  ponto3,
  z.object({ topoDe: z.array(z.string()).min(1), lado: ladoDaPeca.optional() }).strict(),
]);

/**
 * Parte do corpo de uma malha pronta que gira em volta de `pivo` (ombro, quadril), para a frente
 * (graus positivos) ou para trás: `passoGraus` no ponto mais aberto do passo e `golpeGraus` no golpe.
 * A primeira parte cuja região pega o triângulo fica com ele.
 */
export const esquemaParteDoEsqueleto = z
  .object({
    parte: z.string(),
    regioes: z.array(esquemaRegiaoDaMalha).min(1),
    pivo: esquemaPivo,
    passoGraus: z.number().min(-90).max(90),
    golpeGraus: z.number().min(-120).max(120).default(0),
    /**
     * Em que plano a parte gira: `frente` (para a frente e para trás, como um passo) ou `lado`
     * (para cima e para baixo, como uma asa batendo; graus positivos levantam o lado +y).
     */
    plano: z.enum(['frente', 'lado']).default('frente'),
  })
  .strict();

export const esquemaVisual = z
  .object({
    desempenho: z
      .object({
        chaveQualidade: z.string().min(1),
        qualidadeInicial: z.enum(['leve', 'media', 'alta']),
        trabalhoPorQuadroMs: positivo,
        trabalhoNaPreparacaoMs: positivo,
        folgaEntidadesPx: positivo,
        celulaObjetosTiles: positivo,
        cacheModelosMB: positivo,
        quadrosDeAcomodacao: z.number().int().min(1),
        amostrasPorRua: z.number().int().positive(),
        ruasNoRelatorio: z.number().int().positive(),
        intervaloInterfaceMs: positivo,
        qualidades: z.record(
          z.enum(['leve', 'media', 'alta']),
          z
            .object({
              nome: z.string(),
              /** O que muda nesta qualidade (o painel de Desempenho mostra). */
              descricao: z.string(),
              escalaLuz: z.number().min(0.25).max(1),
              sombrasPorFigura: z.number().int().min(0).max(3),
              direcoesMalha: z.union([z.literal(8), z.literal(16)]),
              particulas: z.number().positive().max(1),
            })
            .strict(),
        ),
        textos: z
          .object({
            titulo: z.string(),
            preparando: z.string(),
            preparandoDetalhe: z.string(),
            qualidade: z.string(),
            proximaRua: z.string(),
            explicacao: z.string(),
            voltar: z.string(),
            navegacao: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Tela: o tamanho de referência e a faixa de larguras lógicas (a altura fica fixa e a largura
     * segue a proporção da janela, sem bordas).
     */
    tela: z.object({
      largura: z.number().int().positive(),
      altura: z.number().int().positive(),
      larguraMin: z.number().int().positive(),
      larguraMax: z.number().int().positive(),
    }),
    tile: z.object({ largura: z.number().int().positive(), altura: z.number().int().positive() }),
    /**
     * Janelas acesas: luz quente e fraca (não branca), cada janela com um dos tons (o mesmo modelo
     * varia de uma janela para a outra) e dividida em vidraças por um caixilho: colunas quando a
     * janela é larga e uma travessa na altura `travessa` (fração da janela), `caixilhoPx` de largura.
     */
    janelasAcesas: z
      .object({
        cores: z.array(corHex).min(1),
        /** Fração das janelas que ficam apagadas (fixo pela posição de cada uma). */
        fracaoApagadas: z.number().min(0).max(1),
        travessa: z.number().min(0.2).max(0.8),
        caixilhoPx: z.number().min(0),
        larguraParaDividir: positivo,
      })
      .strict(),
    /** Altura de um andar; o GDD pede múltiplos de 24 px. */
    alturaAndarPx: z
      .number()
      .int()
      .positive()
      .refine((h) => h % 24 === 0, { message: 'a altura do andar precisa ser múltipla de 24 px' }),
    camera: z
      .object({
        /** Entrada do chefe: o nome dele fica `tituloMs` na tela e a câmera olha para ele `focoMs`. */
        entradaDoChefe: z.object({ tituloMs: positivo, focoMs: positivo }).strict(),
        zoomMin: positivo,
        zoomMax: positivo,
        zoomInicial: positivo,
        passoZoomRoda: positivo,
        velocidadePreviaPxPorS: positivo,
        /** Quão rápido a câmera alcança o jogador (1/s; maior = mais grudada). */
        rigidezSeguirPorS: positivo,
        /** Quantos tiles a câmera olha à frente na direção do movimento. */
        olharAFrenteTiles: z.number().min(0),
        rigidezOlharPorS: positivo,
        /** Até onde a câmera pode ir além da borda da rua, em tiles. */
        folgaDoMapaTiles: z.number().min(0),
      })
      .refine((c) => c.zoomMin <= c.zoomInicial && c.zoomInicial <= c.zoomMax, {
        message: 'zoomInicial precisa ficar entre zoomMin e zoomMax',
      }),
    paleta: z.object({
      /** Fora do mapa (o céu da noite atrás da cidade). */
      fundo: corHex,
      chao: corHex,
      topo: corHex,
      faceEsquerda: corHex,
      faceDireita: corHex,
      sombra: z.object({ cor: corHex, opacidade }),
      luz: corHex,
      /** Pneus dos veículos e da oficina: o cinza mais escuro do cenário. */
      borracha: corHex,
      /** Zonas do chão: cinzas próximos do chão, nunca cor de acento. */
      piso: z.object({
        asfalto: corHex,
        calcada: corHex,
        grama: corHex,
        praca: corHex,
        terra: corHex,
        faixa: corHex,
        meioFio: corHex,
      }),
    }),
    acentos: z.object({
      jogador: corHex,
      magia: corHex,
      fantasma: corHex,
      perigo: corHex,
      doce: corHex,
    }),
    /**
     * Materiais dos personagens e dos ícones de item: cada um com os três tons por face (topo,
     * face esquerda e face direita), como a paleta do cenário. Só personagens e ícones usam.
     */
    tons: z.record(
      z.string(),
      z.object({ topo: corHex, faceEsquerda: corHex, faceDireita: corHex }).strict(),
    ),
    /**
     * Sombreamento facetado dos personagens: cada faceta ganha o tom da sua inclinação em relação
     * à `luz` (x, y, z métricos), arredondado em `faixas` degraus entre a face direita e o topo.
     */
    facetas: z
      .object({
        luz: z.tuple([z.number(), z.number(), z.number()]),
        faixas: z.number().int().min(3).max(16),
      })
      .strict(),
    /** Cores alternativas das fantasias: quanto a cor nova tinge os cinzas da roupa (0 a 1). */
    coresAlternativas: z.object({ tingido: z.number().min(0).max(1) }).strict(),
    /**
     * Personagens e objetos convertidos dos GLBs do Design Codex (src/render/malhas): a altura de
     * cada um no jogo, em px, e quanto a face esquerda e a direita escurecem a cor da face.
     */
    malhas: z
      .object({
        tomTopo: positivo,
        tomEsquerda: positivo,
        tomDireita: positivo,
        alturaPx: z.record(z.string(), positivo),
        /**
         * Corpo animado das malhas prontas (E5): quantos degraus de cada lado tem o balanço do
         * passo (cada degrau é um desenho assado por rotação) e, por modelo, as partes que giram.
         */
        degrausDoPasso: z.number().int().min(1).max(4),
        /** Desenhos de pose novos assados por quadro (o resto fica para os quadros seguintes). */
        posesPorQuadro: z.number().int().positive(),
        esqueletos: z.record(z.string(), z.array(esquemaParteDoEsqueleto).min(1)).default({}),
        /** Malhas com o corpo igual ao de outra (o reflexo da Moradora): usam o esqueleto dela. */
        esqueletoIgual: z.record(z.string(), z.string()).default({}),
        /**
         * Transformações em quadros (a Casa Perseguidora levantando do lote): por modelo, as malhas
         * da primeira à última, mostradas em partes iguais do tempo que a simulação marca.
         */
        transformacoes: z.record(z.string(), z.array(z.string()).min(2)).default({}),
      })
      .strict(),
    volumes: z.object({
      /** Componente vertical mínima da normal para a face ganhar o tom de topo. */
      limiarTopo: z.number().min(0).max(1),
      /**
       * Teto da escala em que prédios e objetos são assados em textura: a escala é
       * devicePixelRatio × zoom máximo da câmera (`src/render/resolucao.ts`), até este valor.
       */
      resolucaoTexturaMax: z.number().min(1).max(4),
    }),
    sombraProjetada: z.object({
      /** Para onde a sombra cai, em tiles (x, y); a luz vem do lado oposto. */
      direcao: z.tuple([z.number(), z.number()]),
      /** Comprimento da sombra no chão, em tiles, por px de altura. */
      tilesPorPx: z.number().min(0),
    }),
    marcadorDestino: z.object({
      raio: positivo,
      duracaoMs: positivo,
      espessuraPx: positivo,
    }),
    /** A marca sobre cada porta que dá para usar (campainha, Casa Desconfiada, casa acesa, banco). */
    marcaDeInteracao: z.object({
      /** Só as portas até esta distância do jogador ganham marca (tiles). */
      alcanceTiles: positivo,
      /** Altura da plaquinha sobre a porta (px). */
      alturaPx: positivo,
      raioPx: positivo,
      balancoPx: z.number().min(0),
      periodoMs: positivo,
      /** Raio do anel no chão, em volta da porta (tiles). */
      anelTiles: positivo,
      /** Quanto o anel cresce no pulso (fração do raio). */
      pulsoAnel: z.number().min(0),
      /** A plaquinha cresce quando o jogador está ao alcance do F. */
      escalaPerto: positivo,
    }),
    /** Mira, projéteis, áreas, partículas e números de dano. */
    combateNaTela: z
      .object({
        pausa: z
          .object({
            acerto: positivo,
            critico: positivo,
            poste: positivo,
            /** Último golpe do combo que acerta e estouro de feitiço (Vassoura, pouso do Salto). */
            golpeFinal: positivo,
            estouro: positivo,
          })
          .strict(),
        tremor: z
          .object({
            explosaoPx: positivo,
            estouroPx: positivo,
            rPx: positivo,
            postePx: positivo,
            chefePx: positivo,
            duracaoMs: positivo,
          })
          .strict(),
        claraoPoste: z.object({ duracaoS: positivo, forca: opacidade }).strict(),
        trato: z
          .object({
            duracaoS: positivo,
            fatorZoom: positivo.max(1),
            textoPreco: z.string(),
            textoSemPreco: z.string(),
            /**
             * O preço aparece na hora (só tela): a casa a até `raioCasa` tiles apaga as janelas, o
             * ícone do preço sobe `sobePx` em `iconeS` segundos, e os preços de luz apagam os postes a
             * até `raioPostes` (1 no Poste Apagado, `postesRuaSemLuz` na Rua Sem Luz).
             */
            raioCasa: positivo,
            raioPostes: positivo,
            postesRuaSemLuz: z.number().int().positive(),
            iconeLadoPx: positivo,
            sobePx: positivo,
            iconeS: positivo,
          })
          .strict(),
        mira: z
          .object({ alfaArea: opacidade, alfaContorno: opacidade, espessuraPx: positivo })
          .strict(),
        projetil: z
          .object({
            alturaPx: z.number().min(0),
            comprimento: positivo,
            largura: positivo,
            rastro: z.number().int().min(0),
          })
          .strict(),
        area: z.object({ alfa: opacidade, alfaContorno: opacidade }).strict(),
        particula: z
          .object({ tamanhoPx: positivo, duracaoMs: positivo, velocidadePxPorS: positivo })
          .strict(),
        abobora: z
          .object({
            porOnda: z.number().int().positive(),
            tamanhoPx: positivo,
            quedaAlturaPx: positivo,
            duracaoMs: positivo,
          })
          .strict(),
        explosao: z.object({ duracaoMs: positivo, alfa: opacidade }).strict(),
        /**
         * O desenho de cada feitiço (docs/PLANO_MUNDO_VIVO.md, frente 3): a estrela do golpe, a
         * vassoura com folhas, o estouro em faíscas, a poção em arco que borbulha, o rastro de
         * estrelas do Salto e o chão queimado da Chuva. Medidas em tiles quando é chão, em px no ar.
         */
        feiticos: z
          .object({
            estrela: z
              .object({ raioPx: positivo, giroPorS: z.number(), rastro: z.number().int().min(0) })
              .strict(),
            brilhoAcerto: z.object({ raioPx: positivo, duracaoMs: positivo }).strict(),
            vassoura: z
              .object({
                cabo: positivo,
                palha: positivo,
                larguraPalha: positivo,
                folhasPorS: positivo,
                folhaMs: positivo,
              })
              .strict(),
            estouro: z
              .object({
                faiscas: z.number().int().min(0),
                duracaoMs: positivo,
                velocidadePxPorS: positivo,
              })
              .strict(),
            pocao: z
              .object({
                arcoPx: positivo,
                frascoPx: positivo,
                cacos: z.number().int().min(0),
                bolhasPorS: positivo,
                bolhaMs: positivo,
                bolhaPx: positivo,
              })
              .strict(),
            salto: z
              .object({ estrelasPorS: positivo, estrelaMs: positivo, decolagem: z.number().int() })
              .strict(),
            chuva: z
              .object({ queimadoS: positivo, queimadoAlfa: opacidade, sementes: z.number().int() })
              .strict(),
          })
          .strict(),
        /**
         * Objetos quebráveis: o objeto treme `tremorPx` por `tremorMs` a cada golpe e solta lascas;
         * ao quebrar, `pedacos` pedaços voam na cor do material. O brilho de "dá para quebrar" é uma
         * estrela pequena que pisca acima dele.
         */
        /** Inimigos encantados: a cor de cada encanto (anel, barra e nome) e onde fica o nome. */
        encantos: z
          .object({ cores: z.record(z.string(), corHex), rotuloAcimaPx: z.number().min(0) })
          .strict(),
        quebraveis: z
          .object({
            tremorPx: positivo,
            tremorMs: positivo,
            lascas: z.number().int().min(0),
            pedacos: z.number().int().min(0),
            pedacoPx: positivo,
            cores: z.record(z.string(), z.array(corHex).min(1)),
            brilho: z
              .object({
                raioPx: positivo,
                alturaPx: positivo,
                periodoMs: positivo,
                alfa: opacidade,
              })
              .strict(),
          })
          .strict(),
        numeroDano: z
          .object({
            subidaPx: positivo,
            duracaoMs: positivo,
            fontePx: positivo,
            acimaPx: positivo,
            escalaCritico: positivo,
            escalaFrenesi: positivo,
          })
          .strict(),
        piscarMs: positivo,
        barraInimigo: z
          .object({ larguraPx: positivo, alturaPx: positivo, acimaPx: positivo, fundo: corHex })
          .strict(),
      })
      .strict(),
    /** Animação por transformação das figuras assadas (andar, respirar, golpe, morte). */
    /**
     * Vida no cenário (PLANO_MUNDO_VIVO.md, passo 12), só na tela: fumaça nas chaminés à vista,
     * folhas no vento, bandos de morcegos de tempos em tempos, crianças fantasiadas andando pela
     * rota que fogem quando a luta chega perto, gatos nos muros que pulam quando o jogador passa
     * e casas da cidade de fundo acendendo e apagando aos poucos.
     */
    vida: z
      .object({
        fumaca: z
          .object({
            aCadaS: positivo,
            vidaS: positivo,
            subidaPx: positivo,
            tamanhoPx: positivo,
            alfa: opacidade,
            cor: z.string(),
            maxChamines: z.number().int().min(0),
          })
          .strict(),
        folhas: z
          .object({
            quantas: z.number().int().min(0),
            tamanhoPx: positivo,
            vento: z.number().min(0),
            cor: z.string(),
          })
          .strict(),
        morcegos: z
          .object({
            aCadaS: z.tuple([positivo, positivo]),
            bando: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
            duracaoS: positivo,
            tamanhoPx: positivo,
          })
          .strict(),
        criancas: z
          .object({
            maximo: z.number().int().min(0),
            aCadaS: positivo,
            velocidade: positivo,
            fugaVelocidade: positivo,
            fugaS: positivo,
            raioLuta: positivo,
            matizes: z.array(z.number()).min(1),
          })
          .strict(),
        gatos: z
          .object({
            maximo: z.number().int().min(0),
            raioPular: positivo,
            saltoS: positivo,
            fugaS: positivo,
            fugaVelocidade: positivo,
            alturaPx: z.record(z.string(), z.number().min(0)),
          })
          .strict(),
        janelas: z.object({ aCadaS: positivo }).strict(),
      })
      .strict(),
    animacao: z
      .object({
        bobPx: z.number().min(0),
        passosPorTile: positivo,
        respiracao: z.number().min(0),
        respiracaoPorS: positivo,
        golpeEscala: z.number().min(0),
        golpeMs: positivo,
        preparoAgacha: z.number().min(0),
        /**
         * Preparo do golpe de um inimigo (o aviso da pestinha): recua até `preparoRecuo` tiles,
         * para longe de quem vai bater, tremendo `preparoTremor` tiles para os lados.
         */
        preparoRecuo: z.number().min(0),
        preparoTremor: z.number().min(0),
        morteMs: positivo,
        flutuarPx: z.number().min(0),
        flutuarPorS: positivo,
        alfaInvisivelJogador: opacidade,
        alfaInvisivelInimigo: opacidade,
        /** Inclinação máxima do corpo ao andar de lado (radianos) e a rapidez para chegar nela. */
        inclinacao: z.number().min(0),
        rigidezInclinacao: positivo,
        /** Quanto o corpo achata quando o pé toca o chão. */
        achatarNoPasso: z.number().min(0),
        /** Quem treme parado (o baú amaldiçoado): inclinação máxima (radianos) e vezes por segundo. */
        tremer: z.object({ inclinacao: z.number().min(0), porS: positivo }).strict(),
        /**
         * Movimento com peso (PLANO_MUNDO_VIVO.md, frente 5). `direcoesMalha`: desenhos por volta
         * das malhas (as 4 rotações e as guinadas entre elas); o corpo vira até a direção nova a
         * `giroGrausPorS`. O golpe estica até `golpeFracaoEstica` do tempo, inclinando
         * `golpeInclina` radianos para a frente, e se acomoda no resto. Quem leva golpe achata
         * `atingidoAchata` por `atingidoMs` e inclina `atingidoInclina` para trás; o tonto balança
         * `tontoInclina` radianos `tontoPorS` vezes por segundo; parado, o corpo balança
         * `balancoParado` radianos no ritmo da respiração.
         */
        direcoesMalha: z.union([z.literal(4), z.literal(8), z.literal(16)]),
        giroGrausPorS: positivo,
        golpeFracaoEstica: z.number().gt(0).lt(1),
        golpeInclina: z.number().min(0),
        atingidoMs: positivo,
        atingidoAchata: z.number().min(0),
        atingidoInclina: z.number().min(0),
        tontoInclina: z.number().min(0),
        tontoPorS: positivo,
        balancoParado: z.number().min(0),
        poeira: z
          .object({ tamanhoPx: positivo, duracaoMs: positivo, velocidadePxPorS: z.number().min(0) })
          .strict(),
      })
      .strict(),
    /** Interface de combate (docs/DESIGN.md, seção 7). */
    interface: z
      .object({
        /** Transparência das placas da interface. */
        alfaPlaca: opacidade,
        /**
         * Tema das placas e menus (a noite azul do jogo): fundo do painel, a placa mais clara, a
         * borda, o filete claro, a sombra embaixo e os cartões (normal e com foco).
         */
        tema: z
          .object({
            painel: corHex,
            painelClaro: corHex,
            borda: corHex,
            filete: corHex,
            sombra: corHex,
            cartao: corHex,
            cartaoFoco: corHex,
          })
          .strict(),
        /**
         * Fim de um mapa: a mensagem de vitória ou derrota fica `pausaFimMs` antes do próximo
         * mapa, e a tela do fim da run mostra "Nova run" depois de `botaoDoFimMs` (GAMEPLAY.md:
         * em até 3 s). As duas entram no Retorno (da derrota à nova run em menos de 10 s).
         */
        pausaFimMs: positivo,
        botaoDoFimMs: positivo,
        /**
         * Movimento da interface (src/game/interface/animacao.ts): entrada das telas (zoom e
         * duração), a fila dos botões, o foco, o pulinho, as letras do logo, o brilho dos painéis,
         * a contagem dos números, o círculo que fecha ao entrar no jogo e o fundo vivo dos menus de
         * tela inteira (céu, lua, telhados, partículas e morcegos).
         */
        animacao: z
          .object({
            entradaMs: positivo,
            saidaMs: positivo,
            zoomEntrada: positivo,
            deslizePx: z.number(),
            escalonamentoMs: z.number().min(0),
            escalonamentoMaxMs: z.number().min(0),
            mesmaLevaMs: positivo,
            focoMs: positivo,
            pulsoFocoMs: positivo,
            pulaMs: positivo,
            letraMs: positivo,
            brilhoMs: positivo,
            brilhoPausaMs: positivo,
            contagemMs: positivo,
            fecharMs: positivo,
            abrirMs: positivo,
            fundo: z
              .object({
                semente: z.number().int(),
                ceuTopo: corHex,
                ceuBase: corHex,
                halo: z.string(),
                lua: corHex,
                luaX: z.number(),
                luaY: z.number(),
                raioLua: positivo,
                telhados: corHex,
                alturaTelhados: positivo,
                particulas: z.number().int().min(0),
                corParticula: corHex,
                velocidade: positivo,
                morcegoACadaMs: positivo,
                morcegoVooMs: positivo,
              })
              .strict(),
          })
          .strict(),
        /**
         * Passagem entre mapas (PLANO_MUNDO_VIVO.md, passo 9): ao vencer a rua (ou sair da porta),
         * a personagem segue andando sozinha por `andarMs`, com a tela fechando num círculo nos
         * últimos `fecharMs`; o mapa novo abre o círculo em `abrirMs` com ela entrando andando
         * por `entrarMs`.
         */
        passagem: z
          .object({
            andarMs: positivo,
            fecharMs: positivo,
            abrirMs: positivo,
            entrarMs: positivo,
          })
          .strict(),
        margemPx: positivo,
        botao: z.object({ tamanhoPx: positivo, espacoPx: positivo }).strict(),
        /** Tela de título: a rua do fundo, o zoom e a velocidade do passeio da câmera. */
        titulo: z
          .object({
            semente: z.number().int(),
            zoom: positivo,
            velocidadeTilesPorS: positivo,
            /** A semente de cada run nova vem do relógio, módulo este número. */
            modSemente: z.number().int().positive(),
            logo: z
              .object({
                arquivo: z.string().min(1),
                larguraPx: positivo,
                xPx: z.number(),
                yPx: z.number(),
              })
              .strict(),
            fraseYPx: z.number(),
            menuYPx: z.number(),
          })
          .strict(),
        /**
         * Artes de interface recortadas das pranchas do Design Codex (scripts/recortar-artes.mjs),
         * servidas de public/<pasta>. Ícones de item e de habilidade por id, a passiva e o retrato
         * por campeão, e os da coleção 04 por id; o que não tem arte cai no desenho por código.
         */
        artes: z
          .object({
            pasta: z.string(),
            itens: z.array(z.string()),
            habilidades: z.array(z.string()),
            passivas: z.record(z.string(), z.string()),
            retratos: z.array(z.string()),
            /** Coleção 04 do Codex: evoluções, tratos, preços, marcas, condições e símbolos. */
            evolucoes: z.array(z.string()),
            tratos: z.array(z.string()),
            precos: z.array(z.string()),
            marcas: z.array(z.string()),
            condicoes: z.array(z.string()),
            hud: z.array(z.string()),
            /** Fração do lado do botão ocupada pela arte do poder. */
            escalaPoder: z.number().positive().max(1),
          })
          .strict(),
      })
      .strict(),
    luzNaTela: z.object({
      ladosPoligono: z.number().int().min(6),
      escuridao: z.object({ cor: corHex, opacidade }),
      /** O tom de quem está no escuro; na meia-luz, mistura com o branco pela luminosidade. */
      tintNoEscuro: corHex,
      /**
       * Quem precisa ser visto no escuro (a Moradora do 13 na praça apagada): o corpo nunca escurece
       * abaixo de `luzMinima` e uma aura clara de `raio` tiles fica no chão em volta. Só tela.
       */
      brilhoProprio: z
        .object({
          especies: z.array(z.string()),
          luzMinima: z.number().min(0).max(1),
          raio: positivo,
          alfa: opacidade,
        })
        .strict(),
      /**
       * Queda da luz, em frações do raio da regra: cheia até `pleno`, `naBorda` no raio (dá para
       * ver onde a regra acaba) e apagada `alem` depois dele.
       */
      queda: z.object({ pleno: opacidade, naBorda: opacidade, alem: z.number().min(0) }).strict(),
      /** Poça de luz somada no chão, por tipo de luz: o branco frio do poste, a janela morna. */
      pocas: z
        .object({
          poste: z.object({ cor: corHex, alfa: opacidade }).strict(),
          janela: z.object({ cor: corHex, alfa: opacidade }).strict(),
          pulso: z.object({ cor: corHex, alfa: opacidade }).strict(),
        })
        .strict(),
      /** Brilho em volta da lâmpada do poste, no ar: raio em tiles e altura da lâmpada em px. */
      lampada: z.object({ raio: positivo, alfa: opacidade, alturaPx: positivo }).strict(),
      /**
       * Cone de luz do poste: da lâmpada até o chão, com `larguraTopo` e `larguraBase` (tiles) e
       * o `alfa` perto da lâmpada, sumindo até o chão (o ar da noite iluminado).
       */
      cone: z
        .object({
          cor: corHex,
          alfa: opacidade,
          larguraTopo: positivo,
          larguraBase: positivo,
        })
        .strict(),
      /**
       * Atmosfera da noite por cima da rua: uma névoa leve em toda a tela (`neblina`) e as bordas
       * mais escuras (`bordas`, da metade do raio da tela até o canto).
       */
      /**
       * Véu da condição Neblina: em volta do jogador, transparente até a visão da condição e
       * fechando em `transicaoTiles` até a `cor` com `alfa` (um degradê só, sem faixas).
       */
      neblina: z.object({ cor: corHex, alfa: opacidade, transicaoTiles: positivo }).strict(),
      atmosfera: z
        .object({
          neblina: z.object({ cor: corHex, alfa: opacidade }).strict(),
          bordas: z.object({ cor: corHex, alfa: opacidade }).strict(),
        })
        .strict(),
      /**
       * Feixe das janelas e das abóboras das portas na tela: a queda ao longo dele e para os lados
       * (frações do comprimento e da meia largura), quantos tiles antes do começo a luz já chega e
       * quanto a luz de cada andar de cima enfraquece.
       */
      feixe: z
        .object({
          queda: z
            .object({ pleno: opacidade, naBorda: opacidade, alem: z.number().min(0) })
            .strict(),
          suaveInicio: positivo,
          forcaPorAndar: opacidade,
        })
        .strict(),
      /**
       * Sombras da noite, uma por luz: cada luz projeta a sombra dos objetos para longe dela, da
       * altura em que fica (o poste usa a da lâmpada). `forca` é quanto a sombra tira da luz,
       * `penumbraPx` o desfoque da borda; cada personagem leva as sombras das `porFigura` luzes
       * mais fortes, com a largura dele, e luz mais fraca que `minimo` não faz sombra.
       */
      sombras: z
        .object({
          forca: opacidade,
          penumbraPx: z.number().min(0),
          alturaJanelaPx: positivo,
          alturaPulsoPx: positivo,
          porFigura: z.number().int().min(1),
          larguraFigura: positivo,
          comprimentoMaxFigura: positivo,
          minimo: opacidade,
          /** Sombras de luz novas feitas por quadro (as outras luzes entram nos quadros seguintes). */
          porQuadro: z.number().int().min(1),
          /**
           * Os objetos (casas, carros, árvores) recortam a poça das luzes com a sombra deles.
           * Desligado, cada poça fica inteira em volta da lâmpada.
           */
          dosObjetos: z.boolean(),
        })
        .strict(),
      posteCorrompido: z.object({
        opacidadeHalo: opacidade,
        periodoPiscaMs: positivo,
        alfaMinimo: opacidade,
      }),
    }),
  })
  .strict();

export const esquemaLuz = z
  .object({
    poste: z.object({ raio: positivo }),
    /**
     * Cada janela acesa joga um feixe no chão, da parede para onde ela olha, com a largura dela:
     * anda `comprimento` tiles abrindo `abertura` por tile de cada lado, e a de um andar de cima
     * começa `inicioPorAndar` tiles mais longe da parede (a luz desce de mais alto).
     */
    janela: z
      .object({
        comprimento: positivo,
        abertura: z.number().min(0),
        inicioPorAndar: z.number().min(0),
        /** A janela joga o feixe no chão (luz da regra e poça na tela)? Desligado: só a vidraça brilha. */
        iluminaChao: z.boolean().default(true),
      })
      .strict(),
    posteCorrompido: z.object({ raio: positivo }),
    /** Postes amigos curam essa fração da Coragem por segundo a quem está na luz deles. */
    cura: z.object({ postePorS: z.number().min(0) }).strict(),
  })
  .strict();

const rotacao = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0);
// Sem mínimo aqui: os objetos de cenário (a cidade em volta) ficam fora da rua, em coordenadas
// negativas. Os objetos jogáveis são conferidos no esquema da rua.
const posicao = {
  x: z.number(),
  y: z.number(),
  rot: rotacao,
  /** Grupo para esconder junto (ex.: a grade do portão quando ele abre). */
  grupo: z.string().optional(),
};

/** Casas que podem ficar na rua jogável, com porta para a rua e janelas que iluminam o chão. */
export const MODELOS_DE_CASA = [
  'casa_terrea',
  'sobrado',
  'casa_grande',
  'casa_varanda',
  'geminado',
  'chale',
  'casa_torre',
  'loja',
  // Acervo do Codex (src/render/modelosBairro.ts).
  'casa_sotao',
  'casa_laje',
  'geminadas',
  'sobrado_atelie',
  'vilinha',
  'padaria',
  'mercado',
  'oficina',
  'cinema',
] as const;

/** Modelos do passe de design: casas novas, comércio, marcos, mobiliário urbano e limites. */
export const MODELOS_DE_CIDADE = [
  'casa_varanda',
  'geminado',
  'chale',
  'casa_torre',
  'loja',
  'predio',
  'igreja',
  'escola',
  'galpao',
  'caixa_dagua',
  'chafariz',
  'coreto',
  'balanco',
  'escorregador',
  'floreira',
  'arbusto',
  'pinheiro',
  'arvore_seca',
  'carro',
  'hidrante',
  'caixa_correio',
  'orelhao',
  'ponto_onibus',
  'banca',
  'cacamba',
  'semaforo',
  'placa_rua',
  'muro',
  'tapume',
  'cavalete',
  'cone',
  'portico',
  'arco',
  'patamar',
  'espelho',
  'abobora_decor',
  'aldrava',
  'abobora_gigante',
  'guarita',
  'canteiro',
  'cancela',
  'poco',
  'vela',
  'lapide',
  'varal',
  'cerca_viva',
  'morro',
  'pedra',
  'barreira',
  'buraco',
  'placa_obra',
  'mirante',
  // Acervo do Codex (src/render/modelosBairro.ts).
  'casa_sotao',
  'casa_laje',
  'geminadas',
  'sobrado_atelie',
  'vilinha',
  'padaria',
  'mercado',
  'oficina',
  'cinema',
  'edificio',
  'onibus',
  'carrinho_de_rua',
  'pracinha',
] as const;

export const esquemaObjetoRua = z.discriminatedUnion('modelo', [
  z
    .object({ modelo: z.literal('casa_terrea'), apagada: z.boolean().optional(), ...posicao })
    .strict(),
  z.object({ modelo: z.literal('sobrado'), apagada: z.boolean().optional(), ...posicao }).strict(),
  z
    .object({ modelo: z.literal('casa_grande'), apagada: z.boolean().optional(), ...posicao })
    .strict(),
  z
    .object({
      modelo: z.literal('poste'),
      estado: z.enum(['amigo', 'apagado', 'corrompido']),
      ...posicao,
    })
    .strict(),
  z.object({ modelo: z.literal('lixeira'), ...posicao }).strict(),
  z.object({ modelo: z.literal('arvore'), ...posicao }).strict(),
  z.object({ modelo: z.literal('banco'), ...posicao }).strict(),
  z.object({ modelo: z.literal('cerca'), ...posicao }).strict(),
  z.object({ modelo: z.literal('bueiro'), ...posicao }).strict(),
  z.object({ modelo: z.literal('pilar'), ...posicao }).strict(),
  z.object({ modelo: z.literal('grade'), ...posicao }).strict(),
  z
    .object({
      modelo: z.enum(MODELOS_DE_CIDADE),
      /** Variação do mesmo modelo (tipo de loja, de carro, altura do prédio). */
      variante: z.string().optional(),
      apagada: z.boolean().optional(),
      ...posicao,
    })
    .strict(),
]);

/** Variantes do carro estacionado (os veículos do acervo do Codex, fora o micro-ônibus). */
export const VARIANTES_DE_CARRO = [
  'sedan',
  'perua',
  'compacto',
  'retro',
  'picape',
  'van',
  'furgao',
] as const;

/** Personagens parados só para dar escala na prévia do kit visual. */
export const MODELOS_MOVEIS = [
  'bruxinha',
  'fantasma',
  'esqueleto',
  'vampirinho',
  'pestinha_lencol',
  'arremessador',
  'abobora_canhao',
  'poste_corrompido',
  'poste_caido',
  'doce',
  'doce_isca',
  'bau',
  'bau_aberto',
  'bau_raro',
  'bau_amaldicoado',
  'crianca_perdida',
  'carrinho_pipoca',
  'cao_de_guarda',
  'corvo',
  'gato_preto',
  'casa_perseguidora',
  'casa_perseguidora_q1',
  'casa_perseguidora_q2',
  'casa_perseguidora_q3',
  'casa_perseguidora_q4',
  'vizinho_curioso',
  'cobrador',
  'sombra_rasteira',
  'guarda_condominio',
  'sindico_zeloso',
  'viuva_do_mirante',
  'dono_do_bairro',
  'dono_do_bairro_rosto',
  'grade_movel',
  'pilha_tijolos',
  'abobora_dourada',
  'lixeira',
  'saco_surpresa',
  'morceguinho',
  'espantalho',
  'pestinha_vela',
  'morador_ofendido',
  'sombra_da_viuva',
  'moradora_13_bruxinha',
  'moradora_13_fantasma',
  'moradora_13_esqueleto',
  'moradora_13_vampirinho',
] as const;

export const esquemaFigurante = z
  .object({
    modelo: z.enum(MODELOS_MOVEIS),
    ...posicao,
    /** Cor alternativa: giro de matiz (graus) das cores vivas do modelo. */
    matiz: z.number().optional(),
  })
  .strict();

export const TIPOS_DE_PISO = [
  'asfalto',
  'calcada',
  'grama',
  'praca',
  'terra',
  'faixa',
  'meioFio',
] as const;

/** Retângulo do chão com um tipo de piso (em tiles). Os de depois cobrem os de antes. */
export const esquemaPiso = z
  .object({
    tipo: z.enum(TIPOS_DE_PISO),
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  })
  .strict();

const retanguloMundo = z
  .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .strict();

export const esquemaRua = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    nome: z.string(),
    largura: z.number().int().positive(),
    profundidade: z.number().int().positive(),
    /** Onde o jogador aparece, em tiles. */
    entrada: z.object({ x: z.number(), y: z.number() }),
    objetos: z.array(esquemaObjetoRua),
    figurantes: z.array(esquemaFigurante).default([]),
    /** Bonecos de treino: alvos parados para testar as habilidades antes dos inimigos. */
    bonecos: z.array(z.object({ x: z.number(), y: z.number() }).strict()).default([]),
    /** Zonas do chão (pista, calçada, praça...), só desenho. */
    piso: z.array(esquemaPiso).default([]),
    /** A cidade em volta: objetos só de desenho, sem colisão, podendo ficar fora da rua. */
    cenario: z.array(esquemaObjetoRua).default([]),
    /** Até onde o mundo desenhado vai (a câmera não passa daqui). Sem ele, a rua mais uma folga. */
    mundo: retanguloMundo.optional(),
  })
  .strict()
  .superRefine((rua, ctx) => {
    const { x, y } = rua.entrada;
    if (x < 0 || y < 0 || x > rua.largura || y > rua.profundidade) {
      ctx.addIssue({ code: 'custom', message: `entrada fora da rua (${x}, ${y})` });
    }
    [...rua.objetos, ...rua.figurantes].forEach((o, i) => {
      if (o.x < 0 || o.y < 0 || o.x > rua.largura || o.y > rua.profundidade) {
        ctx.addIssue({
          code: 'custom',
          message: `${o.modelo} #${i} fora da rua (${o.x}, ${o.y})`,
        });
      }
    });
    rua.bonecos.forEach((b, i) => {
      if (b.x < 0 || b.y < 0 || b.x > rua.largura || b.y > rua.profundidade) {
        ctx.addIssue({ code: 'custom', message: `boneco #${i} fora da rua (${b.x}, ${b.y})` });
      }
    });
  });

export const esquemaRuas = z
  .object({ ruas: z.array(esquemaRua).min(1) })
  .strict()
  .refine((c) => new Set(c.ruas.map((r) => r.id)).size === c.ruas.length, {
    message: 'ids de rua repetidos',
  });

const retangulo = z
  .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .strict()
  .refine((r) => r.x0 < r.x1 && r.y0 < r.y1, { message: 'retângulo vazio ou invertido' });

const esquemaModelo = z
  .object({
    /** Tamanho da pegada antes de girar (eixo x, eixo y), em tiles. */
    pegada: z.object({ largura: positivo, profundidade: positivo }).strict(),
    /** Retângulos que bloqueiam o movimento, no espaço do modelo (frente para +x). */
    colisao: z.array(retangulo),
    /**
     * Janelas acesas, de todos os andares (pé da parede, para onde ela olha, largura e andar), no
     * espaço do modelo: cada uma joga o próprio feixe de luz no chão. Só acende o chão a janela
     * que a câmera vê (a dos fundos fica de costas): os quintais ficam na sombra.
     */
    janelas: z
      .array(
        z
          .object({
            x: z.number(),
            y: z.number(),
            nx: z.number(),
            ny: z.number(),
            largura: positivo,
            andar: z.number().int().min(0),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

const NOMES_DE_MODELO = [
  'casa_terrea',
  'sobrado',
  'casa_grande',
  'poste',
  'lixeira',
  'arvore',
  'banco',
  'cerca',
  'bueiro',
  'pilar',
  'grade',
  'bruxinha',
  'fantasma',
  'esqueleto',
  'vampirinho',
  'pestinha_lencol',
  'arremessador',
  'abobora_canhao',
  'poste_corrompido',
  'poste_caido',
  'doce',
  'doce_isca',
  'bau',
  'bau_aberto',
  'bau_raro',
  'bau_amaldicoado',
  'crianca_perdida',
  'carrinho_pipoca',
  'cao_de_guarda',
  'corvo',
  'gato_preto',
  'casa_perseguidora',
  'casa_perseguidora_q1',
  'casa_perseguidora_q2',
  'casa_perseguidora_q3',
  'casa_perseguidora_q4',
  'vizinho_curioso',
  'cobrador',
  'sombra_rasteira',
  'guarda_condominio',
  'sindico_zeloso',
  'viuva_do_mirante',
  'dono_do_bairro',
  'dono_do_bairro_rosto',
  'grade_movel',
  'abobora_dourada',
  'saco_surpresa',
  'morceguinho',
  'pilha_tijolos',
  'espantalho',
  'pestinha_vela',
  'morador_ofendido',
  'sombra_da_viuva',
  'moradora_13_bruxinha',
  'moradora_13_fantasma',
  'moradora_13_esqueleto',
  'moradora_13_vampirinho',
] as const;

const TODOS_OS_MODELOS = [...NOMES_DE_MODELO, ...MODELOS_DE_CIDADE] as const;

/** Um registro por modelo que pode aparecer numa rua: nenhum fica sem pegada nem colisão. */
export const esquemaModelos = z
  .object(
    Object.fromEntries(TODOS_OS_MODELOS.map((n) => [n, esquemaModelo])) as Record<
      (typeof TODOS_OS_MODELOS)[number],
      typeof esquemaModelo
    >,
  )
  .strict();

export const esquemaSimulacao = z
  .object({
    ticksPorSegundo: z.number().int().positive(),
    maxTicksPorQuadro: z.number().int().positive(),
    celulaGradeTiles: positivo,
    iteracoesColisao: z.number().int().positive(),
    sementePadrao: z.number().int().min(0),
  })
  .strict();

/** As quatro habilidades da ficha (o nome do slot; a tecla física está em `controles.json`). */
export const TECLAS = ['Q', 'W', 'E', 'R'] as const;

export const esquemaControles = z
  .object({
    zonaMortaAnalogico: z.number().min(0).max(1),
    /** Lançamento rápido: a habilidade sai ao soltar a tecla (padrão) ou já ao apertar. */
    lancamento: z.enum(['soltar', 'apertar']),
    /**
     * Teclas físicas (estilo Minecraft Dungeons, PLANO_JOGABILIDADE.md): WASD anda e cada
     * habilidade (Q, W, E, R na ficha) fica numa tecla ou no botão direito do mouse.
     * Os nomes são os de `Phaser.Input.Keyboard.KeyCodes`, mais "BOTAO_DIREITO".
     */
    habilidades: z.record(z.enum(TECLAS), z.string().min(1)),
    rolar: z.string().min(1),
    lanterna: z.string().min(1),
    interagir: z.string().min(1),
    /** Doce ou travessura: na campainha, F pede doce e esta tecla pede travessura. */
    travessura: z.string().min(1),
    /**
     * Controle: nos menus, o analógico vira direção passando de `limiarAnalogico`, e segurar repete
     * depois de `repeticaoInicialS`, a cada `repeticaoS`. Na rua, sem o analógico direito, a mira
     * fica `miraAFrente` tiles à frente de onde a personagem olha (com a assistência de mira).
     */
    controle: z
      .object({
        menus: z
          .object({
            limiarAnalogico: z.number().min(0).max(1),
            repeticaoInicialS: z.number().positive(),
            repeticaoS: z.number().positive(),
          })
          .strict(),
        miraAFrente: z.number().positive(),
        /**
         * Mira automática das áreas, alvos e cones no controle (src/sim/assistencia.ts): no cone de
         * `graus` (`grausAnalogico` com o analógico direito, que é mira de propósito), o ponto que
         * pega mais inimigos; sem nenhum, o mais perto até `qualquerLadoAte` tiles; sem nenhum,
         * `semAlvoTiles` à frente.
         */
        miraAutomatica: z
          .object({
            graus: z.number().min(0).max(180),
            grausAnalogico: z.number().min(0).max(180),
            qualquerLadoAte: z.number().min(0),
            semAlvoTiles: z.number().positive(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

/**
 * Uma camada de um som sintetizado: um oscilador (ou ruído) com envelope curto. `freq` em Hz; no
 * ruído, é o corte do filtro passa-baixa. `freqFim` desliza o tom até o fim, `filtro` corta os
 * agudos e `inicioS` atrasa a camada (arpejos).
 */
const esquemaCamadaDeSom = z
  .object({
    onda: z.enum(['seno', 'quadrada', 'triangulo', 'serra', 'ruido']),
    /** Tom do oscilador; no ruído, o corte do filtro. `freqFim` desliza até o fim (os dois). */
    freq: positivo,
    freqFim: positivo.optional(),
    duracaoS: positivo,
    volume: z.number().min(0).max(1),
    inicioS: z.number().min(0).default(0),
    /** Filtro do oscilador (no ruído, o filtro é o próprio `freq`). */
    filtro: positivo.optional(),
    /** Tipo do filtro: corta os agudos (baixa), os graves (alta) ou deixa uma faixa (banda). */
    filtroTipo: z.enum(['baixa', 'alta', 'banda']).default('baixa'),
    /** Ressonância do filtro (Q): alta, o ruído vira um assobio ou um sopro com tom. */
    ressonancia: positivo.optional(),
    /** Subida do volume (padrão: quase instantânea; maior, o som incha, como um sopro). */
    ataqueS: positivo.optional(),
    /**
     * Grãos: a camada toca `vezes` vezes, a cada `intervaloS` (com até `variacaoS` de folga),
     * com o tom sorteado em ±`variacaoTom` semitons e o volume caindo `cair` a cada vez (bolhas,
     * chocalho de ossos, papel de bala).
     */
    repetir: z
      .object({
        vezes: z.number().int().min(2),
        intervaloS: positivo,
        variacaoS: z.number().min(0).default(0),
        variacaoTom: z.number().min(0).default(0),
        cair: z.number().min(0).max(1).default(1),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Música sintetizada por código (sem arquivos): instrumentos com envelope, padrões escritos como
 * texto e trilhas que juntam padrões. Num padrão, cada passo (uma semicolcheia) é separado por
 * espaço: um número é o grau da escala a partir da tônica (7 = oitava acima, negativos descem),
 * "x" é uma batida (percussão, sem nota), "-" segura a nota anterior e "." é silêncio.
 */
const esquemaMusica = z
  .object({
    volume: z.number().min(0).max(1),
    /** Nota MIDI da tônica (45 = Lá 2) e os graus da escala em semitons. */
    tonica: z.number().int().min(12).max(96),
    escala: z.array(z.number().int().min(0).max(11)).min(5),
    /** Troca de trilha e de intensidade (combate) em segundos. */
    transicaoS: positivo,
    /** A rua está em combate com ao menos `minimo` inimigos vivos a até `raioTiles` do jogador. */
    combate: z.object({ raioTiles: positivo, minimo: z.number().int().min(1) }).strict(),
    instrumentos: z.record(
      z.string(),
      z
        .object({
          onda: z.enum(['seno', 'quadrada', 'triangulo', 'serra', 'ruido']),
          volume: z.number().min(0).max(1),
          /** Semitons somados à nota (12 = uma oitava acima). */
          oitava: z.number().int().default(0),
          ataqueS: z.number().min(0),
          /** Quanto o som some depois do fim da nota. */
          soltarS: z.number().min(0),
          filtro: positivo.optional(),
          /** Batida: a frequência cai até esta fração (bumbo); sem ela, a nota fica. */
          queda: z.number().min(0.01).max(1).optional(),
          /** Frequência fixa da batida (percussão "x"). */
          freqBatida: positivo.optional(),
        })
        .strict(),
    ),
    /**
     * Música gravada (PLANO_MUNDO_VIVO.md, frente 6, arquivos CC0 em `public/audio`): uma faixa em
     * loop por trilha, a camada de `combate` que entra por cima da rua com a intensidade e as
     * vinhetas de vitória e derrota (a música abaixa para `abafarNaVinheta` enquanto tocam). Uma
     * trilha sem arquivo (ou que não carregou) toca a sintetizada.
     */
    gravada: z
      .object({
        pasta: z.string().min(1),
        volume: z.number().min(0).max(1),
        transicaoS: positivo,
        trilhas: z.record(z.string(), z.string().min(1)),
        combate: z.string().min(1).optional(),
        vinhetas: z.record(z.string(), z.string().min(1)),
        abafarNaVinheta: z.number().min(0).max(1),
        /**
         * Mixagem medida (volume médio de cada faixa): `ganhos` por trilha para ficarem no mesmo
         * nível; na luta, a camada de combate entra com `combate` e a rua fica em `ruaEmCombate`.
         */
        mixagem: z
          .object({
            ganhos: z.record(z.string(), positivo),
            combate: positivo,
            ruaEmCombate: z.number().min(0).max(1),
          })
          .strict(),
      })
      .strict()
      .optional(),
    trilhas: z.record(
      z.string(),
      z
        .object({
          bpm: positivo,
          camadas: z
            .array(
              z
                .object({
                  instrumento: z.string(),
                  /** Compassos de 16 passos, emendados (cada um uma string). */
                  padrao: z.array(z.string().min(1)).min(1),
                  /** Só toca com a rua em combate (entra e sai com `transicaoS`). */
                  intensa: z.boolean().default(false),
                })
                .strict(),
            )
            .min(1),
        })
        .strict(),
    ),
  })
  .strict();

/** Sons sintetizados por código (tarefa 14): o mixer toca estes a partir dos eventos. */
export const esquemaAudio = z
  .object({
    volumes: z
      .object({
        geral: z.number().min(0).max(1),
        efeitos: z.number().min(0).max(1),
        interface: z.number().min(0).max(1),
      })
      .strict(),
    /** Acertos de habilidade seguidos (até `janelaS` entre eles) sobem de tom, até `degraus`. */
    acertoSeguido: z
      .object({
        janelaS: positivo,
        degraus: z.number().int().min(0),
        semitonsPorDegrau: z.number(),
      })
      .strict(),
    /** O mesmo timbre do campeão muda de tom por tecla. */
    semitonsPorTecla: z.record(z.string(), z.number()),
    /** A partir de qual golpe do combo (0, 1, 2) toca o som do golpe final. */
    golpeFinalNoCombo: z.number().int().min(0),
    /** Som próprio do golpe de um campeão: quantos semitons sobe a cada golpe do combo. */
    semitonsPorGolpe: z.number().default(0),
    sons: z.record(
      z.string(),
      z
        .object({
          canal: z.enum(['efeitos', 'interface']),
          /** Um som igual não toca de novo antes disso (uma área acertando dez inimigos). */
          intervaloMinimoS: z.number().min(0),
          camadas: z.array(esquemaCamadaDeSom).min(1),
        })
        .strict(),
    ),
    /**
     * Efeitos gravados (arquivos CC0 em `public/audio`): cada som do jogo com as variações (uma
     * por vez, sem repetir a anterior), o volume, o tom de base e quanto o tom varia (±semitons).
     * Um som sem arquivo, ou antes de os arquivos carregarem, toca o sintetizado de `sons`.
     */
    arquivos: z
      .object({
        pasta: z.string().min(1),
        extensao: z.string().min(1),
        sons: z.record(
          z.string(),
          z
            .object({
              arquivos: z.array(z.string().min(1)).min(1),
              volume: z.number().min(0).max(2),
              tom: z.number(),
              variacaoTom: z.number().min(0),
              /** Começa depois (o vidro quebra depois do frasco voar). */
              atrasoS: z.number().min(0).default(0),
              /** Toca também as camadas sintetizadas do mesmo som (o arquivo é só uma parte). */
              comSintese: z.boolean().default(false),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
    musica: esquemaMusica,
  })
  .strict();

export type Audio = z.infer<typeof esquemaAudio>;

/**
 * Dicas da primeira run (GAMEPLAY.md, "Primeira run"): os passos da rua 1-1, um por vez, cada um
 * até o jogador fazer a ação ou passar `porDicaS` (no máximo `duracaoS` no total), e as linhas da
 * primeira vez do Susto, da evolução e das marcas.
 */
export const esquemaDicas = z
  .object({
    rua: z
      .object({
        duracaoS: positivo,
        porDicaS: positivo,
        /** Espera depois do título da rua antes da primeira dica. */
        esperaInicialS: z.number().min(0),
        /** Quanto andar (tiles) conta como "andou". */
        andarTiles: positivo,
        passos: z
          .array(
            z
              .object({
                id: z.enum(['andar', 'atacar', 'q', 'rolar', 'lanterna', 'poste', 'portao']),
                texto: z.string().min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    /** Quanto tempo fica na tela a linha da primeira vez (Susto). */
    linhaS: positivo,
    susto: z.string().min(1),
    evolucao: z.string().min(1),
    /**
     * Menu de pausa (PLANO_MUNDO_VIVO.md, frente 7): a explicação do Susto e do Frenesi e as
     * linhas de controles que não vêm de `controles.json` (tecla e o que faz).
     */
    pausa: z
      .object({
        susto: z.array(z.string().min(1)).min(1),
        controles: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1),
      })
      .strict(),
    marcas: z.string().min(1),
  })
  .strict();

export type Dicas = z.infer<typeof esquemaDicas>;
export type SomDoJogo = Audio['sons'][string];

export const esquemaJogador = z
  .object({
    raio: positivo,
    velocidade: positivo,
    /** Segundos para ir do parado à velocidade cheia (`arranqueS`) e dela ao parado (`freioS`). */
    aceleracao: z.object({ arranqueS: positivo, freioS: positivo }).strict().optional(),
    /**
     * Rolamento (Espaço): `distancia` tiles a `velocidade` tiles/s na direção do movimento, sem
     * levar dano por `imuneS`, de novo só depois de `recargaS`. Passa pelos corpos.
     */
    rolamento: z
      .object({
        distancia: positivo,
        velocidade: positivo,
        imuneS: positivo,
        recargaS: positivo,
        /** Inimigo pequeno que o rolamento atravessa fica tonto (atordoado) por esse tempo. */
        tontoS: z.number().min(0).default(0),
      })
      .strict(),
  })
  .strict();

const atributoDeDano = z.enum(['forca', 'feitico']);
/** Valor por posto: Q, W e E têm 5 postos, o R tem 3; ataques de inimigos, 1. */
const porPosto = z.array(z.number().min(0)).min(1);
const segundos = z.number().min(0);
const fracao = z.number().min(0).max(1);

const esquemaForma = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('linha'),
      alcance: positivo,
      largura: positivo,
      /** Tiles por segundo do projétil; 0 = golpe instantâneo em toda a linha. */
      velocidade: z.number().min(0),
      /** Atravessa todos os inimigos em vez de parar no primeiro. */
      perfura: z.boolean(),
    })
    .strict(),
  z.object({ tipo: z.literal('cone'), alcance: positivo, angulo: positivo }).strict(),
  z
    .object({
      tipo: z.literal('area'),
      /** Distância máxima do centro da área ao lançador; além disso, cai no ponto mais distante. */
      alcance: z.number().min(0),
      raio: positivo,
      /** Espera entre o lançamento e o primeiro pulso. */
      atraso: segundos,
      /** Quantas vezes os efeitos se aplicam (ondas do R, segundos da poça do W). */
      pulsos: z.number().int().positive(),
      intervalo: segundos,
      centradaNoLancador: z.boolean().default(false),
      /** Centrada no lançador e indo junto com ele. */
      acompanha: z.boolean().default(false),
      /** O centro segue a mira (Tempestade). */
      segueCursor: z.boolean().default(false),
      /** Área quadrada de lado 2 × raio (Vistoria do Síndico) em vez de círculo. */
      quadrada: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('dash'),
      distancia: positivo,
      velocidade: positivo,
      atravessaCorpos: z.boolean(),
      atravessaParedes: z.boolean().default(false),
      /** Segundos de imunidade depois do trajeto (Capa de Morcego); 0 = sem imunidade. */
      imune: segundos.default(0),
      /** Para no cursor se ele estiver mais perto que a distância. */
      ateOCursor: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('alvo'),
      alcance: positivo,
      /** Espera entre marcar o alvo e o golpe (Assombração). */
      atraso: segundos.default(0),
      /** Salta até encostar no alvo, até essa distância (Mordida). */
      salto: z.number().min(0).default(0),
      velocidadeSalto: positivo.default(15),
      /** Aparece atrás do alvo na hora do golpe. */
      aparecerAtras: z.boolean().default(false),
    })
    .strict(),
  z.object({ tipo: z.literal('propria') }).strict(),
]);

const em = z.enum(['alvo', 'lancador']).optional();
const baseDano = {
  base: porPosto,
  razao: z.number().min(0),
  atributo: atributoDeDano,
  /** Soma uma fração da Coragem máxima do lançador (Desabamento). */
  razaoCoragemMax: z.number().min(0).optional(),
};

const esquemaEfeito = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('dano'),
      em,
      ...baseDano,
      /** Os números são por segundo: cada pulso aplica `valor × intervalo`. */
      porSegundo: z.boolean().default(false),
      /** Dano multiplicado em alvos abaixo de uma fração da Coragem (Assombração). */
      multAbaixoDe: z.object({ fracao, mult: positivo }).strict().optional(),
      /** Roubo de vida extra só deste dano. */
      roubo: z.number().min(0).optional(),
      /** Ignora a Resistência. */
      verdadeiro: z.boolean().optional(),
      /** Soma esta fração da Coragem máxima do alvo (Névoa Faminta). */
      percentualDoAlvo: z.number().min(0).optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('lentidao'), em, valor: fracao, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('atordoar'), em, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('enraizar'), em, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('medo'), em, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('provocar'), em, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('marca'), em, bonus: positivo, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('fragil'), em, valor: positivo, duracao: positivo }).strict(),
  z
    .object({
      tipo: z.literal('invisivel'),
      em,
      duracao: positivo,
      duracaoNaLuz: positivo.optional(),
      /** Derrubar um inimigo enquanto invisível renova a invisibilidade (Lençol Longo). */
      renovaAoAbater: z.boolean().default(false),
      /** Ao sair da invisibilidade, o próximo golpe causa `mult` a mais por `duracao` s. */
      aoSair: z
        .object({ mult: z.number().min(0), duracao: positivo })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('imune'), em, duracao: positivo }).strict(),
  z
    .object({
      tipo: z.literal('escudo'),
      em,
      base: porPosto,
      razaoCoragemMax: z.number().min(0).default(0),
      /** Fração do escudo (Escudo Duplo: 60% em cada carga). */
      fracao: positivo.default(1),
      duracao: positivo,
      /** Se o escudo não quebrar, devolve esta fração do que sobrou como Coragem. */
      devolve: fracao.default(0),
      /** Quem bate no escudo recebe de volta esta fração do dano absorvido (Espinhos). */
      espinhos: z.number().min(0).default(0),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('cura'),
      em,
      /** Fração da Coragem máxima do alvo. */
      percentual: positivo,
      porSegundo: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('bonus'),
      em,
      atributo: z.enum(ATRIBUTOS),
      soma: z.number().optional(),
      mult: z.number().optional(),
      duracao: positivo,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('empurrar'),
      em,
      distancia: positivo,
      velocidade: positivo.default(10),
      /** Para longe de quem bate, para o lado do dash, ou puxando para perto. */
      modo: z.enum(['longe', 'lado', 'puxar']).default('longe'),
      /** Atordoa se bater numa casa (Atropelo); 0 = não atordoa. */
      atordoaNaParede: segundos.default(0),
    })
    .strict(),
  /** A próxima vez que a tecla for usada, sai sem custo de Energia (Pouso Leve). */
  z.object({ tipo: z.literal('gratis'), em, tecla: z.enum(TECLAS) }).strict(),
  /**
   * Banquete do Vampirinho: roubo de vida extra, velocidade a cada golpe até um teto e, nos
   * Despertares, mais tempo a cada inimigo derrotado ou cura ao terminar.
   */
  z
    .object({
      tipo: z.literal('banquete'),
      em,
      duracao: positivo,
      rouboVida: z.number().min(0),
      porGolpe: z.number().min(0),
      maxVelocidade: z.number().min(0),
      prolongaAoAbater: z.number().min(0).default(0),
      curaAoFim: fracao.default(0),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('dot'),
      em,
      ...baseDano,
      /** Dano total ao longo da duração, como fração do golpe. */
      fracao: positivo,
      duracao: positivo,
    })
    .strict(),
]);

export const esquemaHabilidade = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    nome: z.string(),
    /** Tecla do campeão; ataques de inimigos usam `ataque`. */
    tecla: z.enum([...TECLAS, 'ataque']),
    descricao: z.string().default(''),
    forma: esquemaForma,
    custo: z.number().min(0),
    recarga: porPosto,
    /** Tempo de lançamento, com o lançador parado (0 = instantâneo). Em inimigos, é o aviso. */
    lancamento: segundos,
    efeitos: z.array(esquemaEfeito),
    cor: z.enum(['jogador', 'magia', 'fantasma', 'perigo', 'doce']),
    /** Ataque anunciado no chão em vermelho durante o lançamento (inimigos). */
    aviso: z.boolean().default(false),
    /** Cargas guardadas (Duas Paredes). */
    cargas: z.number().int().positive().default(1),
    /** Pode ser lançada de novo, sem custo, por um tempo (Corte Duplo). */
    relancamento: z.object({ janela: positivo, fracaoDano: positivo }).strict().optional(),
    /** Vários projéteis em leque, espalhados no ângulo dado em graus (Multa do Síndico). */
    leque: z
      .object({ n: z.number().int().min(2), angulo: positivo })
      .strict()
      .optional(),
    /** Ao acertar, salta para mais inimigos (Ricochete). */
    ricochete: z
      .object({ alvos: z.number().int().positive(), raio: positivo, fracao: positivo })
      .strict()
      .optional(),
    /** Projétil que empurra quem acerta, em tiles (Vassoura Pesada). */
    empurraAoAcertar: z.number().min(0).default(0),
    /** Enraíza quem fica um tempo dentro da área (Poção Grudenta). */
    enraizaSeFicar: z.object({ segundos: positivo, duracao: positivo }).strict().optional(),
    /** Efeitos quando a área some (Poção Explosiva, Ossuário). */
    aoFechar: z.array(esquemaEfeito).default([]),
    /**
     * Estouro em volta de onde o projétil acaba (Vassoura Disparada) ou de onde o dash pousa
     * (Salto de Vassoura): uma fração do dano da habilidade em quem estiver no raio, e um empurrão
     * para longe do centro (chefes não são empurrados).
     */
    estouro: z
      .object({ raio: positivo, fracaoDano: z.number().min(0), empurrao: z.number().min(0) })
      .strict()
      .optional(),
    /** O dash deixa uma linha que machuca (Rastro de Faíscas). */
    rastro: z
      .object({
        largura: positivo,
        duracao: positivo,
        intervalo: positivo,
        efeitos: z.array(esquemaEfeito),
      })
      .strict()
      .optional(),
    /** Efeitos da área em quem é do lado de quem lançou (Névoa). */
    afetaAliados: z.array(esquemaEfeito).default([]),
    /** Inimigos dentro da área não saem (Ossuário). */
    confina: z.boolean().default(false),
    /** A área vira sombra para a regra da luz (Névoa). */
    sombra: z.boolean().default(false),
    velocidadeSeguir: positivo.default(4),
    /** Cura uma fração do dano causado (Mordida). */
    curaPorDano: z.number().min(0).default(0),
    /** Se o alvo cair, a recarga reinicia (Assombração). */
    reiniciaAoAbater: z.boolean().default(false),
    saltaAoAbater: z.object({ raio: positivo }).strict().optional(),
    /** Medo no alvo antes do golpe (Pesadelo). */
    medoAntes: segundos.default(0),
    /** O dash pode voltar ao ponto de partida apertando de novo, dentro da janela (Retorno). */
    retorno: z.object({ janela: positivo }).strict().optional(),
  })
  .strict()
  .superRefine((h, ctx) => {
    if (h.tecla === 'ataque') return;
    const postos = h.tecla === 'R' ? 3 : 5;
    const listas: [string, readonly number[]][] = [['recarga', h.recarga]];
    for (const e of h.efeitos) {
      if (e.tipo === 'dano' || e.tipo === 'dot' || e.tipo === 'escudo')
        listas.push([`${e.tipo}.base`, e.base]);
    }
    for (const [nome, lista] of listas) {
      if (lista.length !== postos) {
        ctx.addIssue({
          code: 'custom',
          message: `${h.id}: ${nome} precisa de ${postos} valores (um por posto)`,
        });
      }
    }
  });

export const esquemaHabilidades = z
  .object({ habilidades: z.array(esquemaHabilidade).min(1) })
  .strict()
  .refine((c) => new Set(c.habilidades.map((h) => h.id)).size === c.habilidades.length, {
    message: 'ids de habilidade repetidos',
  });

/**
 * Evolução de uma habilidade no posto 3 (no R, o Despertar): o que muda nela até o fim da run. A
 * habilidade evoluída é montada em `src/sim/evolucoes.ts` e validada de novo pelo esquema acima.
 */
export const esquemaEvolucao = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    nome: z.string(),
    descricao: z.string(),
    /** Campos da habilidade trocados: objetos se mesclam; listas e valores são substituídos. */
    muda: z.record(z.string(), z.unknown()).default({}),
    /** Efeitos somados aos da habilidade. */
    efeitos: z.array(esquemaEfeito).default([]),
    /** Segundos a mais de recarga em todos os postos (Vassoura Pesada). */
    recargaExtra: z.number().default(0),
    /** Multiplica todo o dano da habilidade (Abóbora Gigante). */
    multDano: positivo.default(1),
    /** Ao sumir, a área explode com esta fração do dano por segundo (Poção Explosiva). */
    explodeAoFechar: positivo.optional(),
  })
  .strict();

export const esquemaEvolucoes = z
  .object({
    /** Por id de habilidade: as 2 evoluções (no R, os 2 Despertares). */
    evolucoes: z.record(z.string(), z.array(esquemaEvolucao).length(2)),
  })
  .strict()
  .refine(
    (c) => {
      const ids = Object.values(c.evolucoes).flatMap((l) => l.map((e) => e.id));
      return new Set(ids).size === ids.length;
    },
    { message: 'ids de evolução repetidos' },
  );

const esquemaPassiva = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('caldeirao'),
      /** Depois de tantas habilidades lançadas, a próxima sai fortalecida. */
      aCada: z.number().int().positive(),
      bonusDano: z.number().min(0),
      raioExplosao: positivo,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('arrepio'),
      /** Medo nas pestinhas atingidas pelo primeiro golpe depois de sair da sombra. */
      medo: positivo,
      /** Segundos na sombra (ou invisível) para o próximo golpe ficar preparado. */
      sombraS: positivo,
      /** Raio, em volta do alvo, em que as pestinhas se assustam. */
      raio: positivo,
      /** Quem conta como pestinha para o Medo. */
      assusta: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('remontar'),
      desmontadoS: positivo,
      voltaCom: fracao,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('sede'),
      rouboVida: fracao,
      rouboVidaNaSombra: fracao,
    })
    .strict(),
  // Passivas alternativas (maestria 4, GAMEPLAY.md).
  z
    .object({
      /** Feitiço Instável: chance de a habilidade sair em dobro, ou de falhar. */
      tipo: z.literal('instavel'),
      chanceDobro: fracao,
      chanceFalha: fracao,
    })
    .strict(),
  /** Frio na Espinha: inimigos atrás do lançador (pelo olhar dele) recebem dano a mais. */
  z.object({ tipo: z.literal('frioNaEspinha'), bonus: positivo }).strict(),
  /** Ossos Ocos: sem Remontar, com velocidade e dano do E a mais. */
  z.object({ tipo: z.literal('ossosOcos'), velocidade: positivo, danoE: positivo }).strict(),
  /** Luz do Dia: roubo de vida igual na luz e na sombra; cura ao derrubar um Poste. */
  z.object({ tipo: z.literal('luzDoDia'), rouboVida: fracao, curaPoste: fracao }).strict(),
]);

/**
 * O golpe que fecha o combo corpo a corpo de cada campeão:
 * - `arco`: o mesmo arco dos outros golpes, mais forte, empurrando quem recua;
 * - `passagem`: atravessa os inimigos em linha reta (`distancia` tiles, faixa de `largura`) e
 *   acerta todos no caminho;
 * - `pancada`: bate no chão e acerta todos a até `raio` tiles em volta, empurrando para fora;
 * - `puxao`: o arco, e as garras puxam quem acertou até `distancia` tiles para perto, curando
 *   `rouboExtra` do dano.
 */
const esquemaFinalDoCombo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('arco') }).strict(),
  z
    .object({
      tipo: z.literal('passagem'),
      distancia: positivo,
      largura: positivo,
      velocidade: positivo,
    })
    .strict(),
  z.object({ tipo: z.literal('pancada'), raio: positivo, empurrao: z.number().min(0) }).strict(),
  z
    .object({
      tipo: z.literal('puxao'),
      distancia: positivo,
      velocidade: positivo,
      rouboExtra: fracao,
    })
    .strict(),
]);

const esquemaAutoAtaque = z
  .object({
    alcance: positivo,
    porSegundo: positivo,
    base: z.number().min(0),
    razao: z.number().min(0),
    atributo: atributoDeDano,
    /** Projétil teleguiado (tiles/s); sem ele, o golpe é corpo a corpo. */
    projetil: z.object({ velocidade: positivo }).strict().nullable(),
    preparo: segundos,
    /**
     * O jeito do combo corpo a corpo deste campeão (sem ele, o de `combate.ataqueManual`): quantos
     * golpes, o arco e o alcance extra dos golpes comuns, o multiplicador e o golpe final.
     */
    combo: z
      .object({
        golpes: z.number().int().min(1).optional(),
        arcoGraus: z.number().min(10).max(360).optional(),
        alcanceExtra: z.number().min(0).optional(),
        multFinal: z.number().min(1).optional(),
        final: esquemaFinalDoCombo.default({ tipo: 'arco' }),
      })
      .strict()
      .optional(),
  })
  .strict();

export const esquemaCampeao = z
  .object({
    nome: z.string(),
    papel: z.string(),
    descricao: z.string(),
    coragem: positivo,
    energia: positivo,
    regenEnergiaPorS: z.number().min(0),
    atributoPrincipal: atributoDeDano,
    atributos: z
      .object({
        forca: z.number().min(0),
        feitico: z.number().min(0),
        resistencia: z.number().min(0),
        pressa: z.number().min(0),
      })
      .strict(),
    autoAtaque: esquemaAutoAtaque,
    habilidades: z.object({ Q: z.string(), W: z.string(), E: z.string(), R: z.string() }).strict(),
    passiva: esquemaPassiva,
    nomePassiva: z.string(),
    descricaoPassiva: z.string(),
    /** A passiva que a maestria 4 libera (GAMEPLAY.md, "Passivas alternativas"). */
    passivaAlternativa: z
      .object({ nome: z.string(), descricao: z.string(), passiva: esquemaPassiva })
      .strict(),
    desbloqueio: z.enum(['inicial', 'bairro1', 'bairro2', 'vitoria']),
  })
  .strict();

export const esquemaCampeoes = z.record(z.string().regex(/^[a-z0-9_]+$/), esquemaCampeao);

export const esquemaCombate = z
  .object({
    pressaMaxima: z.number().min(0).max(100),
    danoCritico: positivo,
    /** Dano por segundo sai em pedaços a cada tanto (para os números não virarem chuva). */
    dotIntervaloDano: positivo,
    recuo: z.object({ distancia: positivo, velocidade: positivo }).strict(),
    foraDeCombate: z.object({ segundos: positivo, bonusVelocidade: z.number().min(0) }).strict(),
    estados: z.object({ chefeLentidao: fracao, chefeFracaoDuracao: fracao }).strict(),
    comandoGuardadoS: segundos,
    fracaoRecargaInterrompida: fracao,
    raioBuscaAlvo: positivo,
    quaseAcertoTiles: positivo,
    assistenciaMiraGraus: z.number().min(0).max(45),
    /**
     * Ataque básico manual do jogador (PLANO_JOGABILIDADE.md, passo 2): sai no botão esquerdo, na
     * direção da mira. Corpo a corpo acerta todos num arco de `arcoGraus` à frente (alcance do
     * campeão + `alcanceExtra`), em combo de `golpesNoCombo`; o último bate `multUltimo` vezes e
     * empurra `empurraoUltimo` tiles. Uma pausa maior que `janelaComboS` recomeça o combo. Quem
     * atira (Bruxinha) solta um projétil reto de `alcanceProjetil` tiles, puxado para o inimigo que
     * estiver a até `assistenciaGraus` da mira.
     */
    ataqueManual: z
      .object({
        arcoGraus: z.number().min(10).max(360),
        alcanceExtra: z.number().min(0),
        golpesNoCombo: z.number().int().min(1),
        janelaComboS: positivo,
        multUltimo: z.number().min(1),
        empurraoUltimo: z.number().min(0),
        alcanceProjetil: positivo,
        assistenciaGraus: z.number().min(0).max(45),
        /** Quem atira: o último golpe do combo sai em leque (n projéteis no ângulo em graus). */
        lequeUltimo: z
          .object({ n: z.number().int().min(1), angulo: z.number().min(0) })
          .strict()
          .default({ n: 1, angulo: 0 }),
        /** Energia que um golpe que acerta devolve (uma vez por golpe e por tick). */
        energiaPorAcerto: z.number().min(0).default(0),
      })
      .strict(),
    /** Alcance extra para achar alvo no atacar e mover. */
    aquisicaoTiles: z.number().min(0),
    luz: z
      .object({
        maxima: positivo,
        custoPulso: positivo,
        raioPulso: positivo,
        duracaoPulso: positivo,
        empurraoPulso: positivo,
        recargaPorS: positivo,
      })
      .strict(),
    niveis: z
      .object({
        maximo: z.number().int().positive(),
        xpBase: positivo,
        xpPorNivel: z.number().min(0),
        coragemPorNivel: z.number().min(0),
        atributoPorNivel: z.number().min(0),
        niveisDoR: z.array(z.number().int().positive()),
        postoMaximo: z.number().int().positive(),
        postoMaximoR: z.number().int().positive(),
        postoDaEvolucao: z.number().int().positive(),
      })
      .strict(),
    bonecoTreino: z
      .object({
        coragem: positivo,
        resistencia: z.number().min(0),
        raio: positivo,
        renascerS: positivo,
        /** XP por boneco derrubado (para treinar os níveis na rua de teste). */
        xp: z.number().min(0),
      })
      .strict(),
  })
  .strict();

const intervalo = z.tuple([z.number().int().min(0), z.number().int().min(0)]);

/** Pesos por modelo de casa (os que faltam valem 0). */
const pesosDeCasa = z.partialRecord(z.enum(MODELOS_DE_CASA), z.number().min(0));
/** Pesos de qualquer modelo que pode virar lote da cidade em volta. */
const pesosDeLote = z.partialRecord(
  z.enum(['predio', 'edificio', ...MODELOS_DE_CASA]),
  z.number().min(0),
);

export const esquemaGerador = z
  .object({
    rua: z
      .object({
        comprimento: positivo,
        largura: positivo,
        calcada: z.number().min(0),
        /** Jardim entre a frente das casas e a calçada. */
        jardim: z.number().min(0),
        margem: positivo,
      })
      .strict(),
    /** Faixa das casas entre o jardim e a cerca dos fundos, em tiles. */
    faixaDasCasas: positivo,
    quintal: z.object({ largura: positivo, profundidade: positivo }).strict(),
    viela: z.object({ largura: positivo }).strict(),
    folgaEntreCasas: z.tuple([z.number().min(0), z.number().min(0)]),
    /**
     * A rota de uma rua de luta (docs/DESIGN.md, seção 9): um caminho linear que serpenteia por
     * uma grade de quarteirões, de sala em sala, com becos laterais opcionais.
     */
    rota: z
      .object({
        /** Lado de cada célula da grade grande (um quarteirão), em tiles. */
        celula: positivo,
        colunas: z.number().int().min(3),
        linhas: z.number().int().min(3),
        /** Faixa em volta da grade (o portão de saída fica nela). */
        margem: positivo,
        /**
         * Encruzilhada do fim da rua (PLANO_MUNDO_VIVO.md, passo 9): uma rua de ligação no alto do
         * largo final e um ramal por rota (`espaco` tiles entre eles), cada um com `pista` e
         * `calcada`, o portão `recuoPortao` tiles ao norte da ligação e a saída `alemDoPortao`
         * tiles depois dele. A faixa do norte (`margemNorte`) dá lugar aos ramais.
         */
        encruzilhada: z
          .object({
            margemNorte: positivo,
            espaco: positivo,
            pista: positivo,
            calcada: positivo,
            recuoPortao: positivo,
            alemDoPortao: positivo,
          })
          .strict(),
        /** Quantos nós (cruzamentos ou salas) a rota tem, da entrada à saída. */
        nos: intervalo,
        /** Chance de a rota seguir reto em vez de virar. */
        chanceDeReta: fracao,
        /** Becos laterais (sem saída) com quintal, cemitério, mirante ou esconderijo. */
        ramos: intervalo,
        rua: z.object({ pista: positivo, calcada: positivo }).strict(),
        beco: z.object({ pista: positivo, calcada: positivo }).strict(),
        /** Meio lado de cada sala, em tiles. */
        salas: z
          .object({
            largo: positivo,
            poste: positivo,
            praca: positivo,
            obras: positivo,
            patio: positivo,
            quintal: positivo,
            cemiterio: positivo,
            mirante: positivo,
            poco: positivo,
            velas: positivo,
            assombrada: positivo,
          })
          .strict(),
        /** Onde ficam as salas ao longo da rota (fração do caminho). */
        posicoes: z.object({ poste: fracao, praca: fracao, obras: fracao }).strict(),
        tiposDeRamo: z.partialRecord(
          z.enum(['quintal', 'cemiterio', 'mirante', 'segredo', 'poco', 'velas', 'assombrada']),
          z.number().min(0),
        ),
        /**
         * Atalho escuro (o anel da rota): um beco sem postes atravessando o quarteirão entre dois
         * trechos da rota que ficam a uma célula um do outro, ligando nós a pelo menos
         * `ganhoMinimo` nós de distância. Tem `lixeiras` e um baú no meio.
         */
        atalho: z
          .object({
            ativo: z.boolean(),
            ganhoMinimo: z.number().int().min(2),
            lixeiras: z.number().int().min(0),
          })
          .strict(),
        /** Grupos de pestinhas dormindo pelo caminho (acordam quando o jogador chega perto). */
        encontros: z
          .object({
            porNo: z.number().min(0),
            tamanho: intervalo,
            /** Fração da rota (em nós) antes da qual não há grupos dormindo. */
            desdeFracao: fracao,
          })
          .strict(),
        postesNasRuas: positivo,
        chanceDeCarroNasRuas: fracao,
        /** Chance, por rua da rota, de uma abóbora gigante na calçada (explode quando quebra). */
        chanceDeAboboraGigante: fracao,
        buracos: intervalo,
        /** Fração da rota a partir da qual as casas viram comércio. */
        comercioDesde: fracao,
        /** Como fecha a ponta de um beco sem saída, por peso. */
        pontas: z.partialRecord(
          z.enum(['obra', 'buraco', 'barreira', 'deslizamento']),
          z.number().min(0),
        ),
        /** Chance de um quarteirão de fora da rota ser um morro. */
        chanceDeMorro: fracao,
        /** Chance de um lado da cidade ser a encosta de um morro (limite natural). */
        chanceDeSerra: fracao,
        /** Até onde (tiles) a câmera mostra a partir do caminho: além disso não há cenário. */
        alcanceDaCamera: positivo,
        /** As ruas da cidade que a rota não usa (só cenário). */
        ruaDeFora: z.object({ pista: positivo, calcada: positivo }).strict(),
        /** Como fecha a rua de fora onde ela encosta na rota, por peso (só fechos finos). */
        juncoes: z.partialRecord(z.enum(['obra', 'barreira']), z.number().min(0)),
      })
      .strict(),
    /** A praça do meio, de um lado da rua: o que fica no centro dela, por peso. */
    praca: z
      .object({
        centro: z.partialRecord(z.enum(['chafariz', 'coreto', 'parquinho']), z.number().min(0)),
        postes: z.number().int().min(0),
      })
      .strict(),
    /** O 1º Poste fica na sala do cruzamento; o 2º, no pátio da escola ou no estacionamento. */
    postesCorrompidos: z
      .object({
        afastamentoDoMeio: z.number().min(0),
        segundoEm: z.array(z.enum(['escola', 'estacionamento'])).min(1),
      })
      .strict(),
    bueiros: z
      .object({ distanciaDaSaida: positivo, afastamentoDoMeio: z.number().min(0) })
      .strict(),
    /** Carros estacionados no meio-fio (cobertura): quantos e a folga até Postes e bueiros. */
    carros: z
      .object({
        vagas: intervalo,
        folga: positivo,
        /** Peso de cada veículo do Codex (src/render/modelosBairro.ts) nas vagas e no meio-fio. */
        variantes: z.partialRecord(z.enum(VARIANTES_DE_CARRO), z.number().min(0)),
      })
      .strict(),
    cerca: z.object({ segmento: positivo }).strict(),
    enfeites: z
      .object({
        arvoresPorQuintal: intervalo,
        arvoresNaCalcada: intervalo,
        lixeiras: intervalo,
        bancos: intervalo,
        hidrantes: intervalo,
        /** Chance de cada casa ter caixa de correio, abóbora acesa e lápide no jardim. */
        caixaDeCorreio: fracao,
        abobora: fracao,
        lapide: fracao,
      })
      .strict(),
    /** Pontos de exploração do bairro aberto (docs/DESIGN.md, seção 10). */
    exploracao: z
      .object({
        campainhas: intervalo,
        /**
         * Mínimo de portas com interação (campainhas e Casas Desconfiadas) em cada rua com nome
         * do mapa; faltando, casas da rua viram campainhas (se houver casas nela).
         */
        casasPorRua: z.number().int().min(0),
        /**
         * Casas Desconfiadas (com aldrava): quantas por bairro, só nos lotes dos `modelos` dados (os
         * maiores viram casa térrea, alinhada pela fachada), a pelo menos `distanciaEntre` tiles umas
         * das outras e `longeDaSaida` da saída da rua.
         */
        desconfiadas: z
          .object({
            porBairro: z.array(intervalo).min(1),
            modelos: z.array(z.enum(MODELOS_DE_CASA)).min(1),
            distanciaEntre: positivo,
            longeDaSaida: positivo,
          })
          .strict(),
        segredos: z.number().int().min(0),
        distanciaEntreSegredos: positivo,
        postesParaReligar: intervalo,
      })
      .strict(),
    /** Nomes das ruas e lugares do bairro (o rastreador diz onde o jogador está). */
    nomes: z
      .object({
        avenidas: z.array(z.string()).min(1),
        ruas: z.array(z.string()).min(2),
        travessas: z.array(z.string()).min(1),
        pracas: z.array(z.string()).min(1),
        escolas: z.array(z.string()).min(1),
        estacionamentos: z.array(z.string()).min(1),
        obras: z.array(z.string()).min(1),
        cemiterios: z.array(z.string()).min(1),
        becos: z.array(z.string()).min(1),
        largos: z.array(z.string()).min(2),
      })
      .strict(),
    bairros: z
      .array(
        z
          .object({
            casas: pesosDeCasa,
            /** Pesos das casas no trecho do comércio. */
            comercio: pesosDeCasa,
            postesAmigos: intervalo,
            /** Árvore das calçadas e dos quintais: copa redonda, pinheiro ou seca. */
            arvores: z.partialRecord(
              z.enum(['arvore', 'pinheiro', 'arvore_seca']),
              z.number().min(0),
            ),
          })
          .strict(),
      )
      .min(1),
    /** A cidade em volta da área jogável (só desenho). */
    cidade: z
      .object({
        /** Largura do anel de cidade em volta, em tiles (a câmera não vê além dele). */
        anel: positivo,
        calcada: positivo,
        pista: positivo,
        /** Recuo dos lotes em relação à calçada. */
        recuo: z.number().min(0),
        folgaEntreLotes: z.tuple([z.number().min(0), z.number().min(0)]),
        postesACada: positivo,
        arvoresACada: positivo,
        chanceDeCarro: fracao,
        /** Fração dos veículos parados na cidade que são o micro-ônibus (quando ele cabe). */
        chanceDeOnibus: fracao,
        chanceDeApagada: fracao,
        lotes: pesosDeLote,
        marcos: z.array(z.enum(['igreja', 'escola', 'caixa_dagua', 'galpao'])),
      })
      .strict(),
    /** A praça do chefe: cercada, postes nos cantos, casas em volta, portão ao norte. */
    arena: z
      .object({
        largura: positivo,
        profundidade: positivo,
        postes: z.number().int().min(0),
        bancos: z.number().int().min(0),
        arvores: z.number().int().min(0),
        larguraPortao: positivo,
        /**
         * Chefes que ficam numa casa do lado oeste da praça (a Viúva no mirante): o modelo da casa
         * (null = lado vazio, o chefe é a própria casa) e onde ele nasce, em tiles a leste da cerca
         * oeste (negativo = dentro da casa).
         */
        /**
         * Pátio próprio de um chefe (docs/PLANO_MUNDO_VIVO.md, frente 2): o tamanho, a guarita
         * (cobertura), os canteiros (quebráveis que tiram a proteção dele) e a cancela no portão.
         * Posições em tiles a partir do centro da praça.
         */
        patio: z
          .record(
            z.string(),
            z
              .object({
                largura: positivo,
                profundidade: positivo,
                guarita: z.tuple([z.number(), z.number()]).nullable(),
                canteiros: z.array(z.tuple([z.number(), z.number()])),
                cancela: z.boolean(),
                /** Velas da Viúva no chão (do meio do pátio), apagadas no começo. */
                velas: z.array(z.tuple([z.number(), z.number()])).default([]),
                /** Espelhos da Moradora (quebráveis; enquanto houver um, ela se protege). */
                espelhos: z.array(z.tuple([z.number(), z.number()])).default([]),
                /** Patamar de pedra diante da casa do chefe (o jardim em duas alturas). */
                patamar: z.boolean().default(false),
              })
              .strict(),
          )
          .default({}),
        lugarDoChefe: z
          .record(
            z.string(),
            z
              .object({
                casa: z.enum(MODELOS_DE_CIDADE).nullable(),
                dx: z.number(),
                /**
                 * Chefe que é a própria casa: o corpo dela (x a partir da cerca oeste, metade da
                 * largura em y) vira obstáculo e a cerca diante dele sai (a fachada fecha a praça).
                 */
                corpo: z
                  .object({ x0: z.number(), x1: z.number(), meiaLargura: positivo })
                  .strict()
                  .optional(),
              })
              .strict(),
          )
          .default({}),
      })
      .strict(),
    /** A calçada calma da fase Porta a Porta: casas de um lado, banco e postes do outro. */
    portaAPorta: z
      .object({
        comprimento: positivo,
        faixaDosFundos: positivo,
        larguraDaRua: positivo,
        faixaDoBanco: positivo,
        casas: z.number().int().positive(),
        inicioDasCasas: positivo,
        espacoEntreCasas: positivo,
        postes: z.number().int().min(0),
        arvores: z.number().int().min(0),
        afastamentoDaPorta: positivo,
      })
      .strict(),
  })
  .strict();

export const COMPORTAMENTOS = [
  'onda',
  'arremessador',
  'canhao',
  'torre',
  'cao',
  'corvo',
  'gato',
  'casa',
  'vizinho',
  'cobrador',
  'sombra',
  'guarda',
  'chefe',
  'viuva',
  'dono',
  'crianca',
  'moradora',
  'saco',
  'morcego',
  'espantalho',
  'vela',
] as const;

export const esquemaInimigo = z
  .object({
    nome: z.string(),
    comportamento: z.enum(COMPORTAMENTOS),
    coragem: positivo,
    resistencia: z.number().min(0),
    velocidade: z.number().min(0),
    raio: positivo,
    xp: z.number().min(0),
    doces: z.number().min(0),
    solido: z.boolean(),
    autoAtaque: esquemaAutoAtaque.optional(),
    /** Ids de habilidades (tecla `ataque`) em content/habilidades.json. */
    ataques: z.array(z.string()),
    /** Números próprios do comportamento. */
    param: z.record(z.string(), z.number()).default({}),
    elite: z.boolean().default(false),
    /** Chefe: Coragem e dano próprios do bairro dele (não crescem com a escala do bairro). */
    chefe: z.boolean().default(false),
    /** Nome de cada fase do chefe, para a barra da interface ("Fase 1", "Andar 2"...). */
    fases: z.array(z.string()).min(1).optional(),
    /** Só anda na sombra, recua da luz e é empurrada pelo pulso da lanterna. */
    daSombra: z.boolean().default(false),
    /** Vigia: na sombra só enxerga o jogador de perto. */
    vigia: z.boolean().default(false),
    /** Pode ser derrubado sem recuar (elites e chefes não recuam). */
    recua: z.boolean().default(true),
  })
  .strict();

export const ECOS_DA_COBRANCA = ['apagarPoste', 'elite', 'pestinhas', 'areaEscura'] as const;

export const esquemaInimigos = z
  .object({
    inimigos: z.record(z.string(), esquemaInimigo),
    escalaPorBairro: z
      .object({ coragem: z.array(positivo).min(1), dano: z.array(positivo).min(1) })
      .strict(),
    doceIsca: z.object({ duracao: positivo, raio: positivo, preco: z.number().min(0) }).strict(),
    /** Elite reforçado (GAMEPLAY.md, "Curva das ruas"): +30% de Coragem e de dano. */
    eliteReforcado: z.number().min(0),
    /** A elite da rua nasce quando o 1º Poste cai ou neste tempo; as de preço, logo no começo. */
    elitesNaRua: z.object({ aosSegundos: positivo, extrasAosSegundos: positivo }).strict(),
    /**
     * Cobrança do Dono do Bairro (GDD): o eco de cada preço pago, pelo tipo do efeito dele (poste
     * que se apaga, a elite do preço, pestinhas); os outros viram uma área escura.
     */
    cobranca: z
      .object({
        porEfeito: z.record(z.string(), z.enum(ECOS_DA_COBRANCA)),
        padrao: z.enum(ECOS_DA_COBRANCA),
        pestinhas: z.number().int().positive(),
        maxElites: z.number().int().min(0),
        areaEscura: z.object({ raio: positivo, duracaoS: positivo }).strict(),
      })
      .strict()
      .optional(),
    doces: z
      .object({ raioColeta: positivo, raioIma: positivo, velocidadeIma: positivo, vidaS: positivo })
      .strict(),
    /**
     * Inimigos que reagem (docs/PLANO_MUNDO_VIVO.md, frente 4). `cerco`: perto do jogador
     * (`raio`), só `atacantesMax` atacam e os outros esperam em `vagas` num anel de raio `anel`, que
     * gira `giroPorS` rad/s; a chave de quem ataca é a distância menos `pesoEspera` × segundos
     * esperando (menos `bonusAtacante` para quem já ataca). `interromperPreparo`: o golpe do jogador
     * durante o preparo do inimigo pequeno cancela o ataque e põe essa recarga. `lanterna`: o pulso
     * dá medo a essas espécies. `aliadoCaiu`: quem está perto de um aliado que cai hesita.
     * `vidaBaixa`: abaixo dessa fração, essas espécies fogem para perto de um aliado.
     */
    /** Saco-Surpresa: quantas lixeiras de cada rua são, na verdade, um Saco-Surpresa. */
    sacosPorRua: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    /**
     * Inimigos encantados (docs/PLANO_MUNDO_VIVO.md, frente 4): `chance` de um comum (dos
     * `comportamentos`) nascer com um traço, sorteado pelos `pesos`: Apressado (+velocidade),
     * Encouraçado (escudo que aguenta `golpes`), Explosivo (estoura ao cair, com aviso) ou Chamador
     * (chama `n` aliados ao ver o jogador).
     */
    encantos: z
      .object({
        chance: fracao,
        comportamentos: z.array(z.string()),
        pesos: z.record(z.string(), z.number().min(0)),
        nomes: z.record(z.string(), z.string()),
        apressado: z.object({ velocidade: positivo }).strict(),
        encouracado: z.object({ golpes: z.number().int().positive() }).strict(),
        explosivo: z.object({ avisoS: positivo, raio: positivo, dano: positivo }).strict(),
        chamador: z
          .object({ raioVer: positivo, n: z.number().int().positive(), especie: z.string() })
          .strict(),
      })
      .strict(),
    reacoes: z
      .object({
        cerco: z
          .object({
            especies: z.array(z.string()),
            raio: positivo,
            anel: positivo,
            vagas: z.number().int().positive(),
            atacantesMax: z.number().int().positive(),
            pesoEspera: z.number().min(0),
            bonusAtacante: z.number().min(0),
            /** Depois de `turnoS` atacando, a chave de quem ataca sobe `pesoEspera` por segundo. */
            turnoS: positivo,
            giroPorS: z.number(),
            /**
             * Quem ataca encosta a `encostar` tiles do jogador, cada um num lado; a até `contornarAte`
             * tiles, contorna o jogador a `raioDeContorno` tiles até chegar ao seu lado.
             */
            encostar: positivo,
            contornarAte: positivo,
            raioDeContorno: positivo,
          })
          .strict(),
        interromperPreparo: z.object({ recargaS: positivo }).strict(),
        lanterna: z.object({ especies: z.array(z.string()), medoS: positivo }).strict(),
        aliadoCaiu: z.object({ raio: positivo, segundos: positivo }).strict(),
        vidaBaixa: z
          .object({ especies: z.array(z.string()), fracao: fracao, raioAliado: positivo })
          .strict(),
        /**
         * Táticas de todos (src/sim/taticas.ts): separação entre aliados, flanco (cada um chega por
         * um lado), esquiva dos projéteis do jogador (chance por espécie) e sair das áreas dele que
         * ainda vão pulsar.
         */
        taticas: z
          .object({
            separacao: z.object({ raio: positivo, peso: z.number().min(0) }).strict(),
            flanco: z
              .object({
                especies: z.array(z.string()),
                /** Começa a curvar a `desde` tiles do jogador e vai reto a partir de `ate`. */
                desde: positivo,
                ate: positivo,
                peso: z.number().min(0),
              })
              .strict(),
            esquiva: z
              .object({
                chance: z.record(z.string(), fracao),
                recargaS: positivo,
                distancia: positivo,
                velocidade: positivo,
                /** Desvia do projétil que chega em até `avisoS` segundos. */
                avisoS: positivo,
              })
              .strict(),
            areas: z
              .object({ especies: z.array(z.string()), pulsosMin: z.number().int().positive() })
              .strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const esquemaOndas = z
  .object({
    /**
     * `pontos`: as pestinhas saem dos bueiros da rota (um a cada `pontos.aCada`), cada um quando o
     * jogador passa a até `pontos.raioGatilho` tiles (parado, nada nasce); os morceguinhos do
     * `enxame` continuam por tempo (a cada `intervalo` s, de um bueiro perto do jogador).
     * `tempo`: uma onda a cada `intervalo` segundos, dos bueiros perto do jogador.
     */
    modo: z.enum(['pontos', 'tempo']).default('tempo'),
    pontos: z
      .object({
        raioGatilho: positivo,
        /** Nenhum ponto a menos que isso (tiles pelo caminho) da entrada da rua. */
        longeDaEntrada: positivo,
        /** Um bueiro a cada `aCada` pela rota vira ponto (1 = todos). */
        aCada: z.number().int().min(1),
      })
      .strict()
      .optional(),
    primeiraEm: segundos,
    intervalo: positivo,
    total: z.number().int().positive(),
    porBairro: z.array(z.number().int().positive()).min(1),
    intervaloEntreNascimentos: segundos,
    composicao: z.array(z.record(z.string(), z.number().min(0))).min(1),
    primeiraSoLencois: z.boolean(),
    /** A partir desta onda, parte das pestinhas sai também do bueiro da obra (flanco). */
    flancoDesdeOnda: z.number().int().positive(),
    /** Cada onda sai dos bueiros mais perto do jogador, nem perto nem longe demais (tiles). */
    bueirosPorOnda: z.number().int().positive(),
    distanciaMinima: positivo,
    distanciaMaxima: positivo,
    /** Grupos dormindo pela rota: acordam com o jogador a até `raioDespertar` tiles. */
    encontros: z.object({ raioDespertar: positivo, espalhar: positivo }).strict(),
    /** A partir de `desdeOnda`, a onda pode trazer `n` Pestinhas de Vela (chance por bairro). */
    vela: z
      .object({
        especie: z.string(),
        n: z.number().int().positive(),
        desdeOnda: z.number().int().positive(),
        chancePorBairro: z.array(fracao).min(1),
      })
      .strict(),
    /** Espantalhos de Quintal: `n` num quintal da rua, com a chance do bairro (trocam de lugar). */
    espantalhos: z
      .object({
        especie: z.string(),
        n: z.number().int().min(2),
        chancePorBairro: z.array(fracao).min(1),
      })
      .strict(),
    /** A partir de `desdeOnda`, a onda pode trazer um enxame de `n` morceguinhos (chance por bairro). */
    enxame: z
      .object({
        especie: z.string(),
        n: z.number().int().positive(),
        desdeOnda: z.number().int().positive(),
        chancePorBairro: z.array(fracao).min(1),
      })
      .strict(),
  })
  .strict();

export const esquemaSusto = z
  .object({
    maximo: positivo,
    eventos: z
      .object({
        acertoHabilidade: z.number(),
        acertosPorLancamento: z.number().int().positive(),
        acertoAuto: z.number(),
        derrota: z.number(),
        derrotaElite: z.number(),
        interromper: z.number(),
        quaseAcerto: z.number(),
      })
      .strict(),
    fracaoPerdidaAoSerAtingido: fracao,
    esvaziaDepoisDe: positivo,
    esvaziaPorS: positivo,
    faixas: z
      .array(
        z
          .object({
            nome: z.string(),
            desde: z.number().min(0),
            doces: positivo,
            velocidade: z.number().min(0),
          })
          .strict(),
      )
      .min(1),
    frenesi: z
      .object({ duracao: positivo, velocidadeRecarga: z.number().min(0), doces: positivo })
      .strict(),
  })
  .strict();

export const MARCAS = ['luz', 'sombra', 'doce', 'eco', 'abobora', 'pacto'] as const;

/** Efeitos de tratos, preços, itens e Conjuntos: cada tipo é interpretado em src/sim/tratos.ts. */
export const esquemaEfeitoDeRun = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('atributo'),
      atributo: z.enum(ATRIBUTOS),
      soma: z.number().optional(),
      mult: z.number().optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('atributoPrincipal'), soma: z.number() }).strict(),
  z.object({ tipo: z.literal('todosAtributos'), mult: z.number() }).strict(),
  z.object({ tipo: z.literal('naSombra'), atributo: z.enum(ATRIBUTOS), mult: z.number() }).strict(),
  z.object({ tipo: z.literal('escudoAoEntrar'), fracao, duracao: positivo }).strict(),
  z
    .object({
      tipo: z.literal('repeteHabilidade'),
      tecla: z.enum(TECLAS),
      atraso: segundos,
      fracao: positivo,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('explodeAoDerrotar'),
      chance: fracao,
      fracao: positivo,
      raio: positivo,
    })
    .strict(),
  z.object({ tipo: z.literal('bauTrancado'), doces: positivo }).strict(),
  z.object({ tipo: z.literal('pulsoCura'), fracao }).strict(),
  z.object({ tipo: z.literal('janelasCuram') }).strict(),
  z.object({ tipo: z.literal('raioLanterna'), soma: z.number() }).strict(),
  z.object({ tipo: z.literal('saiDaSombraInvisivel'), duracao: positivo }).strict(),
  z.object({ tipo: z.literal('postesApagados'), n: z.number().int().positive() }).strict(),
  z.object({ tipo: z.literal('iscaGratisPorRua'), n: z.number().int().positive() }).strict(),
  z.object({ tipo: z.literal('curaAoComprar'), fracao }).strict(),
  z.object({ tipo: z.literal('docesPorInimigo'), soma: z.number() }).strict(),
  z.object({ tipo: z.literal('precoDoBanco'), mult: z.number() }).strict(),
  z.object({ tipo: z.literal('rReiniciaE') }).strict(),
  z.object({ tipo: z.literal('autoReduzRecargas'), segundos: positivo }).strict(),
  /** Deixa no chão a área de uma habilidade (content/habilidades.json) onde a abóbora explodiu. */
  z.object({ tipo: z.literal('chaoEmChamas'), habilidade: z.string() }).strict(),
  z.object({ tipo: z.literal('explosoesIluminam'), duracao: positivo, raio: positivo }).strict(),
  z
    .object({
      tipo: z.literal('espantalho'),
      limiar: fracao,
      raio: positivo,
      empurrao: positivo,
      dano: positivo,
    })
    .strict(),
  z.object({ tipo: z.literal('proximoComDoisPrecos') }).strict(),
  z.object({ tipo: z.literal('cobradorSoltaDoces'), doces: positivo }).strict(),
  z.object({ tipo: z.literal('apagaPrecoMaisAntigo') }).strict(),
  z.object({ tipo: z.literal('bauDaItem') }).strict(),
  z.object({ tipo: z.literal('curaPostes'), mult: positivo }).strict(),
  z
    .object({ tipo: z.literal('pulsoCausaDano'), base: positivo, razao: z.number().min(0) })
    .strict(),
  z.object({ tipo: z.literal('noiteEterna') }).strict(),
  z.object({ tipo: z.literal('fomeDeDoce'), porCem: positivo, maximo: positivo }).strict(),
  z
    .object({
      tipo: z.literal('chanceDeRepetir'),
      chance: fracao,
      fracao: positivo,
      atraso: segundos,
    })
    .strict(),
  z
    .object({
      tipo: z.literal('coro'),
      aCada: z.number().int().positive(),
      fracao: positivo,
      atraso: segundos,
    })
    .strict(),
  z.object({ tipo: z.literal('colheita'), susto: z.number().min(0) }).strict(),
  z.object({ tipo: z.literal('danoPorPreco'), porPreco: positivo }).strict(),
  z.object({ tipo: z.literal('recargaPorPreco'), porPreco: positivo, maximo: positivo }).strict(),
  // Preços
  z.object({ tipo: z.literal('ruaSemLuz') }).strict(),
  z.object({ tipo: z.literal('eliteExtra'), elite: z.string() }).strict(),
  z.object({ tipo: z.literal('casasAMenos'), n: z.number().int().positive() }).strict(),
  z.object({ tipo: z.literal('semBanco') }).strict(),
  z.object({ tipo: z.literal('intervaloOndas'), segundos: positivo }).strict(),
  z.object({ tipo: z.literal('relogioAdiantado'), minutos: positivo }).strict(),
  // Consumíveis
  z.object({ tipo: z.literal('curaAoLongo'), fracao, duracao: positivo }).strict(),
  z.object({ tipo: z.literal('energia'), soma: positivo }).strict(),
  z.object({ tipo: z.literal('isca') }).strict(),
  // Tratos lendários
  /** Noite Sem Fim: o Frenesi dura `mult` vezes mais e o Susto não esvazia sozinho. */
  z.object({ tipo: z.literal('frenesiDobrado'), mult: positivo }).strict(),
  z.object({ tipo: z.literal('explosaoDisparaQ') }).strict(),
  z.object({ tipo: z.literal('relogioParado'), minutos: positivo }).strict(),
  /** Espelho do Mirante: toda habilidade também sai de um reflexo, `atraso` depois. */
  z.object({ tipo: z.literal('reflexo'), fracao: positivo, atraso: segundos }).strict(),
  z.object({ tipo: z.literal('bausMelhores') }).strict(),
]);

const esquemaTrato = z
  .object({
    nome: z.string(),
    morador: z.string(),
    marcas: z.array(z.enum(MARCAS)).max(2),
    poder: z.string(),
    efeitos: z.array(esquemaEfeitoDeRun),
    /** 1 = fraco (preços leves) a 3 = forte (só com preços pesados). */
    forca: z.number().int().min(1).max(3),
    precos: z.array(z.string()),
  })
  .strict();

const esquemaConjunto = z
  .object({
    nome: z.string(),
    dois: z.object({ texto: z.string(), efeitos: z.array(esquemaEfeitoDeRun) }).strict(),
    quatro: z
      .object({ nome: z.string(), texto: z.string(), efeitos: z.array(esquemaEfeitoDeRun) })
      .strict(),
  })
  .strict();

export const esquemaTratos = z
  .object({
    tratos: z.record(z.string(), esquemaTrato),
    especiais: z.record(z.string(), esquemaTrato),
    conjuntos: z
      .object(
        Object.fromEntries(MARCAS.map((m) => [m, esquemaConjunto])) as Record<
          (typeof MARCAS)[number],
          typeof esquemaConjunto
        >,
      )
      .strict(),
    medalha: z
      .object({
        dano: z.number(),
        coragem: z.number(),
        docesRecusa: z.number().min(0),
        paraChave: z.number().int().positive(),
      })
      .strict(),
    pechincha: z.number().min(0),
    tratosPorFase: z.number().int().positive(),
    /** Tratos lendários: só a Janela Vermelha oferece, sempre com 2 preços (GAMEPLAY.md). */
    lendarios: z.record(z.string(), esquemaTrato).default({}),
  })
  .strict();

export const esquemaPrecos = z
  .object({
    precos: z.record(
      z.string(),
      z
        .object({
          nome: z.string(),
          peso: z.enum(['leve', 'medio', 'pesado']),
          bairro: z.string(),
          combate: z.string(),
          efeitos: z.array(esquemaEfeitoDeRun),
        })
        .strict(),
    ),
    pesos: z.object({ leve: positivo, medio: positivo, pesado: positivo }).strict(),
  })
  .strict();

export const esquemaItens = z
  .object({
    itens: z.record(
      z.string(),
      z
        .object({
          nome: z.string(),
          preco: z.number().min(0),
          tipo: z.enum(['item', 'consumivel']),
          descricao: z.string(),
          efeitos: z.array(esquemaEfeitoDeRun),
          /** Já disponível no começo (os outros vêm do Álbum). */
          inicial: z.boolean(),
        })
        .strict(),
    ),
    maxItens: z.number().int().positive(),
    maxConsumiveis: z.number().int().positive(),
    /** Quantos de um mesmo consumível cabem num espaço. */
    pilhaMaxima: z.number().int().positive(),
    curaDoBanco: fracao,
  })
  .strict();

export const esquemaRun = z
  .object({
    nomesDosBairros: z.array(z.string()).min(1),
    ruasPorBairro: z.number().int().positive(),
    docesIniciais: z.number().int().min(0),
    consumiveisIniciais: z.array(
      z.object({ id: z.string(), qtd: z.number().int().positive() }).strict(),
    ),
    /** Relógio da Meia-Noite (GDD): começa às 21h e cada minuto real avança 4 minutos. */
    relogio: z
      .object({
        horaInicial: z.number(),
        horaMeiaNoite: z.number(),
        minutosDeJogoPorMinuto: positivo,
        /** Depois da meia-noite, inimigos ganham isto de Coragem e de dano por minuto real. */
        bonusPorMinuto: z.number().min(0),
      })
      .strict(),
    loja: z.object({ itensOferecidos: z.number().int().positive() }).strict(),
    porta: z.object({ raioInteracao: positivo }).strict(),
    /** Primeira run (GAMEPLAY.md): a primeira fase Porta a Porta mostra só estes tratos, leves. */
    primeiraRun: z.object({ tratos: z.number().int().positive() }).strict(),
    /** Noite curta (PLANO_JOGABILIDADE.md): só os primeiros `bairros` bairros, para a game jam. */
    noiteCurta: z.object({ bairros: z.number().int().positive() }).strict(),
    bau: z.object({ raioInteracao: positivo }).strict(),
    /** Selvagem de cada quintal: sorteio por peso; o Gato Preto aparece em 1 a cada 3 ruas. */
    /** Selvagem de cada quintal (o Gato Preto é um encontro raro: ver `encontros`). */
    selvagens: z.object({ pesos: z.record(z.string(), z.number().min(0)) }).strict(),
    /**
     * Baús (GAMEPLAY.md, "Baús"): comum (doces), raro (item comum, ou reroll e doces) ou
     * amaldiçoado (um trato forte com 1 preço, aceito ou recusado na hora). O tipo só aparece
     * quando o jogador chega perto, e todo bairro tem ao menos `rarosPorBairro` baús raros.
     */
    baus: z
      .object({
        pesos: z
          .object({
            comum: z.number().min(0),
            raro: z.number().min(0),
            amaldicoado: z.number().min(0),
          })
          .strict(),
        docesComum: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
        docesRaro: z.number().int().min(0),
        rerollsRaro: z.number().int().min(0),
        /** Chance de um quintal ter baú (o bairro aberto tem muitos quintais). */
        chanceNoQuintal: fracao,
        /** A esta distância (tiles) o baú mostra o tipo. */
        raioRevelar: positivo,
        rarosPorBairro: z.number().int().min(0),
        /** Força do trato do baú amaldiçoado (a mais alta que ainda houver, até esta). */
        forcaAmaldicoado: z.number().int().min(1).max(3),
      })
      .strict(),
    /**
     * Encontros raros (GAMEPLAY.md, "Encontros raros"): no máximo um por rua. Gato Preto, Criança
     * Perdida e Festa na Garagem têm chance por rua; o Carrinho de Pipoca vem uma vez por run, numa
     * rua dos bairros listados; a Janela Vermelha é da fase Porta a Porta.
     */
    encontros: z
      .object({
        chances: z
          .object({
            gato_preto: fracao,
            crianca_perdida: fracao,
            festa_na_garagem: fracao,
          })
          .strict(),
        carrinhoDePipoca: z
          .object({
            /** Bairros (contando de 0) em que o carrinho pode aparecer. */
            bairros: z.array(z.number().int().min(0)).min(1),
            itens: z.number().int().positive(),
            desconto: fracao,
            duracaoS: positivo,
            /** Chega quando o jogador passa a esta distância; atende a `raioAtender`. */
            raioChegar: positivo,
            raioAtender: positivo,
            /** Onde ele para, na fração do caminho da entrada (0) à saída (1). */
            noCaminho: fracao,
          })
          .strict(),
        criancaPerdida: z
          .object({
            doces: z.number().int().min(0),
            medalhas: z.number().int().min(0),
            /** O jogador acha a criança a esta distância; ela segue a `distancia` dele. */
            raioAchar: positivo,
            distancia: positivo,
            /** Na saída, ela precisa estar a até esta distância do jogador. */
            raioChegada: positivo,
            velocidade: positivo,
            raio: positivo,
            noCaminho: fracao,
          })
          .strict(),
        festaNaGaragem: z
          .object({
            pestinhas: z.number().int().positive(),
            multDoces: positivo,
            /** A garagem abre quando o jogador passa a esta distância da porta. */
            raioAbrir: positivo,
            /** Só garagens além desta fração do caminho (a festa não nasce na entrada). */
            desdeOCaminho: fracao,
            espalhar: positivo,
          })
          .strict(),
        janelaVermelha: z.object({ chance: fracao, precos: z.number().int().positive() }).strict(),
      })
      .strict(),
    /** O chefe de cada bairro. */
    chefes: z.array(z.string()).min(1),
    /** O chefe secreto (A Moradora do 13), depois do último chefe, com a Lua Cheia certa. */
    chefeSecreto: z.string(),
    /** Doces Guardados do fim da run (GDD, Álbum de Fantasias): fração dos doces e por chefe. */
    album: z
      .object({
        fracaoDoces: fracao,
        porChefe: z.number().int().min(0),
        /** A mais por nível de Lua Cheia (fração dos guardados, somada por nível). */
        porLua: z.number().min(0),
        /** Vencer A Moradora do 13. */
        moradora: z.number().int().min(0),
      })
      .strict(),
    /** Elites possíveis por posição (bairro × rua), da curva do complemento. */
    elites: z
      .object({
        porPosicao: z.array(
          z.array(
            z
              .object({
                opcoes: z.array(z.string()),
                n: z.number().int().min(0),
                reforcado: z.boolean().default(false),
              })
              .strict(),
          ),
        ),
      })
      .strict(),
    /**
     * Novidade de cada posição (bairro × rua) da curva do complemento: a fração dos postes amigos
     * que já nasce apagada (sem religar) e a mistura das ondas, quando muda.
     */
    curva: z
      .array(
        z.array(
          z
            .object({
              postesApagados: fracao.default(0),
              composicao: z.record(z.string(), z.number().min(0)).optional(),
            })
            .strict(),
        ),
      )
      .default([]),
  })
  .strict();

/** Condições da noite, recompensas de portão e pedidos dos moradores (GAMEPLAY.md, G5). */
export const RECOMPENSAS_DE_PEDIDO = [
  'reroll',
  'casa_extra',
  'doces',
  'preco_leve',
  'item_comum',
  'portao_extra',
  'susto',
] as const;

export const esquemaNoite = z
  .object({
    condicoes: z.record(
      z.string(),
      z
        .object({
          nome: z.string(),
          frase: z.string(),
          rara: z.boolean(),
          peso: z.number().min(0),
          visao: positivo.optional(),
          multDanoInimigo: positivo.optional(),
          multDoces: positivo.optional(),
          curvaProjeteis: z.number().min(0).optional(),
          apagaPosteACadaS: positivo.optional(),
          posteApagadoS: positivo.optional(),
          extraPorOnda: z.number().int().min(0).optional(),
          multXp: positivo.optional(),
          silencio: z.boolean().optional(),
          bausExtras: z.number().int().min(0).optional(),
          gatoCerto: z.boolean().optional(),
          janelasApagadas: fracao.optional(),
          multCuraPostes: positivo.optional(),
        })
        .strict(),
    ),
    recompensas: z.record(
      z.enum(['bau_raro', 'casa_extra', 'reroll', 'doces_em_dobro', 'item_comum']),
      z.object({ nome: z.string(), frase: z.string() }).strict(),
    ),
    pedidos: z.record(
      z.string(),
      z
        .object({
          texto: z.string(),
          recompensa: z.enum(RECOMPENSAS_DE_PEDIDO),
          segundos: positivo.optional(),
          n: z.number().int().positive().optional(),
          doces: z.number().int().positive().optional(),
          fracao: fracao.optional(),
          susto: z.number().positive().optional(),
        })
        .strict(),
    ),
    textosRecompensaPedido: z.record(z.enum(RECOMPENSAS_DE_PEDIDO), z.string()),
    /** Quantos portões aparecem ao fim de cada rua. */
    portoes: z.number().int().min(1),
    /** Condições raras em no máximo tantos portões por bairro. */
    rarasPorBairro: z.number().int().min(0),
  })
  .strict();

/** Exploração do bairro aberto (docs/DESIGN.md, seção 10). */
export const esquemaExploracao = z
  .object({
    /** Distância até a campainha, o poste apagado ou o mirante para o F funcionar. */
    raioInteracao: positivo,
    /** Névoa do mapa: células reveladas num raio em volta do jogador. */
    nevoa: z
      .object({ celula: positivo, raio: positivo, aCadaTicks: z.number().int().positive() })
      .strict(),
    /** Recompensas por revelar uma fração do bairro. */
    marcos: z.array(
      z.object({ fracao, doces: z.number().int().min(0), xp: z.number().min(0) }).strict(),
    ),
    campainha: z
      .object({
        doces: intervalo,
        /** Consumíveis que um morador pode dar. */
        itens: z.array(z.string()).min(1),
        xpHistoria: z.number().min(0),
        /**
         * Luz da abóbora da porta enquanto a campainha não foi tocada: um feixe da porta para a
         * frente da casa (largura no pé, quanto anda e quanto abre por tile, em tiles).
         */
        luz: z
          .object({ largura: positivo, comprimento: positivo, abertura: z.number().min(0) })
          .strict(),
        travessura: z
          .object({
            pestinhas: z.number().int().min(1),
            atrasoS: z.number().min(0.4),
            afastamento: positivo,
            /**
             * Doce ou travessura (PLANO_JOGABILIDADE.md, ideia 1): pedindo travessura (G), vencer
             * as pestinhas dá um item da lista e `multDoces` vezes os doces da campainha.
             */
            multDoces: positivo,
          })
          .strict(),
        /** Pedindo doce (F): o que pode sair, sem travessura (recompensa pequena e segura). */
        pesosDoce: z.partialRecord(z.enum(['doces', 'item', 'historia']), z.number().min(0)),
        historias: z.array(z.string()).min(1),
        /**
         * A campainha também abre um minijogo (os de `desconfiada.minijogos`; `nivel*` é o índice
         * das listas por bairro). Doce (F): fácil (`nivelDoce`, tempos vezes `folgaDoce`); acertar
         * dá o que `pesosDoce` sortear, perfeito dá doces garantidos vezes `multPerfeito`, errar
         * deixa a porta fechada (`textoFechada`). Travessura (G): sempre difícil
         * (`nivelTravessura`); acertar dá na hora o prêmio da travessura vencida, errar solta as
         * pestinhas. A casa não acorda: isso é só da Casa Desconfiada.
         */
        minijogo: z
          .object({
            nivelDoce: z.number().int().min(0),
            folgaDoce: z.number().min(1),
            nivelTravessura: z.number().int().min(0),
            multPerfeito: positivo,
            textoFechada: z.string(),
          })
          .strict(),
      })
      .strict(),
    /**
     * Casa Desconfiada (docs/PLANO_CASA_DESCONFIADA.md): F bate na porta e abre um minijogo curto
     * com a rua parada. Acertar dá `premios` (vezes `multPorBairro`, com o Susto mas sem o Frenesi);
     * errar acorda a casa (`especie`). Com inimigo a até `raioRecusa` tiles, a porta não abre.
     * `folga` alarga janelas e tempos na opção "Minijogos com folga". Valores em lista são por bairro.
     */
    desconfiada: z
      .object({
        raioRecusa: positivo,
        folga: z.number().min(1),
        especie: z.string(),
        premios: z
          .object({
            perfeito: z.number().int().min(0),
            acerto: z.number().int().min(0),
            derrotada: z.number().int().min(0),
          })
          .strict(),
        multPorBairro: z.array(positivo).min(1),
        chanceConsumivelPerfeito: fracao,
        chanceItemDerrotada: fracao,
        minijogos: z
          .object({
            toque: z
              .object({
                toques: z.array(z.number().int().min(2)).min(1),
                intervalosS: z.tuple([positivo, positivo]),
                esperaS: positivo,
                pausaS: positivo,
                janelaS: z.array(positivo).min(1),
                limiteS: positivo,
              })
              .strict(),
            olho: z
              .object({
                setas: z.array(z.number().int().min(1)).min(1),
                mostrarS: z.array(positivo).min(1),
                limiteS: positivo,
                perfeitoPorSetaS: positivo,
              })
              .strict(),
            fresta: z
              .object({
                vao: z.array(fracao).min(1),
                velocidade: z.array(positivo).min(1),
                margem: fracao,
                perfeito: fracao,
                limiteS: positivo,
              })
              .strict(),
            quem: z
              .object({
                silhuetas: z.number().int().min(2),
                introS: positivo,
                tempoS: z.array(positivo).min(1),
                perfeito: fracao,
              })
              .strict(),
          })
          .strict(),
        textos: z
          .object({
            recusa: z.string(),
            perfeito: z.string(),
            acerto: z.string(),
            erro: z.string(),
            perdoado: z.string(),
            derrotada: z.string(),
          })
          .strict(),
      })
      .strict(),
    segredo: z
      .object({
        raioPegar: positivo,
        /** De perto (ou na luz) a Abóbora Dourada aparece e entra no mapa. */
        raioVer: positivo,
        doces: z.number().int().min(0),
        xp: z.number().min(0),
        susto: z.number().min(0),
      })
      .strict(),
    poste: z.object({ canalS: positivo, xp: z.number().min(0), raioRevelar: positivo }).strict(),
    mirante: z.object({ canalS: positivo, raioRevelar: positivo, xp: z.number().min(0) }).strict(),
    /**
     * Fins de beco novos (docs/PLANO_MUNDO_VIVO.md, frente 1). `poco`: F perto do Poço dos Desejos
     * troca `preco` doces por um consumível (uma vez). `velas`: F acende uma vela; a primeira
     * começa o desafio de `tempoS` e chama `pestinhas`; um inimigo encostado numa vela acesa a
     * apaga; as 3 acesas dão `doces` e `xp`. `assombrada`: entrar na sala chama as `ondas` (quantas
     * pestinhas em cada) e, vencidas, aparece um baú com `doces`.
     */
    fins: z
      .object({
        raioInteracao: positivo,
        poco: z.object({ preco: z.number().int().positive() }).strict(),
        velas: z
          .object({
            tempoS: positivo,
            pestinhas: z.number().int().min(0),
            raioApagar: positivo,
            doces: z.number().int().min(0),
            xp: z.number().min(0),
          })
          .strict(),
        assombrada: z
          .object({
            ondas: z.array(z.number().int().positive()).min(1),
            doces: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
    /**
     * Objetos que quebram (docs/PLANO_MUNDO_VIVO.md, frente 1): por modelo, a Coragem, o raio do
     * corpo, os doces que solta e o material (som e pedaços). Ao quebrar, `chanceSurpresa` de sair
     * uma pestinha escondida e `chanceItem` de um consumível da campainha. A tela mostra um brilho
     * de "dá para quebrar" a até `raioBrilho` tiles do jogador.
     */
    quebraveis: z
      .object({
        modelos: z.record(
          z.string(),
          z
            .object({
              coragem: positivo,
              raio: positivo,
              doces: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
              material: z.enum(['metal', 'madeira', 'abobora', 'plastico', 'vidro']),
              /**
               * Efeito ao quebrar: o hidrante solta um jato, a abóbora gigante explode, o canteiro
               * tira o Regulamento do Síndico e o espelho tira o reflexo da Moradora.
               */
              efeito: z.enum(['jato', 'explosao', 'canteiro', 'espelho']).optional(),
            })
            .strict(),
        ),
        chanceSurpresa: fracao,
        chanceItem: fracao,
        raioBrilho: positivo,
      })
      .strict(),
    /**
     * Armas do cenário (docs/PLANO_MUNDO_VIVO.md, frente 1). `alarme`: um golpe no carro toca o
     * alarme e atrai os inimigos (como a Doce-isca) por `duracaoS`. `fio`: um golpe no poste aceso
     * derruba o fio e eletrifica o chão em volta (dano e lentidão nos inimigos). `jato`: o hidrante
     * quebrado empurra quem chega perto. `explosao`: a abóbora gigante quebrada explode depois do
     * aviso. `portao`: o portão do quintal só abre no golpe forte (o último do combo ou um feitiço).
     */
    armas: z
      .object({
        alarme: z
          .object({
            modelos: z.array(z.string()),
            duracaoS: positivo,
            recargaS: positivo,
            raioCorpo: positivo,
          })
          .strict(),
        fio: z
          .object({
            modelos: z.array(z.string()),
            duracaoS: positivo,
            recargaS: positivo,
            raioCorpo: positivo,
            raio: positivo,
            intervaloS: positivo,
            danoPorPulso: positivo,
            lentidao: fracao,
          })
          .strict(),
        jato: z
          .object({ duracaoS: positivo, raio: positivo, empurrao: positivo, intervaloS: positivo })
          .strict(),
        explosao: z.object({ avisoS: positivo, raio: positivo, dano: positivo }).strict(),
        portao: z.object({ coragem: positivo, raioCorpo: positivo }).strict(),
      })
      .strict(),
  })
  .strict();

/** Jeitos de o bot usar uma habilidade (src/bots/bot.ts). */
export const USOS_DE_HABILIDADE = [
  'disparo',
  'area',
  'emVolta',
  'execucao',
  'alvo',
  'perto',
  'escudo',
  'buff',
  'sumir',
  'investida',
  'fuga',
] as const;
export type UsoDeHabilidade = (typeof USOS_DE_HABILIDADE)[number];

/** Bots que jogam a run em Node (GDD, "Testes e balanceamento com bots") e as metas do relatório. */
const esquemaPerfilBot = z
  .object({
    nome: z.string(),
    /** Tempo de reação: o bot vê os avisos e as posições com esse atraso. */
    reacaoS: segundos,
    /** Erro de mira como fração do alcance da habilidade. */
    erroMira: fracao,
    /** Chance de desviar de cada aviso vermelho que vê. */
    chanceDesvio: fracao,
    usaE: z.boolean(),
    usaLuz: z.boolean(),
    usaLanterna: z.boolean(),
    /** Mira onde o alvo vai estar quando o projétil chegar. */
    miraFutura: z.boolean(),
    /** Recua das pestinhas que encostam (a Bruxinha luta de longe). */
    recua: z.boolean(),
    compra: z.boolean(),
    abreBaus: z.boolean(),
    /** Bate nas Casas Desconfiadas e acerta o minijogo com esta chance. */
    bateNasCasas: z.boolean(),
    acertoMinijogo: fracao,
    tratos: z.enum(['acaso', 'sinergia']),
    /** Pontos de nível ao acaso ou pela `ordemDosPontos`. */
    pontos: z.enum(['acaso', 'ordem']),
    rotas: z.enum(['acaso', 'preferencia']),
    evolucoes: z.enum(['acaso', 'preferencia']),
  })
  .strict();

export const esquemaBots = z
  .object({
    runsPorPerfil: z.number().int().positive(),
    /** Campeões que cada perfil joga no relatório (`runsPorPerfil` runs de cada um). */
    campeoes: z.array(z.string()).min(1),
    /** Quantos bairros cada run joga (3: a run inteira, desde a tarefa 12). */
    bairros: z.number().int().positive(),
    decisaoS: positivo,
    limiteRuaS: positivo,
    limiteChefeS: positivo,
    /** Tempo de relógio contado em cada fase Porta a Porta (o bot decide sem andar). */
    portaS: z.number().min(0),
    raioCombate: positivo,
    alcanceAtaque: positivo,
    distanciaKite: positivo,
    /** Mais perto que isso de um chefe ou elite, o bot recua entre os golpes. */
    distanciaDoChefe: positivo,
    /**
     * Peso da distância na escolha do alvo (nota = prioridade − peso × distância): quem ataca de
     * longe pondera pouco; quem luta corpo a corpo bate primeiro no que está perto.
     */
    pesoDistanciaDeLonge: positivo,
    pesoDistanciaCorpoACorpo: positivo,
    /** Para se curar, só vale a luz a mais que o alcance dos atiradores à vista mais esta folga. */
    folgaDaLuzSegura: z.number().min(0),
    /** Por quanto tempo quem luta corpo a corpo persegue um atirador antes de desistir, em s. */
    perseguicaoS: positivo,
    /** Quanto um trato lendário (Janela Vermelha) vale a mais na nota do bot experiente. */
    bonusDoLendario: z.number().min(0),
    /**
     * Regra de frequência das surpresas (GAMEPLAY.md): quantas runs simular sem luta e o máximo de
     * runs sem nenhum encontro raro.
     */
    surpresas: z.object({ runs: z.number().int().positive(), semEncontroMax: fracao }).strict(),
    /**
     * Minijogo da Casa Desconfiada: dos acertos, `chancePerfeito` saem perfeitos; nos outros o bot
     * responde atrasado (fração da janela no toque, segundos no olho e no Quem Bate?, fração do vão
     * na fresta).
     */
    minijogo: z
      .object({
        chancePerfeito: fracao,
        atrasoToque: fracao,
        atrasoOlhoS: positivo,
        atrasoQuemS: positivo,
        vaoDaFresta: fracao,
      })
      .strict(),
    luzCuraAbaixo: fracao,
    luzCuraAte: fracao,
    raioBuscaLuz: positivo,
    caminhoACadaS: positivo,
    presoS: positivo,
    raioBau: positivo,
    perfis: z.record(z.string(), esquemaPerfilBot),
    /** Ordem de Q, W e E nos pontos de nível (o R sobe sempre que pode). */
    ordemDosPontos: z.array(z.enum(['Q', 'W', 'E'])),
    /** Como o bot usa cada habilidade, por id (vale para todos os campeões). */
    usos: z.record(z.string(), z.enum(USOS_DE_HABILIDADE)),
    /** Chance de escolher a evolução A de cada habilidade (perfil com preferência). */
    chanceDaEvolucaoA: z.record(z.string(), fracao),
    /** Peso de cada condição da noite na escolha de rota (perfil com preferência). */
    pesoDaCondicao: z.record(z.string(), z.number().min(0)),
    /**
     * Retorno (GAMEPLAY.md): da derrota ao começo da nova run, em segundos. É de tela: quem mede é
     * o Playwright (`tests/e2e/ganchos.spec.ts`), não os bots.
     */
    retornoMaxS: positivo,
    /** Uma build (campeão + Conjuntos) só entra no ranking do relatório com tantas runs. */
    minRunsPorBuild: z.number().int().positive(),
    metas: z.array(
      z
        .object({
          id: z.string(),
          nome: z.string(),
          perfil: z.string(),
          metrica: z.enum([
            'vitorias',
            'duracaoRuaMin',
            'duracaoChefeMin',
            'frenesisPorRua',
            'fracaoSusto50',
            'pedidosCumpridos',
            'evolucaoMenosEscolhida',
            'condicaoEscolhida',
            'tratoMaisPresente',
            /** Vitórias do campeão que mais vence menos as do que menos vence. */
            'diferencaEntreCampeoes',
            /** Taxa de vitória do campeão que menos vence. */
            'campeaoQueMenosVence',
            /** Fração das runs que completaram ao menos um Conjunto de 4. */
            'runsComConjuntoDe4',
            /** Taxa de vitória das runs com o Conjunto de 4 que menos (ou mais) vence. */
            'conjuntoQueMenosVence',
            'conjuntoQueMaisVence',
            /** Fração das vitórias que tinham o Conjunto de 4 mais presente nelas. */
            'conjuntoMaisPresenteNasVitorias',
            /** Fração das vitórias da rota do Bom Vizinho (até `maxTratos` tratos na run). */
            'vitoriasBomVizinho',
            /** Fração dos doces da run que vieram da Casa Desconfiada. */
            'docesDaDesconfiada',
            /** Fração dos minijogos da Casa Desconfiada vencidos (acerto ou perfeito). */
            'minijogosVencidos',
          ]),
          min: z.number().optional(),
          max: z.number().optional(),
          /**
           * Vitórias e campeão que menos vence contam quem passou deste bairro (1 = venceu o
           * chefe do bairro 1), não a run inteira.
           */
          bairro: z.number().int().positive().optional(),
          /** Bom Vizinho: a run venceu com até tantos tratos ("zero ou quase nenhum"). */
          maxTratos: z.number().int().min(0).optional(),
          /** A meta do GDD vale para a run inteira (3 bairros). */
          runCompleta: z.boolean().default(false),
          nota: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

// ------------------------------------------------------------------ Álbum de Fantasias e Lua Cheia

/** Um desbloqueio comprado com Doces Guardados (GDD, "Álbum de Fantasias"). */
const esquemaCompra = z.object({ preco: z.number().int().positive() }).strict();

export const esquemaAlbum = z
  .object({
    /** O save no localStorage: a chave e a versão (save de outra versão começa do zero). */
    save: z.object({ chave: z.string().min(1), versao: z.number().int().positive() }).strict(),
    /** Fantasias: liberam pelo marco de content/campeoes.json ou compradas antes dele. */
    campeoes: z.record(z.string(), esquemaCompra),
    /** Os 12 tratos do GDD, que toda run já oferece. */
    tratosIniciais: z.array(z.string()).min(1),
    /** Páginas do Álbum: cada uma libera um grupo de tratos para as portas. */
    paginas: z.array(
      z
        .object({
          id: z.string(),
          nome: z.string(),
          preco: z.number().int().positive(),
          tratos: z.array(z.string()).min(1),
        })
        .strict(),
    ),
    /** Itens comuns que entram na loja do banco quando comprados (os iniciais já estão lá). */
    itens: z.record(z.string(), esquemaCompra),
    /** Pequenos bônus iniciais: cada nível tem o seu preço. */
    bonus: z
      .object({
        coragem: z
          .object({ precos: z.array(z.number().int().positive()), mult: positivo })
          .strict(),
        doces: z
          .object({ precos: z.array(z.number().int().positive()), soma: z.number().int() })
          .strict(),
        reroll: z
          .object({ precos: z.array(z.number().int().positive()), soma: z.number().int() })
          .strict(),
      })
      .strict(),
    /** Cores alternativas das fantasias: giro de matiz (graus) das cores vivas do modelo. */
    cores: z.record(
      z.string(),
      z.array(
        z
          .object({
            id: z.string(),
            nome: z.string(),
            matiz: z.number().min(-360).max(360),
            preco: z.number().int().positive(),
          })
          .strict(),
      ),
    ),
  })
  .strict();

/** O que cada nível de Lua Cheia soma (GDD, "Lua Cheia"); os níveis acima juntam os de baixo. */
export const esquemaEfeitoDaLua = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('inimigos'),
      coragem: z.number().min(0).default(0),
      dano: z.number().min(0).default(0),
    })
    .strict(),
  z.object({ tipo: z.literal('chefes'), coragem: positivo }).strict(),
  z.object({ tipo: z.literal('recargaPostes'), mult: positivo }).strict(),
  z.object({ tipo: z.literal('precoInicial'), n: z.number().int().positive() }).strict(),
  z.object({ tipo: z.literal('relogioAdiantado'), minutos: positivo }).strict(),
  z.object({ tipo: z.literal('moradora') }).strict(),
  z.object({ tipo: z.literal('extraPorOnda'), n: z.number().int().positive() }).strict(),
  z.object({ tipo: z.literal('precoDoBanco'), mult: positivo }).strict(),
  z.object({ tipo: z.literal('intervaloOndas'), segundos: positivo }).strict(),
]);

export const esquemaLuaCheia = z
  .object({
    niveis: z
      .array(z.object({ descricao: z.string(), efeito: esquemaEfeitoDaLua }).strict())
      .min(1),
  })
  .strict();

/** Entre as runs (GAMEPLAY.md): maestria, Diário do Bairro, moradores que lembram e desafios. */
export const PAGINAS_DO_DIARIO = [
  'tratos',
  'precos',
  'conjuntos',
  'inimigos',
  'condicoes',
  'encontros',
  'evolucoes',
] as const;

export const esquemaEntreRuns = z
  .object({
    maestria: z
      .object({
        pontosPorXp: z.number().min(0),
        pontosPorChefe: z.number().int().min(0),
        pontosPorVitoria: z.number().int().min(0),
        /** Pontos (somados) para chegar a cada nível de maestria, do 1 ao 5. */
        niveis: z.array(z.number().int().positive()).length(5),
        titulos: z.record(z.string(), z.string()),
        recompensas: z.array(z.string()).length(5),
        comeco: z.object({ ofertas: z.number().int().positive() }).strict(),
      })
      .strict(),
    diario: z
      .object({
        paginas: z.record(
          z.enum(PAGINAS_DO_DIARIO),
          z.object({ nome: z.string(), doces: z.number().int().min(0) }).strict(),
        ),
        encontros: z.record(z.string(), z.object({ nome: z.string(), dica: z.string() }).strict()),
      })
      .strict(),
    moradores: z
      .object({
        /** Fração do preço da pechincha com quem lembra de você. */
        pechinchaLembrado: fracao,
        recusasParaOfender: z.number().int().positive(),
        /** Ruas vencidas na run antes de o Morador Ofendido aparecer. */
        ruaDoOfendido: z.number().int().min(0),
        especieOfendido: z.string(),
        cumprimentos: z.array(z.string()).min(1),
        ofendido: z.array(z.string()).min(1),
      })
      .strict(),
    desafios: z
      .object({
        doces: z.number().int().min(0),
        lista: z
          .array(
            z
              .object({
                id: z.string(),
                nome: z.string(),
                descricao: z.string(),
                /** Só tratos desta marca nas portas. */
                marca: z.enum(MARCAS).optional(),
                /** Todas as ruas com esta condição da noite. */
                condicao: z.string().optional(),
                lua: z.number().int().min(0).optional(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();

/** Identidade pública e créditos usados no jogo e nos pacotes de distribuição. */
export const esquemaPublicacao = z
  .object({
    nome: z.string().min(1),
    subtitulo: z.string().min(1),
    autor: z.string().min(1),
    credito: z.string().min(1),
    frase: z.string().min(1),
  })
  .strict();

export type EntreRuns = z.infer<typeof esquemaEntreRuns>;
export type PaginaDoDiario = (typeof PAGINAS_DO_DIARIO)[number];
export type DesafioDaSemana = EntreRuns['desafios']['lista'][number];

export type Album = z.infer<typeof esquemaAlbum>;
export type LuaCheia = z.infer<typeof esquemaLuaCheia>;
export type EfeitoDaLua = z.infer<typeof esquemaEfeitoDaLua>;

export type Visual = z.infer<typeof esquemaVisual>;
export type ParteDoEsqueleto = z.infer<typeof esquemaParteDoEsqueleto>;
export type ConfigBots = z.infer<typeof esquemaBots>;
export type PerfilBot = ConfigBots['perfis'][string];
export type MetaBot = ConfigBots['metas'][number];
export type NomeAcento = keyof Visual['acentos'];
export type Luz = z.infer<typeof esquemaLuz>;
export type ObjetoRua = z.infer<typeof esquemaObjetoRua>;
export type Figurante = z.infer<typeof esquemaFigurante>;
export type Rua = z.infer<typeof esquemaRua>;
export type NomeModelo = keyof z.infer<typeof esquemaModelos>;
export type Modelos = z.infer<typeof esquemaModelos>;
export type Simulacao = z.infer<typeof esquemaSimulacao>;
export type Jogador = z.infer<typeof esquemaJogador>;
export type Controles = z.infer<typeof esquemaControles>;
export type Tecla = (typeof TECLAS)[number];
export type Habilidade = z.infer<typeof esquemaHabilidade>;
export type Forma = Habilidade['forma'];
export type Efeito = Habilidade['efeitos'][number];
export type Evolucao = z.infer<typeof esquemaEvolucao>;
export type Evolucoes = z.infer<typeof esquemaEvolucoes>['evolucoes'];
export type Campeao = z.infer<typeof esquemaCampeao>;
export type Campeoes = z.infer<typeof esquemaCampeoes>;
export type Passiva = Campeao['passiva'];
export type DefAutoAtaque = Campeao['autoAtaque'];
export type Combate = z.infer<typeof esquemaCombate>;
export type Gerador = z.infer<typeof esquemaGerador>;
export type DefInimigo = z.infer<typeof esquemaInimigo>;
export type Inimigos = z.infer<typeof esquemaInimigos>;
export type Ondas = z.infer<typeof esquemaOndas>;
export type ConfigSusto = z.infer<typeof esquemaSusto>;
export type EfeitoDeRun = z.infer<typeof esquemaEfeitoDeRun>;
export type Tratos = z.infer<typeof esquemaTratos>;
export type DefTrato = Tratos['tratos'][string];
export type Marca = (typeof MARCAS)[number];
export type Precos = z.infer<typeof esquemaPrecos>;
export type DefPreco = Precos['precos'][string];
export type Itens = z.infer<typeof esquemaItens>;
export type DefItem = Itens['itens'][string];
export type ConfigRun = z.infer<typeof esquemaRun>;
export type Noite = z.infer<typeof esquemaNoite>;
export type Condicao = Noite['condicoes'][string];
export type DefPedido = Noite['pedidos'][string];
export type Piso = z.infer<typeof esquemaPiso>;
export type ConfigExploracao = z.infer<typeof esquemaExploracao>;
export type TipoDePiso = (typeof TIPOS_DE_PISO)[number];
