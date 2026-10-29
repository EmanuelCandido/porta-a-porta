# Créditos e licenças

## Jogo

- Criação, game design e direção do projeto: **Emanuel Cândido**.
- Desenvolvimento com IA: Claude Code (Anthropic) e Codex (OpenAI), a partir do GDD
  (`docs/GDD.md`) e das decisões de Emanuel Cândido. Uso divulgado na página do itch.io.
- Logotipo do título: arte fornecida por Emanuel Cândido em 18/10/2026, preservada com transparência
  em `public/interface/titulo/porta-a-porta.png`.
- Favicon e ícone Windows: porta iluminada gerada pela ferramenta de imagem da OpenAI a partir da
  identidade do logotipo. Original em `Design Codex/Artes/publicacao/icone-porta.png`; versões de
  distribuição em `public/favicon.png` e `public/favicon.ico`.
- Capa do itch.io: adaptação com fundo azul-marinho e margens gerada pela ferramenta de imagem
  da OpenAI, em `Design Codex/Artes/publicacao/capa-itch.png`. O logo original do menu é preservado.
- Fundo da execução no itch.io: ilustração horizontal do bairro e logotipo gerada pela mesma
  ferramenta, em `Design Codex/Artes/publicacao/fundo-executar-itch.png`, sem menus ou botões.
- Fundo externo da página: composição com a ferramenta de imagem da OpenAI a partir de capturas
  reais, mantendo a arquitetura e os materiais chapados. Bruxinha, Poste Corrompido, Casa Desperta
  e Pestinhas nas laterais, em `Design Codex/Artes/publicacao/fundo-pagina-itch-laterais-1920.png`.
- Favicon da página do itch.io: porta isolada do logotipo com a ferramenta de imagem da OpenAI;
  original e cópia em 256 px em `Design Codex/Artes/publicacao/`, com prompts em
  `prompts-pagina-v2.md`.
- Arte: o mundo é gerado por código (`src/render`). As artes da interface (itens, poderes,
  retratos, evoluções, tratos, preços, marcas, condições e símbolos) são recortes das pranchas
  geradas pelo Codex (OpenAI) para o projeto, em `Design Codex/Artes`. Os modelos da cidade nova
  seguem as pranchas do Codex. Personagens e objetos com GLB vêm de `Design Codex/Modelos GLB`:
  oito gerados pelo usuário no Tencent Hunyuan3D e polidos pelo Codex, e 13 modelados pelo Codex
  no Blender; o jogo usa uma versão low-poly convertida deles.

## Referências dos serviços de IA

- [OpenAI — termos de uso](https://openai.com/policies/terms-of-use/), seção **Content**: direitos
  do usuário sobre as saídas, sujeitos aos termos aplicáveis.
- [Tencent Hunyuan3D — contrato do serviço oficial](https://rule.tencent.com/rule/202501080004),
  seção **5.3**: direitos sobre o conteúdo enviado e gerado. O usuário confirmou em 18/10/2026 que
  utilizou o site oficial `3d.hunyuan.tencent.com`; não se presume a licença de uma versão de pesos
  abertos do Hunyuan. A seção 3.3 pede a identificação pública de conteúdo gerado por IA, feita na
  descrição e nos créditos.
- O jogo distribuído não chama serviços de IA. Os arquivos de áudio gravados são CC0; os efeitos
  restantes são síntese por código, sem serviço de geração de música por IA.

## Bibliotecas

| Biblioteca                                             | Licença                        | Uso                                  |
| ------------------------------------------------------ | ------------------------------ | ------------------------------------ |
| Phaser 4                                               | MIT                            | Engine 2D (vai no build)             |
| Zod                                                    | MIT                            | Validação do conteúdo (vai no build) |
| Electron e Chromium                                    | MIT e licenças dos componentes | Motor incluído na edição Windows     |
| Vite, Vitest, Playwright, ESLint, Prettier, TypeScript | MIT / Apache-2.0               | Ferramentas de desenvolvimento       |

## Áudio (passo 11 do mundo vivo, `public/audio`)

Tudo em domínio público (CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/): pode usar,
mudar e distribuir sem pedir nem creditar; o crédito fica aqui por cortesia. O mapa de cada som do
jogo para os arquivos está em `content/audio.json` (`arquivos` e `musica.gravada`); o que não tem
arquivo (alarme, fio elétrico, jato, pavio, explosão) continua sintetizado por código.

| Arquivos em `public/audio`                                                    | Origem                                                                                                     | Autor             | Licença |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| `efeitos/impact*`                                                             | [Impact Sounds](https://kenney.nl/assets/impact-sounds) 1.0                                                | Kenney            | CC0     |
| `efeitos/cloth*`, `drawKnife*`, `handleCoins*`, `doorOpen*`                   | [RPG Audio](https://kenney.nl/assets/rpg-audio)                                                            | Kenney            | CC0     |
| `efeitos/click*`, `bong*`, `confirmation*`, `glass*`, `scratch*`, `maximize*` | [Interface Sounds](https://kenney.nl/assets/interface-sounds)                                              | Kenney            | CC0     |
| `efeitos/jingles_PIZZI*`, `musica/vitoria.ogg`, `musica/derrota.ogg`          | [Music Jingles](https://kenney.nl/assets/music-jingles)                                                    | Kenney            | CC0     |
| `musica/titulo.flac`                                                          | [Lanterns in the Hollowed Forest](https://opengameart.org/node/181239) (versão loop)                       | Tsorthan Grove    | CC0     |
| `musica/rua.ogg`                                                              | [Creepy Ambient Loop](https://opengameart.org/node/167286) (v2)                                            | epb9000           | CC0     |
| `musica/combate.ogg`                                                          | [Haunting Chiptune Loop – Void Estate](https://opengameart.org/content/haunting-chiptune-loop-void-estate) | Zane Little Music | CC0     |
| `musica/chefe.ogg`                                                            | Void Estate, versão Haunted Arcade (mesma página)                                                          | Zane Little Music | CC0     |

## Fonte e avisos incluídos na distribuição

- A fonte pixel 5 × 7 é gerada pelo código de `src/game/interface/fontePixel.ts`, sem arquivo de
  fonte externa. A pendência antiga de escolher uma fonte externa não se aplica ao jogo atual.
- `public/creditos.html` acompanha o build do navegador, com autor, uso de IA, áudio e referências.
- `public/licencas/phaser.txt` e `public/licencas/zod.txt` preservam os avisos MIT das dependências.
- A edição Windows inclui `CREDITOS.html`, `licencas/`, `LICENSE` e `LICENSES.chromium.html`, além
  das licenças dentro do pacote do jogo.
