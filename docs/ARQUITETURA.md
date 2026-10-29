# Arquitetura e regras do projeto

O design completo está em [`GDD.md`](GDD.md), e [`GAMEPLAY.md`](GAMEPLAY.md) detalha o combate e os
sistemas (Susto e Frenesi, evoluções, marcas e Conjuntos, rotas, pedidos, surpresas e progressão
entre runs). Onde o complemento diverge do GDD, vale a tabela "O que muda no GDD" dele.

## Regras

1. A simulação fica em `src/sim` e nunca importa o Phaser. Passo fixo de 1/60 s e só o gerador com
   semente; `Math.random` é proibido por regra de lint.
2. Todo conteúdo e todo número de balanceamento ficam em `content/*.json`, validados por Zod. Nada de
   números mágicos no código.
3. Habilidades, inimigos, tratos e preços são dados interpretados por executores genéricos. Só um
   efeito realmente novo pede código novo, e ele vem com teste.
4. O cenário é desenhado por código em `src/render`, com a paleta e as regras da seção Estilo visual
   do GDD. Exceções: as artes da interface (`public/interface`) e as malhas low-poly dos personagens
   (`src/render/malhas/`), convertidas de modelos GLB. O acervo de origem dessas artes e modelos
   não faz parte deste repositório. O áudio vem de arquivos CC0 em `public/audio`, registrados em
   [`CREDITS.md`](CREDITS.md), com síntese por código de reserva.
5. O cenário nunca usa cores de acento; elas são só para personagens, habilidades e alertas.
6. Todo ataque inimigo forte é anunciado no chão em vermelho antes do impacto: aviso mínimo de
   0,4 s, projéteis inimigos a no máximo 9 tiles/s, até 3 avisos sobrepostos ao jogador e todo dano
   recebido faz o personagem piscar em branco.
7. Uma mudança só está pronta com testes passando, lint limpo e build verde. Mudança visual exige
   screenshot do Playwright conferido.
8. Personagens, nomes, ícones e efeitos são originais.

## Verificação

- `npm run check`: lint, tipos, Vitest e build.
- `npm run test:e2e`: Playwright no build de produção; os screenshots ficam em
  `test-results/screenshots/`.
- `npm run bots`: bots jogam a run inteira em Node para validar o balanceamento (cerca de meia hora;
  resultado em [`BALANCO.md`](BALANCO.md)). `BOTS_RUNS=N` muda quantas runs cada campeão joga.

## Estrutura

```
content/          JSON de conteúdo e números (validados em src/sim/content)
src/sim/          simulação pura, roda em Node (sem Phaser, sem DOM)
                  (mundo.ts: entidades, comandos, colisão; rua.ts: rua → mundo)
src/sim/content/  esquemas Zod e carregamento de content/*.json
src/render/       desenho por código: iso, prismas, modelos, sombras, luz, paleta
src/game/         Phaser: config, cenas, input, interface, áudio, save
src/bots/         bots que jogam cada campeão
tests/unit/       Vitest (regras, simulação, geometria pura do render, conteúdo)
tests/e2e/        Playwright (tela)
desktop/          inicializador Electron das edições Windows e Linux
docs/             GDD, gameplay, conteúdo, créditos, desempenho e estilo/ (screenshots aprovados)
```

- Coordenadas do mundo em tiles (x, y decimais) e altura `z` em px. A conversão para a tela é
  `src/render/iso.ts`: `sx = (x − y)·32`, `sy = (x + y)·16 − z`.
- Em `src/render`, a geometria (faces, culling, tons, ordem de desenho, sombras) é pura e testada em
  Node; só `assar.ts` e `src/game` tocam em canvas/Phaser.
- Os modelos (casas, poste, árvore...) são definidos em `src/render/modelos.ts` com a frente voltada
  para +x e podem ser girados.
- `window.__portaAPorta` expõe o estado da cena para os testes do Playwright.
- Cenas: `CenaTitulo` (título, escolha da fantasia, semente da noite), `CenaAlbum` (Álbum de
  Fantasias), `CenaDiario` (Diário do Bairro e maestria), `CenaRua` (a rua jogável) e
  `CenaRuaPrevia` (`?cena=previa`, câmera livre). Por cima da rua: `CenaInterface`, `CenaPorta`,
  `CenaEvolucao`, `CenaDesafio` (minijogo da Casa Desconfiada) e `CenaFimDaRun`. O cenário é
  montado por `src/game/rua/CenarioDaRua.ts`.
- Parâmetros de teste: `?rua=`, `?modo=treino`, `?porta=1`, `?bairro=`, `?avancar=N`,
  `?noite=0|1`, `?zoom=`, `?semente=`, `?lancamento=soltar|apertar`, `?lua=N`, `?moradora=1`,
  `?primeira=1` e, na prévia, `?foco=x,y`. L liga a escuridão.
- O progresso entre runs é puro (`src/sim/progresso.ts`: Álbum, Lua Cheia, maestria, Diário,
  moradores e desafio da semana; `src/sim/diario.ts`: páginas do Diário) e o save no localStorage
  fica em `src/game/save.ts`; só as runs começadas no título gravam.
- A run (`src/sim/run.ts`) liga ruas e fases Porta a Porta; a sessão (`src/game/sessao.ts`) monta o
  mapa da vez e a `CenaPorta` mostra a carta do trato e a loja do banco.
- A simulação roda sistemas por tick (`src/sim/combate.ts`, `src/sim/habilidades.ts`) e registra o
  que aconteceu em `mundo.eventos`, que a tela consome a cada quadro.
- A tela nunca decide regra: lê a entrada (`src/game/entrada.ts`), transforma em comando na fila do
  mundo e desenha interpolando `posAnterior` → `pos` com o `alfa` do passo fixo.
