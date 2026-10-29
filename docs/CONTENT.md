# Conteúdo

Inventário do que existe em `content/*.json`. Todo arquivo é validado por Zod em
`src/sim/content/esquemas.ts` ao carregar e nos testes (`tests/unit/conteudo.test.ts`).

Atualização de 18/10 — gameplay: `visual.desempenho` reúne os orçamentos em milissegundos,
folga do recorte, célula do índice de sombras, limite do cache, tamanho do diagnóstico e textos
das opções. Alta preserva 16 direções e três sombras por figura; Média usa oito e uma;
Leve usa oito e nenhuma sombra por figura. A iluminação usa escala 1/0,75/0,5 e a decoração
usa 100%/70%/40%, respectivamente. O padrão continua Alta; a escolha é salva fora do progresso.
Ver `OTIMIZACAO_GAMEPLAY.md`. Os números de combate e de simulação não mudaram.

Revisão para os jogadores: removidos os textos de instrução e exportação de diagnóstico de
`visual.desempenho.textos`. O menu público apresenta apenas Leve, Média, Alta e Voltar.

Revisão do menu (18/10): cada qualidade ganhou `descricao` (o que ela muda, mostrado no painel)
e `navegacao` virou a linha de teclas do topo, como na pausa. `visual.marcaDeInteracao` guarda a
marca das portas com interação: alcance (15 tiles), altura da plaquinha (82 px), raio (12 px),
balanço (3 px em 1,1 s), anel no chão (0,7 tile, pulso de 12%) e o aumento ao alcance do F (1,35×).

| Arquivo                    | O que guarda                                                      | Esquema              |
| -------------------------- | ----------------------------------------------------------------- | -------------------- |
| `content/visual.json`      | Tela, tile, andar, câmera, paleta, acentos, sombra e luz na tela  | `esquemaVisual`      |
| `content/publicacao.json`  | Nome, subtítulo, autor, crédito e frase do título                 | `esquemaPublicacao`  |
| `content/luz.json`         | Raios de luz do jogo: poste, janela, lanterna e Poste Corrompido  | `esquemaLuz`         |
| `content/ruas.json`        | Ruas montadas à mão: `rua_teste` (estática) e `vitrine`           | `esquemaRuas`        |
| `content/modelos.json`     | Pegada e retângulos de colisão de cada modelo                     | `esquemaModelos`     |
| `content/simulacao.json`   | Ticks por segundo, ticks máximos por quadro, grade e colisão      | `esquemaSimulacao`   |
| `content/jogador.json`     | Raio do corpo (0,4 tile) e velocidade (3,5 tiles/s)               | `esquemaJogador`     |
| `content/controles.json`   | Zona morta do analógico e modo de lançamento (`soltar`/`apertar`) | `esquemaControles`   |
| `content/habilidades.json` | Habilidades como dados: forma, números por posto e efeitos        | `esquemaHabilidades` |
| `content/campeoes.json`    | Campeões: Coragem, Energia, atributos, Q/W/E/R e passiva          | `esquemaCampeoes`    |
| `content/combate.json`     | Limite de Pressa e boneco de treino                               | `esquemaCombate`     |

## publicacao.json

- Nome, subtítulo, autoria, crédito visível e frase de abertura do jogo, validados por
  `esquemaPublicacao`. A autoria é **Emanuel Cândido**.
- O logotipo fornecido pelo autor fica em `public/interface/titulo/porta-a-porta.png` e substitui
  o título desenhado por letras no menu. Arquivo, largura e posição ficam em
  `visual.interface.titulo.logo`; a frase e o menu têm posições próprias.
- Favicon PNG/ICO e créditos com licenças em `public/`. A capa com fundo e o original do ícone
  ficam no acervo `Design Codex/Artes/publicacao/`, fora dos arquivos carregados pelo jogo.
- A página preparada para o itch.io está em `docs/PAGINA_ITCH.html`; empacotamento e verificação
  das três edições em `docs/PUBLICACAO.md`. Navegador, Windows e Linux publicados em 18/10,
  com instruções de instalação dos aplicativos na página. Esta entrega não altera o balanceamento.
- A arte de fundo da execução no itch.io é própria, em formato horizontal, sem menus desenhados;
  fica no acervo de publicação. Parâmetros da hospedagem não contam como atalhos para a rua.
- O fundo externo da página (`fundo-pagina-itch-laterais-1920.png`) usa capturas reais como referência:
  Bruxinha, Poste Corrompido, Casa Desperta e Pestinhas nas laterais, com centro discreto,
  casas cinzas, postes brancos e paleta noturna. O favicon da aba do itch.io fica em
  `favicon-pagina-titulo.png`, extraído da porta dourada do logotipo. Ambos pertencem ao acervo
  `Design Codex/Artes/publicacao/` e são enviados aos campos próprios da página, fora dos ZIPs.

## visual.json

- `alturaAndarPx`: 48 (múltiplo de 24, conferido pelo esquema).
- `volumes.limiarTopo`: componente vertical mínima da normal para a face ser "topo" (0,5).
- `volumes.resolucaoTexturaMax`: teto (2) da escala em que os modelos são assados. A escala é
  `devicePixelRatio × camera.zoomMax` (`src/render/resolucao.ts`): numa tela comum, 1,2×, nítida
  no maior zoom com um terço dos pixels de 2×; em tela de alta densidade, o teto.
- `sombraProjetada`: direção `[-0.4, 1]` (tiles) e 0,01 tile de sombra por px de altura.
- `camera`: zoom 0,8–1,2 (passo 0,1 na roda), seguir com rigidez 6/s, olhar 2 tiles à frente com
  rigidez 3/s, folga de 2 tiles além da borda da rua; velocidade da câmera livre da prévia.
- `marcadorDestino`: anel laranja de raio 0,35 tile que some em 0,45 s.
- `combateNaTela`: mira no chão (22% de preenchimento, contorno a 85%), vassoura voando a 14 px do
  chão com 3 quadradinhos de rastro, áreas a 22%, partículas quadradas de 4 px por 0,35 s, 7
  abóboras de 8 px por onda do R caindo de 90 px, explosão do Caldeirão por 0,38 s, números de dano
  subindo 28 px em 0,6 s, piscar branco de 90 ms e barra de Coragem dos inimigos (30 × 4 px).
- `combateNaTela.pausa`: acerto de habilidade 0,05 s, crítico e Poste 0,08 s, só na tela.
  `tremor`: explosões e áreas do R 3 px, Poste 6 px, chefe 10 px; duração 180 ms.
  `claraoPoste`: 1 s, reduzindo a escuridão em até 80% e devolvendo-a gradualmente.
  `trato`: afastamento e retorno da câmera em 1 s, fator mínimo de zoom 0,85 do original;
  textos para preço nas próximas ruas e presente sem preço. Não muda as regras da luz.
  `numeroDano.escalaCritico` 1,35 e `escalaFrenesi` 1,3, arredondadas para pixels inteiros da fonte;
  críticos usam o amarelo `acentos.doce`.
- `interface`: alfa das placas (0,84), margem da tela (16 px) e os botões Q/W/E/R (60 px com 10
  px entre eles). O resto do layout sai desses números em `CenaInterface.ts`.
- `luzNaTela`: polígono de 20 lados para os círculos de luz, halo do poste com raio 1,4 tile, borda
  suave de 12%, escuridão `#0B0C11` a 60%, tint `#8E909C` para o que fica no escuro e o piscar do
  Poste Corrompido (halo a 30%, período 1,3 s, alfa mínimo 0,25).

## luz.json

| Fonte            | Raio (tiles) | Origem                                     |
| ---------------- | ------------ | ------------------------------------------ |
| Poste amigo      | 3            | GDD                                        |
| Janela acesa     | 1,5          | GDD; a luz cai 0,5 tile à frente da parede |
| Lanterna         | 2            | GDD (ainda sem uso)                        |
| Poste Corrompido | 2            | Valor inicial novo, só visual (halo roxo)  |

## ruas.json

Cada rua tem `entrada` (onde o jogador aparece) e `bonecos` (alvos de treino, opcionais). Cada objeto tem `modelo`, `x`, `y` (canto mínimo da pegada, em tiles) e `rot` (0, 90, 180 ou 270;
0 = frente para +x). Modelos: `casa_terrea`, `sobrado`, `casa_grande`, `poste` (com `estado`:
`amigo`, `apagado` ou `corrompido`), `lixeira`, `arvore` e `banco`. `figurantes` aceita `bruxinha`
e `pestinha_lencol`, só para escala na prévia.

| Rua         | Tamanho | Conteúdo                                                                                                                                     |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `rua_teste` | 24 × 22 | 10 casas (5 de cada lado), 5 postes (2 amigos, 1 apagado, 2 corrompidos), 2 lixeiras, 2 bancos, 7 árvores, 3 figurantes, 3 bonecos de treino |
| `vitrine`   | 18 × 16 | As 3 casas e os 4 objetos de rua na composição da imagem de referência                                                                       |

## Modelos desenhados por código (`src/render/modelos.ts`)

| Modelo             | Pegada (tiles) | Peças                                                                             |
| ------------------ | -------------- | --------------------------------------------------------------------------------- |
| Casa térrea        | 3 × 3,75       | Corpo, telhado de duas águas, garagem baixa, janela saliente, janela de sótão     |
| Sobrado            | 2,75 × 2,6     | 3 andares com frisos, beiral, telhado de 4 águas, janela saliente, escada lateral |
| Casa grande        | 3,85 × 4,6     | Corpo, ala da frente com porta e janela em arco, garagem, chaminé nos fundos      |
| Poste              | 1 × 1          | Base, haste, luminária (branca, cinza ou roxa) e tampa                            |
| Lixeira            | 1 × 1          | Prisma octogonal com tampa                                                        |
| Árvore             | 1 × 1          | Tronco e copa de 3 esferas low-poly                                               |
| Banco              | 1 × 1,4        | Pés, assento, encosto e braços                                                    |
| Bruxinha           | 1 × 1          | Corpo, cabeça, olhos laranja, aba e chapéu cônico (38 px)                         |
| Pestinha de Lençol | 1 × 1          | Lençol octogonal, cabeça esférica, olhos vermelhos (cerca de 31 px)               |

## modelos.json

Um registro por modelo (o esquema exige todos): `pegada` (largura × profundidade antes de girar) e
`colisao` (retângulos no espaço do modelo, frente para +x). Os desenhos de `src/render/modelos.ts`
leem a pegada daqui, e a simulação gira os retângulos com a mesma função do desenho. Colisão de
cada casa: as caixas das paredes (corpo, garagem, ala, janela saliente, escada, chaminé), sem os
beirais. Árvore, poste e lixeira bloqueiam só o tronco, a base e o corpo.

## habilidades.json

Cada habilidade é interpretada pelo executor genérico (`src/sim/habilidades.ts`). Os valores por
posto são listas: 5 valores para Q, W e E e 3 para o R (o esquema confere).

- `forma`: `linha` (projétil: `alcance`, `largura`, `velocidade`, `perfura`), `area` (`alcance`
  máximo do centro, `raio`, `atraso`, `pulsos` e `intervalo`) ou `dash` (`distancia`,
  `velocidade`, `atravessaCorpos`).
- `custo` (Energia), `recarga` (s, por posto), `lancamento` (s parado; 0 = instantâneo).
- `efeitos`: `dano` (`base` por posto + `razao` × `atributo`; com `porSegundo`, cada pulso aplica
  `valor × intervalo`) e `lentidao` (`valor` 0–1 e `duracao`, renovada a cada pulso).

| Id           | Nome               | Forma                                           | Custo | Recarga | Lançamento |
| ------------ | ------------------ | ----------------------------------------------- | ----- | ------- | ---------- |
| `bruxinha_q` | Vassoura Disparada | Linha de 8 tiles, largura 0,6, 14 tiles/s       | 40    | 6 s     | 0,25 s     |
| `bruxinha_w` | Poção Pegajosa     | Área de raio 2, alcance 7, 6 pulsos de 0,5 s    | 60    | 12 s    | 0,25 s     |
| `bruxinha_e` | Salto de Vassoura  | Dash de 4 tiles a 20 tiles/s, atravessa corpos  | 50    | 14–10 s | —          |
| `bruxinha_r` | Chuva de Abóboras  | Área de raio 3, alcance 8, 3 ondas a cada 0,5 s | 100   | 90–60 s | 0,8 s      |

Valores novos (não estão no GDD): alcance de 7 tiles do W e de 8 do R, velocidade do dash (20
tiles/s), intervalo de 0,5 s entre os pulsos do W e as ondas do R, e a lentidão do W renovada por
0,6 s a cada pulso (vale enquanto o alvo fica dentro).

## evolucoes.json (G6)

As evoluções de habilidade do complemento: por id de habilidade, as 2 opções (no R, os 2
Despertares). Cada uma diz só o que muda, e `src/sim/evolucoes.ts` monta a habilidade evoluída
(mesmo id) e a valida de novo pelo esquema ao carregar. Campos: `muda` (campos trocados; objetos se
mesclam, listas são substituídas), `efeitos` (somados), `recargaExtra` (s em todos os postos),
`multDano` (todo o dano) e `explodeAoFechar` (a área explode ao sumir com essa fração do dano por
segundo).

| Habilidade           | Evolução A                                           | Evolução B                                                     |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Q Vassoura Disparada | Ricochete: salta para mais 2 a até 3 tiles, com 60%  | Vassoura Pesada: atravessa todos, empurra 1 tile, recarga +2 s |
| W Poção Pegajosa     | Poção Explosiva: ao sumir, 150% do dano por segundo  | Poção Grudenta: enraíza por 1 s quem fica 1,5 s dentro         |
| E Salto de Vassoura  | Rastro de Faíscas: linha de 0,8 tile que machuca 2 s | Pouso Leve: +30% de velocidade por 2 s e a próxima Q sem custo |
| R Chuva de Abóboras  | Tempestade: 5 ondas e a área segue o cursor          | Abóbora Gigante: 1 queda com 400% do dano e 1,5 s de atordoar  |

Valores novos: o dano do Rastro de Faíscas (30 a 70 por segundo + 30% Feitiço, pulsos de 0,25 s);
cada salto do Ricochete causa 60% do dano do primeiro acerto (não encolhe a cada salto). O posto da
escolha é `combate.niveis.postoDaEvolucao` (3). Os Despertares valem desde a primeira run até a
maestria (G9) existir; a ficha tem a chave `despertares` para isso.

## campeoes.json

Só a Bruxinha por enquanto: Coragem 100, Energia 100 (regenera 4/s), Força 10, Feitiço 0,
Resistência 10, Pressa 0, atributo principal Feitiço. Auto-ataque: 5 tiles, 1 por segundo,
6 + 60% Feitiço, projétil teleguiado a 12 tiles/s, preparo de 0,2 s (GAMEPLAY). Passiva `caldeirao`: depois de 4 habilidades lançadas, a próxima causa
50% a mais e solta uma explosão roxa de raio 1 tile, que acerta quem está em volta (menos o alvo
principal) com esses 50% de bônus. A explosão causar dano é decisão nova; o GDD só diz que ela
existe.

## combate.json

| Campo                       | Valor                                                    | Origem                         |
| --------------------------- | -------------------------------------------------------- | ------------------------------ |
| `pressaMaxima`              | 40                                                       | GDD                            |
| `danoCritico`               | 1,5                                                      | GDD                            |
| `dotIntervaloDano`          | 0,5 s (o dano por segundo sai em pedaços)                | Novo                           |
| `recuo`                     | 0,3 tile a 6 tiles/s, respeitando casas e corpos         | GAMEPLAY; velocidade existente |
| `foraDeCombate`             | 4 s sem dano dão +20% de velocidade                      | GDD                            |
| `estados`                   | Chefes: 50% de lentidão pela metade do tempo             | GDD                            |
| `comandoGuardadoS`          | 0,15 s                                                   | GAMEPLAY                       |
| `fracaoRecargaInterrompida` | 0,5                                                      | GAMEPLAY                       |
| `raioBuscaAlvo`             | 2 tiles em volta do cursor (habilidades de alvo)         | Novo                           |
| `quaseAcertoTiles`          | 0,5 (desvio por pouco)                                   | GAMEPLAY                       |
| `assistenciaMiraGraus`      | 10                                                       | GAMEPLAY                       |
| `aquisicaoTiles`            | 1,5 além do alcance no "atacar e mover"                  | Novo                           |
| `luz`                       | 100 de Luz, pulso de 25 com raio 3 por 2 s, empurra 2    | GDD; recarga 10/s nova         |
| `niveis`                    | 1 a 12, XP 100 + 60 × (n − 1), +8% Coragem, +2 atributo  | GDD e GAMEPLAY                 |
| `bonecoTreino`              | 500 de Coragem, Resistência 10, renasce em 3 s, 25 de XP | Novo (rua de treino)           |

## inimigos.json

`recua` controla o recuo em `causarDano` (habilidade, auto-ataque e explosão). Postes têm
`recua: false` explícito; elites e chefes também são protegidos. O dano contínuo não empurra.

| Inimigo            | Coragem | Velocidade | XP  | Doces | Ataque                                                       |
| ------------------ | ------- | ---------- | --- | ----- | ------------------------------------------------------------ |
| Pestinha de Lençol | 60      | 2,6        | 6   | 2     | Golpe corpo a corpo de 8 (sem aviso), 1 por segundo          |
| Arremessador       | 40      | 2,4        | 7   | 2     | Ovo de 10 a 6 tiles/s, mantendo 5 tiles                      |
| Abóbora-Canhão     | 90      | 1,5        | 10  | 4     | Explosão de 25 em raio 2, anunciada por 1 s                  |
| Poste Corrompido   | 600     | —          | 40  | 15    | Tiro de 20 (+10% seguidos), mira 0,4 s, 9 tiles/s, alcance 5 |

Valores novos (o GDD não fixa): velocidades, raio do corpo, Resistência da Abóbora (10) e do Poste
(20), doces do Poste, recarga dos ovos (1,8 s) e da explosão (3,5 s), tempo de preparo do golpe
das pestinhas (0,25 s) e alcance de visão dos ovos (6,5). A escala de Coragem por bairro é do GDD
(×1,6 e ×2,4); o dano sobe 15% e 30%.

## tratos.json

Os 30 tratos têm nome, morador, até 2 marcas, o texto do poder, os efeitos (lidos por
`src/sim/run.ts` e `src/sim/tratos.ts`), a força (1 a 3) e 3 preços possíveis. Os 12 do GDD levam
a marca da tabela do complemento; os 18 novos são os do complemento.

| Campo           | Valor                                                                | Fonte    |
| --------------- | -------------------------------------------------------------------- | -------- |
| `conjuntos`     | Bônus de 2 e de 4 tratos das 6 marcas (Farol, Noite Eterna, ...)     | GAMEPLAY |
| `medalha`       | +4% de dano e +4% de Coragem máxima por Medalha; 80 doces; 4 → Chave | GAMEPLAY |
| `pechincha`     | 100 doces, uma vez por casa                                          | GDD      |
| `tratosPorFase` | 1                                                                    | GDD      |
| `especiais`     | Chave da Cidade: sem preço, +25% em todos os atributos               | GAMEPLAY |

Números novos (o complemento não fixa): Espantalho (dano 60, raio 3, empurra 2,5), escudo do
Segundo Fôlego por 30 s, pulso do Farol (60 + 0,5 × atributo principal), repetição do Eco de 2 e do
Coro 0,25 s depois, Chão em Chamas (`chamas_de_abobora` em habilidades.json: raio 1,2, 15 por
segundo por 2 s), luz das explosões com raio 2,5, Gato no Telhado por 1 s.

## precos.json

Os 10 preços do GDD, com o texto do bairro e do combate e os efeitos. Peso leve, médio ou pesado:
Janelas Fechadas, Banco Quebrado, Lanterna Fraca e Meia-Noite Adiantada são leves; Poste Apagado,
Vizinhança Atenta e Ondas Famintas, médios; Rua Sem Luz, Casa Perseguidora e Dívida, pesados.
Lanterna Fraca também tira 0,6 tile do pulso (novo).

## itens.json

| Item              | Preço | Efeito                                         | Fonte    |
| ----------------- | ----- | ---------------------------------------------- | -------- |
| Chapéu Pontudo    | 250   | +15 de Feitiço                                 | GDD      |
| Taco de Beisebol  | 250   | +15 de Força                                   | GDD      |
| Capa Grossa       | 200   | +12 de Resistência                             | GDD      |
| Tênis de Luzinha  | 200   | +10% de velocidade                             | GDD      |
| Ampulheta         | 300   | +12 de Pressa                                  | GDD      |
| Pote de Mel       | 350   | +10% de roubo de vida                          | GDD      |
| Lanterna de Pilha | 220   | +30 de Luz máxima, recarga 50% mais rápida     | Novo     |
| Meia de Lã        | 220   | +12% de Coragem máxima                         | Novo     |
| Estilingue        | 240   | Auto-ataques +20% de dano e +10% de velocidade | Novo     |
| Moeda da Sorte    | 280   | +10% de chance de crítico                      | Novo     |
| Cachecol Listrado | 260   | +8 de Resistência e +6 de Pressa               | Novo     |
| Pirulito          | 60    | Cura 25% da Coragem em 3 s                     | GDD      |
| Bala Efervescente | 80    | Recupera 50 de Energia                         | GDD      |
| Doce-isca         | 40    | Atrai inimigos e Postes por 4 s                | GAMEPLAY |

Até 5 itens e 2 espaços de consumível (pilha de 3, novo); o banco cura 30%. Os 6 itens iniciais
ficam à venda (4 sorteados por porta); os outros esperam o Álbum (tarefa 13).

## run.json

| Campo                 | Valor                                                     | Fonte |
| --------------------- | --------------------------------------------------------- | ----- |
| `nomesDosBairros`     | Vila das Lanternas, Ladeira do Mirante, Alameda do Dono   | GDD   |
| `ruasPorBairro`       | 3                                                         | GDD   |
| `consumiveisIniciais` | 2 Doce-iscas                                              | Novo  |
| `relogio`             | 21h, 4 min por minuto, meia-noite às 24h, +10% por minuto | GDD   |
| `loja`                | 4 itens comuns por porta                                  | Novo  |
| `porta`, `bau`        | Alcance do F: 1,4 tile da porta e 1,2 do baú              | Novo  |

## gerador.json: `portaAPorta`

Calçada de 18 tiles, rua de 6, 3 casas a partir de 1,5 tile do portão com 1,2 entre elas, faixa
de 3 tiles do banco, 3 postes amigos e 2 árvores; o ponto da porta fica 0,6 tile à frente da
fachada. Tudo novo (o GDD só descreve a cena).

## inimigos.json: selvagens, elites e o Síndico

| Inimigo              | Coragem | Ataques (todos anunciados)                                                   | Fonte              |
| -------------------- | ------- | ---------------------------------------------------------------------------- | ------------------ |
| Cão de Guarda        | 220     | Investida de 5 tiles (0,8 s, 30) e mordida (0,45 s, 16)                      | GDD; mordida nova  |
| Corvo da Árvore      | 80      | Nenhum: grita e chama 2 pestinhas a cada 10 s                                | GDD; números novos |
| Gato Preto           | 150     | Nenhum: foge a 3,3 tiles/s e some em 20 s                                    | GDD e GAMEPLAY     |
| Casa Perseguidora    | 900     | Pisão de raio 2,6 (1,2 s, 45 e lentidão); corpo de raio 1,5                  | GDD; Elenco v7     |
| Casa Desperta        | 450     | O mesmo Pisão; deita de novo se o jogador ficar 12 tiles longe por 8 s       | Casa Desconfiada   |
| Vizinho Curioso      | 400     | Nenhum: cone de 6 tiles e 70°, alerta +30% às pestinhas, 10 s                | GDD                |
| Cobrador             | 700     | Corrente que puxa 3 (0,6 s, 22) e cobrança (0,5 s, 26)                       | GDD; dano novo     |
| Sombra Rasteira      | 500     | Bote (0,45 s, 24); +30% de velocidade na sombra                              | GDD                |
| Guarda de Condomínio | 300     | Cassetete (0,5 s, 18)                                                        | GDD                |
| Síndico Zeloso       | 2.500   | Multa em leque de 3 (0,6 s, 22), Portão (1 s), Vistoria (1,2 s, atordoa 1 s) | GDD                |

XP do complemento (selvagens 40, 20 e 30; elites 120; Síndico 300). Doces, Resistências,
velocidades e recargas são novos. `eliteReforcado` = 0,3; elites nascem com o 1º Poste ou aos
90 s, as de preço aos 20 s (novo).

## noite.json

As 8 condições da noite (peso de sorteio, as raras marcadas), as 5 recompensas de portão e os 7
pedidos dos moradores, todos do complemento. Números novos: curva de 35° por segundo na Ventania,
peso 4 para a Noite Comum (as outras 1). `portoes` = 2 e `rarasPorBairro` = 1 (complemento).

## run.json (tarefa 9)

`selvagens` (Cão e Corvo com o mesmo peso, Gato em 34% das ruas), `baus` (raro em 30%: o
complemento dá 25% raro e 5% amaldiçoado, que entra na tarefa G8), `elites.porPosicao` (a curva
do complemento) e `chefes` (o Síndico nos 3 bairros até a tarefa 12).

## run.json e visual.json (telas da run)

| Campo                                | Valor                                                  | Origem |
| ------------------------------------ | ------------------------------------------------------ | ------ |
| `run.album`                          | Doces Guardados: 10% dos doces ganhos e 50 por chefe   | GDD    |
| `visual.interface.titulo`            | Rua de fundo (semente 7), zoom 1, câmera a 1,4 tile/s  | Novo   |
| `visual.interface.titulo.modSemente` | A semente de cada run vem do relógio, módulo 1.000.000 | Novo   |

## gerador.json: `arena`

Praça de 15 × 15 com 4 postes nos cantos, 2 bancos, 4 árvores e portão de 4 tiles (novo).

## Passe de design (D1 a D3)

- `visual.json` → `paleta.piso`: asfalto, calçada, grama, praça, terra, faixa e meio-fio, todos
  cinzas próximos do chão (nenhuma cor de acento).
- `modelos.json`: 36 modelos novos (lista em `MODELOS_DE_CIDADE`), cada um com pegada, colisão e as
  janelas do térreo que iluminam o chão (extraídas do desenho e conferidas por teste).
- `gerador.json`: `rua` (36 × 8, calçada 1,6, jardim 0,8), `faixaDasCasas` 4,4, `trechos`
  (entrada 3, praça 14 a 22, comércio a partir de 22), `praca` (pesos de chafariz, coreto e
  parquinho; 2 postes), `travessa` (4 de largura, calçada 0,6, recuo 1,5), `postesCorrompidos`
  (10 e 27), `carros` (4 a 7 vagas, folga 2), `enfeites` (árvores, lixeiras, bancos, hidrantes e
  chances de caixa de correio, abóbora e lápide nos jardins), `bairros` (pesos de casas, do
  comércio e das árvores) e `cidade` (anel 18, ruas de 1,2 + 5 + 1,2, recuo, postes a cada 7,
  árvores a cada 4,5, 30% de carros e de casas apagadas, pesos dos lotes e os 4 marcos).
- `ondas.json` → `flancoDesdeOnda` 3: a partir da 3ª onda o bueiro da travessa também solta
  pestinhas.
- `ruas.json` → rua `catalogo` com todos os modelos novos, para revisão na prévia.

## Passe de design (D4)

- `visual.json` → `interface` trocou os tamanhos antigos por `alfaPlaca` 0,84, `margemPx` 16 e
  `botao` (`tamanhoPx` 60, `espacoPx` 10).

## Passe E (rota, exploração e cidade)

- `gerador.json` → `rota`: grade de 6 × 8 células de 24 tiles, margem 4, 18 a 21 nós, chance de
  seguir reto 0,55, 6 a 9 becos; rua da rota com pista 7,6 e calçada 1,7, beco com pista 4 e calçada
  0,9; meio lado das salas (largo 8, Poste 9, praça 11, obra 10, pátio 11, quintal 6, cemitério 8,
  mirante 6); posições das salas na rota (Poste 0,35, praça 0,55, obra 0,72); pesos dos becos
  (quintal 4, cemitério 1, mirante 1, esconderijo 2); encontros (0,6 por nó, 3 a 5 pestinhas);
  postes a cada 9 tiles; 22% de carros; 3 a 5 buracos; comércio a partir de 70% da rota; pesos dos
  fechos de beco (obra, buraco, barreira, deslizamento) e das junções com as ruas de fora (obra,
  barreira); 30% de quarteirões de morro; 75% de chance de serra; `alcanceDaCamera` 26; rua de fora
  com pista 6 e calçada 1,2.
- `gerador.json` → `postesCorrompidos`: `afastamentoDoMeio` 2,4 e `segundoEm` (escola ou
  estacionamento); `exploracao` (6 a 9 campainhas, 3 segredos a 14 tiles uns dos outros, 3 a 5
  postes para religar); `nomes` (avenidas, ruas, becos, largos, praças, escolas, estacionamentos,
  obras e cemitérios); `bairros[].postesAmigos` maiores; `cidade.anel` 30. Saíram `trechos`,
  `travessa`, `vielasPorRua` e `espacoEntreVielas`.
- `exploracao.json` (novo): raio de interação 1,3; névoa em células de 2 tiles revelando 7 tiles a
  cada 6 ticks; marcos de 40% (30 doces, 40 XP) e 70% (60 doces, 80 XP); campainha (pesos de doces
  48, item 14, travessura 26, história 12; 12 a 26 doces; itens; 45 XP da história; luz da varanda
  1,4; travessura de 3 pestinhas depois de 0,8 s; as histórias); segredo (pega a 0,8, aparece a 3,2,
  35 doces, 30 XP, 12 de Susto); poste (1,2 s, 20 XP, revela 10); mirante (2 s, revela 45, 50 XP).
- `ondas.json`: 10 ondas; `bueirosPorOnda` 2, `distanciaMinima` 13, `distanciaMaxima` 32;
  `encontros` (acordam a 8 tiles, espalhados 1,4 tile).
- `run.json` → `baus.chanceNoQuintal` 0,65. `noite.json`: pedidos `explorador`, `abobora_dourada`,
  `campainhas` e `religar`.
- `modelos.json`: `morro`, `pedra`, `barreira`, `buraco`, `placa_obra` e `abobora_dourada`.
- `visual.json` → `animacao`: `inclinacao` 0,09, `rigidezInclinacao` 9, `achatarNoPasso` 0,07 e
  `poeira` (3 px, 320 ms, 22 px/s).

## Design Codex: acervo para uso manual

A pasta `Design Codex/` guarda 24 modelos de estudo da revisão 04 (12 construções, oito veículos
e quatro objetos de rua), em arquivos JSON individuais e em um arquivo reunido, com paleta,
projeção e pranchas das quatro vistas. Inclui também os conceitos de sete personagens, 14 itens,
quatro poderes e a passiva, a montagem da interface, os recortes das pranchas e 27 desenhos SVG
do estudo inicial. O índice e as fontes ficam na própria pasta. Esses arquivos não são carregados
pelo jogo e aguardam adaptação manual para uma eventual integração.

## visual.json: artes do Codex na interface (D5)

`interface.artes`: a pasta servida (`interface`, dentro de `public/`), os ids de item e de
habilidade que têm arte, a passiva por campeão (`bruxinha` → `caldeirao`), os retratos
(`bruxinha`) e `escalaPoder` 0,92 (fração do botão ocupada pela arte do poder). As imagens saem
de `node scripts/recortar-artes.mjs`.

`tons` e `facetas` (materiais dos personagens com três tons próprios e sombreamento por faceta)
já estão no esquema para os modelos 3D da E5, que ainda não entraram no jogo.

## bots.json e a calibragem da tarefa 10

`content/bots.json` guarda os perfis do GDD (Iniciante 450 ms e 25% de erro de mira, Médio 300 ms
e 12%, Experiente 200 ms e 5%), quantas runs cada perfil joga no relatório, os limites de tempo, a
ordem dos pontos de nível, a chance de cada evolução e o peso de cada condição na escolha de rota,
e as metas do GDD e do complemento que o relatório confere.

Mudanças de número feitas com os bots (antes → depois), todas no JSON:

| Onde                                 | Antes                 | Depois                                       | Por quê                                                 |
| ------------------------------------ | --------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `ondas.total`                        | 10 (passe E)          | 6                                            | Volta ao GDD; a rota longa já soma grupos dormindo      |
| `ondas.porBairro` (bairro 1)         | 4                     | 3                                            | O nível 1 não dava conta de grupo + onda juntos         |
| `gerador.rota.encontros`             | 0,6 por nó, 3 a 5     | 0,35 por nó, 2 a 4, só depois de 30% da rota | A 1-1 é o tutorial (complemento)                        |
| Auto-ataque da Bruxinha (`base`)     | 6                     | 10                                           | 6 por segundo não vencia nem uma pestinha por vez       |
| Pestinha de Lençol                   | 60 Coragem, 8 de dano | 50 e 6                                       | Ondas que nascem perto do jogador não dão respiro       |
| Poste Corrompido (`coragem`)         | 600                   | 480                                          | A rua passava de 6 minutos                              |
| `luz.cura.postePorS`                 | 2%                    | 3%                                           | Descansar na luz entre as ondas                         |
| Multa do Síndico (dano por projétil) | 22                    | 16                                           | O leque de 3 era quase todo o dano da luta              |
| Síndico Zeloso (`coragem`)           | 2.500                 | 2.900                                        | Com as Multas mais fracas, a luta durava menos de 3 min |

Os números de cada rodada estão em `docs/BALANCO.md` (`npm run bots`).

## Tarefa 11: os bots com os quatro campeões

- `bots.json` → `campeoes`: cada perfil joga `runsPorPerfil` runs com cada campeão da lista
  (Bruxinha, Fantasma, Esqueleto e Vampirinho). Desde a tarefa 12 há um arquivo de teste por
  campeão (`tests/bots/<campeão>.bots.ts`, os quatro em paralelo); `BOTS_MANTER=1` guarda o que já
  foi jogado (refazer um campeão só) e `BOTS_PERFIS=medio` limita os perfis.
- Metas novas: `diferencaEntreCampeoes` (bot médio, no máximo 10 pontos, GDD) e
  `campeaoQueMenosVence` (bot experiente, ao menos 50% no bairro 1, critério da tarefa 11).
- Escolha do alvo: `pesoDistanciaDeLonge` 0,35 e `pesoDistanciaCorpoACorpo` 1 (quem luta corpo a
  corpo bate primeiro no que está perto, em vez de atravessar a onda atrás do Arremessador).
- `folgaDaLuzSegura` 1: para se curar, o bot só vai a um poste amigo fora do alcance dos atiradores
  à vista (mais esta folga) e, na luz, só bate em quem encostar.
- `perseguicaoS` 5: quem luta corpo a corpo persegue o atirador escolhido por até 5 s.
- `inimigos.json` → Arremessador `lentidaoNoRecuo` 0,45: recua 45% mais devagar do que avança
  (2,4 → 1,3 tile/s), para quem chega perto conseguir alcançá-lo; ele continua mantendo 5 tiles.

Ajustes de campeão feitos com o relatório por campeão (antes → depois):

| Onde                               | Antes | Depois | Por quê                                                     |
| ---------------------------------- | ----- | ------ | ----------------------------------------------------------- |
| Fantasma, auto-ataque `base`       | 0     | 5      | Matava devagar no começo; o bot médio vencia 6% do bairro 1 |
| Fantasma, `coragem`                | 110   | 115    | Ainda morria muito na 1ª rua (12 de 32 runs)                |
| Fantasma, auto-ataque `porSegundo` | 1,4   | 1,5    | Seguia o mais fraco do bot médio                            |
| Esqueleto, `atributos.resistencia` | 15    | 10     | O bot experiente vencia 100% e o médio 69% (10 é o do GDD)  |
| Esqueleto, `coragem`               | 160   | 135    | Ainda o mais resistente; com 145 o médio vencia 66%         |
| Bruxinha, `coragem`                | 100   | 105    | O médio vencia 25%; com 115 passou a 69%                    |
| Vampirinho, `rouboVidaNaSombra`    | 0,2   | 0,15   | O médio vencia 63%, quase o mesmo que o experiente          |
| Vampirinho, `coragem`              | 130   | 125    | Com 120 o experiente vencia 47% (caía muito na 1-1)         |

As Coragens do GDD (100, 110, 160 e 130) eram valores iniciais; o papel de cada um continua: o
Esqueleto é o mais resistente e o Fantasma, o mais frágil dos de corpo a corpo.

Resultado (32 runs por campeão e perfil, `docs/BALANCO.md`): o bot médio vence o bairro 1 com
41% a 56% e o experiente com 50% a 81%; o iniciante, nunca. A diferença de 16 pontos no médio
está dentro do que o acaso faz com 32 runs (cerca de 18 pontos entre quatro campeões iguais); a
meta de 10 pontos pede 128 runs por campeão. O Vampirinho é o que mais cai na 1ª rua (8 a 10 de
32 runs, contra 2 a 6 dos outros).

## Tarefa 12: chefes dos bairros 2 e 3

- `run.json` → `chefes`: Síndico Zeloso, Viúva do Mirante e O Dono do Bairro.
- Chefes não usam `escalaPorBairro`: a Coragem e o dano de cada um já são os do bairro dele.
- `gerador.json` → `arena.lugarDoChefe`: a Viúva fica na casa `mirante`, nascendo 0,8 tile a leste
  da cerca oeste (na ponta da sacada); o Dono fica 2 tiles a oeste da cerca, sem casa (é a casa).

| Viúva do Mirante (`inimigos.json`) | Valor                                       | Origem              |
| ---------------------------------- | ------------------------------------------- | ------------------- |
| Coragem / Resistência              | 4.000 / 30                                  | GDD / calibrar      |
| Fases                              | abaixo de 60% (Escuridão) e de 25% (chão)   | GDD                 |
| Lágrimas                           | 4 por rajada, raio 0,65, 10 de dano, 0,8 s  | GDD (números novos) |
| Pausa entre rajadas                | 2,2 s (3 s no escuro)                       | novo                |
| Sombras da Viúva                   | 1 a cada 10 s, até 2; 120 de Coragem (×1,6) | GDD (até 2: novo)   |
| Bote da Sombra                     | em volta dela, raio 1,3, 14 de dano, 0,45 s | novo                |
| Garras / Investida                 | raio 1,5, 22 de dano / 6 tiles, 32 de dano  | novo                |
| Véu                                | 2 s invisível a cada 8 s                    | GDD                 |
| Altura na sacada                   | 48 px (2 andares)                           | novo                |

| O Dono do Bairro (`inimigos.json`) | Valor                                                | Origem           |
| ---------------------------------- | ---------------------------------------------------- | ---------------- |
| Coragem / Resistência / raio       | 6.500 / 40 / 2,1                                     | GDD / calibrar   |
| Andares                            | abaixo de 66% e de 33%                               | GDD (3 partes)   |
| Feixes                             | 5 por varrida em 60°, 20 de dano, 0,6 s; pausa 2,5 s | novo             |
| Pestinhas pelas portas             | 2 a cada 15 s, até 3                                 | novo             |
| Tijolos                            | 3 por chuva, raio 1,1, 24 de dano, 0,9 s             | novo             |
| Rampa                              | área 4 × 4 diante da casa, 4 s empurrando 0,45 tile  | novo             |
| Cobrança                           | um eco a cada 8 s, em ordem, até 2 elites            | GDD (ritmo novo) |

`inimigos.json` → `cobranca` diz o eco de cada preço pelo tipo do efeito: `postesApagados` e
`ruaSemLuz` apagam um poste da praça (o mais perto do jogador), `eliteExtra` invoca a elite do
preço, `intervaloOndas` solta 3 pestinhas e o resto vira uma área escura de raio 2,5 por 15 s.

Na praça do Dono, `lugarDoChefe.corpo` (de 3,6 tiles a oeste da cerca até a linha dela, 3,2 de
largura) vira obstáculo e a cerca diante dele sai: a fachada fecha a praça. O bloqueio cobre também
as pontas da cerca (a espessura dela), senão sobrava uma fresta por onde as pestinhas das portas
contornavam a casa e ficavam presas do lado de fora. Com raio 2,1, o corpo do Dono passa 0,1 tile
da parede: golpes e projéteis acertam a casa antes de bater nela. Com chefe na casa oeste, o banco
desse lado também sai.

`run.json` → `curva` (novidade de cada posição, GAMEPLAY.md, "Curva das ruas"):

| Posição | Novidade                                                       |
| ------- | -------------------------------------------------------------- |
| 2-1     | 50% dos postes amigos acesos já nasce apagada                  |
| 2-3     | Ondas de 2 lençóis, 1 Arremessador e 2 Abóboras-Canhão (pesos) |
| 3-1     | 80% dos postes amigos acesos já nasce apagada                  |
| 3-3     | Rua escura: todos apagados (só os de religar trazem a luz)     |

Os apagados pela curva somam aos dos preços, não religam e são escolhidos espalhados pela rua, sem
sorteio (a rua continua a mesma). A mesma fração dos postes da cidade em volta (só cenário) apaga
junto, para a rua escura parecer escura. A 3-2 já tem os 3 tipos de pestinha na mistura do bairro
3, e `ondas.json` → `porBairro` ficou em 3, 4 e 5 pestinhas por onda (o complemento pede 4, 5 e 6;
a do bairro 1 já tinha caído para 3 na tarefa 9).

### Calibragem com os bots na run inteira

`bots.json` → `bairros` passou a 3: os bots jogam a run inteira e `docs/BALANCO.md` ganhou a seção
"Chefes" (lutas, vitórias, duração e a Coragem que sobrou ao chefe nas derrotas). Diagnósticos com
o bot experiente (8 runs por campeão) levaram aos ajustes abaixo.

| O quê                    | Antes                                  | Agora                            | Por quê                                                      |
| ------------------------ | -------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Lágrimas                 | 5, raio 0,9, 18, 0,55 s                | 4, raio 0,65, 10, 0,8 s          | Davam 200 a 300 de dano por luta; o bot desviava por um triz |
| Sombras da Viúva         | até 3, Bote da Sombra Rasteira (elite) | até 2, Bote próprio (14 de dano) | A Sombra invocada usava o golpe da elite Sombra Rasteira     |
| Garras da Viúva          | 28                                     | 22                               | O Fantasma perdia na fase 3 com ela abaixo de 15%            |
| Feixes / Tijolos do Dono | 24, 0,5 s / 30                         | 20, 0,6 s / 24                   | Com as pestinhas, eram o que derrubava o bot no Dono         |
| Pestinhas das portas     | 2 a cada 12 s, até 8                   | 2 a cada 15 s, até 3             | Quem luta de perto passava a luta nelas                      |
| Raio do Dono             | 1,6                                    | 2,1                              | O bloqueio agora vai até a cerca (ver acima)                 |

Correções que os diagnósticos acharam (com teste):

- Colisão (`src/sim/mundo.ts`): a separação de dois corpos sobrepostos empurrava quem se mexia até
  o ponto de contato de uma vez (até 1 tile) e atravessava uma cerca de 0,3 tile; o Esqueleto ia
  parar atrás da cerca da Viúva e os dois trocavam golpes através dela por 11 minutos. Agora o
  empurrão vai aos poucos, como os subpassos do movimento.
- Bot: desvia pelo ponto livre com mais folga até o perigo (antes, o primeiro da lista, que muitas
  vezes passava por cima do círculo); mede a distância dos alvos até a borda (o Dono é uma casa
  de raio 2,1); na praça do chefe, enche a Coragem na luz antes de ir para a briga (a 3ª rua leva
  direto ao chefe, sem banco); e quem ataca de longe espera a cura na luz quando não há ninguém
  por perto.

## Tarefa G8: baús, encontros raros e tratos lendários

| `run.json` → `baus` | Valor                                  | Origem                |
| ------------------- | -------------------------------------- | --------------------- |
| `pesos`             | comum 0,7, raro 0,25, amaldiçoado 0,05 | GAMEPLAY.md           |
| `raioRevelar`       | 3 tiles                                | novo                  |
| `rarosPorBairro`    | 1                                      | GAMEPLAY.md           |
| `forcaAmaldicoado`  | 3 (o trato mais forte, até 3)          | GAMEPLAY.md ("forte") |

O `chanceGato` dos selvagens virou `encontros.chances.gato_preto` (0,34, 1 em cada 3 ruas).

| `run.json` → `encontros` | Valor                                                                                                             | Origem             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| `chances`                | Gato Preto 0,34, Criança Perdida 0,1, Festa na Garagem 0,1                                                        | GAMEPLAY.md        |
| Criança Perdida          | 150 doces e 1 Medalha; acha a 1,6 tile, segue a 1,1, chega a até 4 do portão; 3,8 tiles/s; nasce a 30% do caminho | GAMEPLAY.md / novo |
| Festa na Garagem         | 8 pestinhas, doces ×3, abre a 5 tiles, só além de 20% do caminho                                                  | GAMEPLAY.md / novo |
| Carrinho de Pipoca       | bairros 2 e 3, 3 itens, 40% de desconto, 30 s; chega a 5 tiles, atende a 1,6; a 45% do caminho                    | GAMEPLAY.md / novo |
| Janela Vermelha          | 5% por fase Porta a Porta, 2 preços                                                                               | GAMEPLAY.md        |

As chances são exclusivas (um único sorteio por rua), então nenhuma rua tem dois encontros; o
Carrinho é sorteado antes e a Chuva de Doces traz o Gato.

| `tratos.json` → `lendarios` | Efeito (`efeitos`)                     | Preços possíveis (2 sorteados)                            |
| --------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Noite Sem Fim               | `frenesiDobrado`, `mult` 2             | Rua Sem Luz, Casa Perseguidora, Dívida, Poste Apagado     |
| Coroa de Abóbora            | `explosaoDisparaQ`                     | Rua Sem Luz, Casa Perseguidora, Dívida, Ondas Famintas    |
| Relógio Parado              | `relogioParado`, 10 minutos            | Rua Sem Luz, Casa Perseguidora, Dívida, Vizinhança Atenta |
| Espelho do Mirante          | `reflexo`, 40% do efeito, 0,2 s depois | Rua Sem Luz, Casa Perseguidora, Dívida, Poste Apagado     |
| Chave Mestra Dourada        | `bausMelhores` (sem baú comum)         | Rua Sem Luz, Casa Perseguidora, Dívida, Ondas Famintas    |

`bots.json` → `bonusDoLendario` 3: quanto um lendário vale a mais na nota do bot experiente (sem
marca e com 2 preços, a nota dele sairia negativa e o bot sempre recusaria).

`bots.json` → `surpresas`: a regra de frequência das surpresas, validada pelo `npm run bots`.

| Campo            | Valor | O que faz                                                          |
| ---------------- | ----: | ------------------------------------------------------------------ |
| `runs`           |   500 | Runs simuladas sem luta (`BOTS_SURPRESAS=N` muda)                  |
| `semEncontroMax` |   0,1 | Fração máxima de runs sem nenhum encontro raro nem Janela Vermelha |

## Pendente

Elites, chefes, quintais com selvagens e baús, pedidos e textos entram nas tarefas seguintes.

### Acervo Design Codex — conceitos 03

- Sete inimigos e seis apresentações de recompensas em `Design Codex/Artes/conceitos-v3/`, como imagens de conceito seguindo a coleção 02.
- PNG de recompensas com transparência, regiões de recorte e prompts preservados; imagens conferidas visualmente e o canal alfa verificado em uma prévia estática do Playwright.
- Por orientação do usuário, o Codex cuida do design em imagens e a modelagem 3D fica para o Claude.
- Sem integração ao jogo; os 14 itens de inventário já cobertos pela coleção 02 permanecem referenciados.

### Acervo Design Codex — GLBs para revisão

O pedido seguinte autorizou o Codex a trabalhar em 3D a partir de oito arquivos gerados pelo usuário no Tencent. A pasta `Design Codex/Modelos GLB/` contém esses oito modelos polidos e 13 modelos novos: sete criaturas que completam as pranchas e seis recompensas do mundo. As duas versões da Abóbora-canhão foram mantidas.

Os GLBs têm materiais incorporados e equivalentes editáveis em Blender. O acervo registra origem, hashes, escala, contagens de triângulos, validação e pranchas estáticas em quatro vistas. Os modelos Tencent receberam redução conservadora, UVs novos, transferência de cor da superfície original e materiais foscos; o casaco do Síndico e a ligação da perna do Arremessador receberam reparos.

São estudos estáticos para uso manual, sem rig, animações ou integração ao renderizador. Os itens exclusivos da interface continuam em imagem. O índice está em `Design Codex/Modelos GLB/revisao/manifesto.json`.

### Acervo Design Codex — interface 04

A auditoria das telas, dos dados e das artes já carregadas identificou 121 ilustrações ausentes. A coleção `Design Codex/Artes/interface-v4/` completa três retratos, 12 habilidades e três passivas, 32 evoluções e Despertares, 31 tratos (incluindo a Chave da Cidade), dez preços, seis marcas, oito condições da noite e 16 símbolos da interface.

São imagens geradas com imagegen no estilo facetado das primeiras pranchas. Há PNGs individuais transparentes em 256 e 96 px, 14 folhas originais, pranchas com rótulos e leitura a 48 px, além de uma montagem estática da escolha de fantasia. `auditoria.json` registra a cobertura e `recortes.json` registra os arquivos e as regiões de origem; os prompts ficam em `Design Codex/Fontes/direcao-interface-v4/`.

Os 14 itens e as artes existentes da Bruxinha foram preservados. Barras, recargas, textos, placas e minimapa continuam como elementos nativos dinâmicos. O lote é para revisão e uso manual, sem integração ao jogo e sem novos modelos 3D.

### Acervo Design Codex — vistas do elenco 05

A comparação de `content/inimigos.json` com as coleções anteriores identificou três inimigos sem conceito próprio: Viúva do Mirante, Sombra da Viúva e O Dono do Bairro. A coleção `Design Codex/Artes/turnarounds-v5/` cria esses designs e completa as vistas do elenco: 16 inimigos e quatro campeões, com frente, costas, dois perfis, superior e três quartos.

São 120 vistas individuais e quatro imagens adicionais do estado normal/desperto do Dono, com pranchas estáticas, fichas de peças e pontos de ligação, proporções propostas, fontes, prompts e hashes. A Casa Perseguidora recebeu uma revisão para manter o telhado de duas águas entre as vistas. As projeções são referências ilustradas aproximadas; as fichas orientam a modelagem posterior pelo Claude no Blender.

O guia também indexa as vistas dos objetos físicos e da cidade já arquivados. Itens, poderes e símbolos exclusivos da interface continuam em imagem. Esta etapa não cria malhas, GLBs, arquivos Blender, rigs ou animações e não modifica o jogo.

## Luz da rua e personagens dos GLBs

`visual.json` → `luzNaTela` (só desenho; a regra da luz fica em `content/luz.json`):

| Campo          | Valor                                            | O que faz                                               |
| -------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `escuridao`    | `#0A0B12`, 70%                                   | A noite por cima do chão                                |
| `queda`        | cheia até 0,3 raio, 25% no raio, some 0,1 depois | Degradê do círculo do poste recortando a escuridão      |
| `pocas.poste`  | `#EEF1F6`, 20%                                   | Poça fria somada ao chão                                |
| `pocas.janela` | `#F2E6CC`, 16%                                   | Poça morna das janelas                                  |
| `pocas.pulso`  | `#EEF1F6`, 26%                                   | O pulso da lanterna (a única luz do jogador)            |
| `lampada`      | raio 0,8, 55%, a 67 px do chão                   | Brilho no ar em volta da lâmpada do poste               |
| `tintNoEscuro` | `#7F8396`                                        | Tom de quem está no escuro; mistura com o branco na luz |

| `feixe` | cheio até 25%, 35% na borda, some 30% depois | Degradê dos feixes (janelas e abóboras das portas) |
| `feixe.suaveInicio` / `forcaPorAndar` | 0,35 tile / 0,7 | A luz já chega antes do começo; cada andar acima, 70% |

`luz.json` perdeu `lanterna` (o círculo fixo em volta do jogador saiu).

### Luzes direcionais

A luz das janelas e das abóboras das portas deixou de ser um círculo: cada abertura joga um feixe
no chão, da parede para onde ela olha, com a largura dela, e a regra da luz (`src/sim/luz.ts`,
`noFeixe`) usa a mesma forma que a tela desenha. Os postes e o pulso da lanterna continuam
redondos (a lâmpada ilumina para baixo, em volta).

`luz.json` → `janela` (era `raio` 1,5 e `afastamento` 0,5):

| Campo            | Valor | O que faz                                                         |
| ---------------- | ----: | ----------------------------------------------------------------- |
| `comprimento`    |   2,6 | Quantos tiles o feixe anda a partir da parede                     |
| `abertura`       |  0,35 | Quanto cada lado abre por tile andado                             |
| `inicioPorAndar` |   0,8 | A luz de um andar de cima começa esses tiles mais longe da parede |

Toda janela acesa joga luz, de todos os andares, mas só a que a câmera vê (paredes +x e +y depois
de girar a casa): a janela de costas fica escondida, e a luz sem fonte à vista parecia erro.
`modelos.json` → `janelas` ganhou `largura` (tiles) e `andar` de cada janela.

### Sombras das luzes

De noite, quem faz sombra são as luzes: cada poste e cada janela projetam a sombra dos objetos
para longe deles, da altura em que ficam, e um objeto entre duas luzes ganha duas sombras. A
sombra é recortada do carimbo da própria luz (é onde ela não chega); o chão da noite é assado sem
a sombra do sol, que só vale de dia. Cada personagem leva as sombras das luzes mais fortes que
chegam nele.

`visual.json` → `luzNaTela.sombras`:

| Campo                  | Valor | O que faz                                                 |
| ---------------------- | ----: | --------------------------------------------------------- |
| `forca`                |   0,8 | Quanto a sombra tira da luz                               |
| `penumbraPx`           |   2,5 | Desfoque da borda da sombra                               |
| `alturaJanelaPx`       |    26 | Altura da luz da janela acima do piso do andar dela       |
| `alturaPulsoPx`        |    32 | Altura da lanterna (pulso)                                |
| `porFigura`            |     3 | Quantas sombras um personagem leva (as luzes mais fortes) |
| `larguraFigura`        |  0,55 | Largura da sombra do personagem, em tiles                 |
| `comprimentoMaxFigura` |   2,5 | Até onde a sombra do personagem vai, em tiles             |
| `minimo`               |  0,08 | Luz mais fraca que isso não faz sombra                    |

O poste usa a altura da lâmpada (`lampada.alturaPx`, 67 px).

`exploracao.json` → `campainha.luz` (era `raioLuz` 1,4): o feixe da abóbora da porta, com
`largura` 0,9, `comprimento` 2 e `abertura` 0,4, da porta para a frente da casa; a porta virada
para os fundos não acende.

`visual.json` → `malhas`: o topo de cada malha clareia para 120% da cor, a face esquerda fica com a
cor e a direita escurece para 74%, e `alturaPx` dá a altura de cada uma no jogo (a mesma dos
modelos que elas substituíram):

| Modelo                                   | Altura (px)       |
| ---------------------------------------- | ----------------- |
| Bruxinha / Síndico / Cobrador            | 46 / 45 / 50      |
| Pestinha / Arremessador / Abóbora-Canhão | 26 / 34 / 32      |
| Guarda / Cão / Gato / Corvo              | 36 / 30 / 20 / 20 |
| Casa Perseguidora / Vizinho / Sombra     | 121,8 / 32 / 14   |
| Poste Corrompido / Doce-isca / doce      | 82 / 28 / 9       |
| Abóbora Dourada / baú / aberto / raro    | 18 / 17 / 24 / 18 |

No conversor (`scripts/converter-glb.py`), os polidos com textura são reduzidos (Bruxinha 1.400
triângulos, Pestinha 4.000 para os olhos sobreviverem, os outros de 900 a 1.400) e os modelos
novos de cor sólida ficam como vieram (100 a 1.260). Cor bem saturada e clara na textura
(saturação ≥ 0,6 e valor ≥ 0,3) vira face que brilha.

## Tarefa 13: Álbum de Fantasias, save, Lua Cheia, semente da noite e A Moradora do 13

`album.json` (novo) é o catálogo do Álbum; o save fica no localStorage na chave `save.chave`, e um
save de outra `save.versao` (ou quebrado) começa do zero.

| Compra                      | O que libera                                                  | Preço           |
| --------------------------- | ------------------------------------------------------------- | --------------- |
| `campeoes`                  | Fantasma, Esqueleto e Vampirinho antes do marco (GDD)         | 300 / 400 / 500 |
| `tratosIniciais`            | Os 12 tratos do GDD, que toda run já oferece                  | —               |
| `paginas` (6)               | 3 tratos cada: Luz, Sombra, Doce, Abóbora, Eco e Pacto (18)   | 60 a 80         |
| `itens` (7)                 | Itens que não são iniciais entram na loja do banco e nos baús | 40 a 70         |
| `bonus.coragem`             | +5% de Coragem máxima por nível (2 níveis)                    | 50 / 100        |
| `bonus.doces`               | +50 doces no início por nível (2 níveis)                      | 40 / 80         |
| `bonus.reroll`              | +1 pechincha de graça por nível (2 níveis)                    | 50 / 100        |
| `cores` (2 por fantasia, 8) | Giro de matiz das cores vivas e tingido dos cinzas da roupa   | 80              |

Os marcos dos campeões continuam os de `campeoes.json` (vencer o bairro 1, o bairro 2, uma run),
contados no save em `maisChefes` e `vitorias`.

`run.json`: `album.porLua` 0,1 (os Doces Guardados crescem 10% por nível de Lua Cheia),
`album.moradora` 200 (vencer A Moradora do 13) e `chefeSecreto` (`moradora_do_13`). Saiu
`campeoesLiberados`: agora só a Bruxinha começa liberada.

`luaCheia.json` (novo): os 10 níveis, cada um somando o seu aos de baixo. A primeira vitória libera
o nível 1, e vencer no nível mais alto liberado libera o seguinte.

| Nível | Efeito                                          | Origem |
| ----- | ----------------------------------------------- | ------ |
| 1     | Inimigos com +15% de Coragem                    | GDD    |
| 2     | Postes Corrompidos recarregam 30% mais rápido   | GDD    |
| 3     | A run começa com 1 preço aleatório pago         | GDD    |
| 4     | Relógio da Meia-Noite 5 min adiantado           | GDD    |
| 5     | A Moradora do 13 espera quem termina sem tratos | GDD    |
| 6     | Inimigos com +15% de dano                       | Novo   |
| 7     | Uma pestinha a mais por onda                    | Novo   |
| 8     | Itens do banco 25% mais caros                   | Novo   |
| 9     | Ondas a cada 20 s                               | Novo   |
| 10    | Chefes com +25% de Coragem                      | Novo   |

`inimigos.json` → `moradora_do_13` (comportamento `moradora`): Coragem 4.500, Resistência 40,
velocidade 3,2. Copia Q, W, E e R do campeão nos postos e com as evoluções dele; em `param`,
`fatorAtributos` 0,75 (Força, Feitiço e crítico do campeão), `fatorRecarga` 1,4, `avisoMinimoS` 0,5
(todo golpe dela é anunciado), `velocidadeMaxProjetil` 8,5, `distancia` 4 (onde ela fica),
`pausaEntreHabilidades` 0,9, `fase2` 0,5 com `fatorRecargaFase2` 0,7 e `matiz` 180 (o desenho é o
do campeão com as cores giradas). Perder o duelo ainda é vitória: o Dono do Bairro já caiu.

`visual.json` → `coresAlternativas.tingido` 0,35: quanto a cor nova tinge os cinzas das fantasias.

**Semente da noite:** a semente é o hash da data local (`sementeDoDia`), igual para todos; a run
dessa semente tem todos os tratos e itens liberados, sem bônus e sem Lua Cheia. O placar local
guarda as 5 melhores tentativas de cada dia (mais chefes, mais ruas, mais dano, menos tempo) das
últimas 7 noites.

## Tarefa G9: entre as runs (`entreRuns.json`)

| Campo                             | Valor                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `maestria.pontosPorXp`            | 0,1 ponto por XP da run                                                                    |
| `maestria.pontosPorChefe`         | 60                                                                                         |
| `maestria.pontosPorVitoria`       | 150                                                                                        |
| `maestria.niveis`                 | 400, 1.100, 2.200, 3.600 e 5.400 pontos (níveis 1 a 5)                                     |
| `maestria.comeco.ofertas`         | 3 tratos sem preço antes da 1-1 (maestria 3)                                               |
| `maestria.titulos`                | O título de cada fantasia na maestria 5                                                    |
| `diario.paginas`                  | Doces Guardados por página fechada: 60 (condições) a 150 (evoluções)                       |
| `diario.encontros`                | Nome e dica dos 5 encontros raros                                                          |
| `moradores.pechinchaLembrado`     | 0,5 do preço da pechincha com quem lembra de você                                          |
| `moradores.recusasParaOfender`    | 3 recusas seguidas                                                                         |
| `moradores.ruaDoOfendido`         | Aparece depois de 1 rua vencida                                                            |
| `moradores.cumprimentos/ofendido` | Falas de uma linha                                                                         |
| `desafios.doces`                  | 200 Doces Guardados na primeira vitória da semana                                          |
| `desafios.lista`                  | 7 desafios: Só Abóbora, Só Sombra, Só Pacto, Neblina, Lua Vermelha, Ventania e Lua Cheia 3 |

`campeoes.json` → `passivaAlternativa` (maestria 4):

| Campeão    | Passiva          | Números                                        |
| ---------- | ---------------- | ---------------------------------------------- |
| Bruxinha   | Feitiço Instável | 20% em dobro, 5% de falha                      |
| Fantasma   | Frio na Espinha  | +25% de dano em quem está atrás dele           |
| Esqueleto  | Ossos Ocos       | Sem Remontar; +30% de velocidade e do E        |
| Vampirinho | Luz do Dia       | Roubo de vida de 10% sempre; cura 5% por Poste |

`inimigos.json` → `morador_ofendido`: o Cobrador com Coragem 800 e 120 doces, que entrega o trato
do morador sem preço ao cair.

## Tarefa 14, parte 1: áudio (`audio.json`)

Sons sintetizados por código (Web Audio: osciladores e ruído com envelope), sem arquivos de som.
Cada som tem um canal, um intervalo mínimo entre duas vezes (uma área que acerta dez inimigos toca
uma vez só) e camadas com onda (`seno`, `quadrada`, `triangulo`, `serra` ou `ruido`), frequência
(no ruído, o corte do filtro), deslize até `freqFim`, duração, volume, atraso e filtro.

| Campo                         | Valor                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| `volumes`                     | geral 70%, efeitos 80%, interface 60%                       |
| `acertoSeguido`               | até 2 s entre acertos sobe 2 semitons por degrau, até 3     |
| `semitonsPorTecla`            | Q 0, W +2, E +4, R −5 (o mesmo timbre do campeão)           |
| `acerto` / `critico`          | Triângulo 660→520 Hz com estalo; crítico sobe 880→1320 Hz   |
| `acertoAuto`                  | Toque curto e baixo (440→330 Hz)                            |
| `danoJogador`                 | Serra grave 180→90 Hz com ruído                             |
| `posteCaiu`                   | Estalo de ruído e um baque 120→40 Hz                        |
| `doce` / `nivel` / `portao`   | Duas notas agudas / arpejo de 3 notas / rangido grave       |
| `frenesi`                     | Subida de 220 a 880 Hz em 0,45 s                            |
| `aviso`                       | Dois bipes quando um inimigo anuncia um ataque forte        |
| `trato` / `compra` / `clique` | Acorde menor lento / duas notas / clique curto da interface |
| `lancar_<campeão>`            | Um timbre por campeão ao lançar qualquer habilidade         |

A tecla M liga e desliga o som em qualquer tela; a escolha fica no navegador
(`portaAPorta:som`), fora do save do progresso.

## Tarefa 14, parte 2: primeira run (`dicas.json`)

| Campo                    | Valor                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `rua.passos`             | andar, atacar, Q, lanterna, Poste e portão, nessa ordem, um por vez   |
| `rua.esperaInicialS`     | 2,5 s depois de a rua abrir (o título passa antes)                    |
| `rua.porDicaS`           | Cada dica fica até 15 s se o jogador não fizer a ação                 |
| `rua.duracaoS`           | 90 s de dicas, no máximo                                              |
| `rua.andarTiles`         | Andar 1,5 tile tira a dica de andar                                   |
| `linhaS`                 | A linha da primeira vez do Susto fica 6 s                             |
| `susto/evolucao/marcas`  | As linhas da primeira vez: Susto, tela de evolução e a primeira porta |
| `run.json → primeiraRun` | A primeira fase Porta a Porta da primeira run mostra 2 tratos         |

Na primeira porta, cada trato vem com o preço mais leve dele (como no pedido "Frenesi duplo") e
sem Janela Vermelha. As dicas valem enquanto estão ligadas no título (H) e somem de vez depois da
primeira vitória; o save guarda `dicas` e `dicasVistas` (campos novos com padrão).

## G10, parte 2: metas dos ganchos

`bots.json` ganhou as metas que faltavam do complemento (GAMEPLAY.md, "Metas de teste dos ganchos"),
todas do bot experiente:

| Meta (`id`)             | Métrica                                                         | Alvo      |
| ----------------------- | --------------------------------------------------------------- | --------- |
| `conjuntoDe4`           | Runs com ao menos 1 Conjunto de 4 completo                      | 50% a 70% |
| `conjuntoQueMenosVence` | Taxa de vitória das runs com o Conjunto de 4 que menos vence    | ≥ 45%     |
| `conjuntoQueMaisVence`  | Taxa de vitória das runs com o Conjunto de 4 que mais vence     | ≤ 75%     |
| `conjuntoNasVitorias`   | Parte das vitórias com o Conjunto de 4 mais presente nelas      | ≤ 30%     |
| `bomVizinho`            | Parte das vitórias com até `maxTratos` (1) trato: o Bom Vizinho | 10% a 25% |

- `minRunsPorBuild` (3): uma build (campeão + Conjuntos ativos no fim) só entra na lista das 5
  que mais e das 5 que menos vencem com tantas runs.
- `retornoMaxS` (10): da derrota ao começo da nova run. É de tela, medido no Playwright
  (`tests/e2e/ganchos.spec.ts`, que roda sozinho depois dos outros testes): as pausas de projeto
  mais o tempo real de carregar a nova run.
- `visual.json` → `interface.pausaFimMs` (2.600) e `interface.botaoDoFimMs` (1.500): a mensagem de
  vitória ou derrota e a espera do botão "Nova run", que saíram do código.
- `visual.json` → `luzNaTela.sombras.porQuadro` (6): sombras de luz novas feitas por quadro. Antes
  a sombra de cada luz do mapa inteiro era feita no primeiro quadro; agora só as luzes na vista, e
  umas por quadro. A nova run passou a carregar em cerca de 2 s em vez de 5 s no navegador de teste.

## E5, parte 1: corpo animado das malhas prontas

`visual.json` → `malhas`:

| Campo            | Valor | O que faz                                                                   |
| ---------------- | ----- | --------------------------------------------------------------------------- |
| `degrausDoPasso` | 2     | Degraus do balanço do passo para cada lado (cada um é uma pose assada)      |
| `posesPorQuadro` | 1     | Poses novas assadas por quadro; as outras esperam (a figura fica na parada) |
| `esqueletos`     | —     | Por modelo, as partes do corpo que giram (lista abaixo)                     |

Cada parte de `esqueletos.<modelo>`:

- `parte`: nome (`bracoE`, `bracoD`, `pernaE`, `pernaD`, `frenteE`, `trasD`, `cabeca`...).
- `regioes`: caixas (`caixa.min`, `caixa.max`) ou cápsulas (`capsula.a`, `capsula.b`,
  `capsula.raio`) em metros nos eixos da malha (frente em +x, esquerda em +y, z para cima). O
  triângulo cujo centro cai numa região é da parte; a primeira parte da lista tem prioridade.
- `pivo`: ponto em volta do qual a parte gira (ombro, quadril, pescoço), em metros.
- `passoGraus`: quanto a parte vai para a frente (positivo) ou para trás no ponto mais aberto do
  passo. Pernas de um lado e do outro têm sinais opostos; o braço vai ao contrário da perna do
  mesmo lado.
- `golpeGraus` (0 se faltar): quanto a parte sobe para a frente no golpe; negativo baixa (a
  cabeça do cão e do gato).

Modelos com esqueleto: Bruxinha, Arremessador, Cobrador, Guarda, Síndico, Vizinho Curioso, Cão de
Guarda e Gato Preto. Para conferir uma região, `?cena=elenco&so=<modelo>&escala=8&pose=1` (ou
`pose=-1`, `pose=0,g`).

## Brilho próprio no escuro (`visual.json` → `luzNaTela.brilhoProprio`)

Só tela: quem está em `especies` (hoje só `moradora_do_13`) nunca escurece abaixo de `luzMinima`
(0,7) e, de noite, tem uma aura clara no chão de `raio` (1,6 tile) e `alfa` (0,35) em volta dos
pés. Serve para quem precisa ser visto numa praça apagada; não ilumina nada para as regras.

## Acervo de avaliação da modelagem v6

`Design Codex/Avaliacao de Modelagem v6/` guarda modelos separados para avaliação, sem conversão
para `src/render/malhas/` e sem referências no jogo.

- Arte nova do `morador_ofendido`: seis vistas, cardigã, chinelos, papel na mão esquerda e corrente
  com chaves na direita. A corrente comunica o executor que ele compartilha com o Cobrador.
- Modelagem a partir dos designs existentes: `fantasma`, `esqueleto`, `vampirinho`,
  `viuva_do_mirante`, `sombra_da_viuva` e `dono_do_bairro`, incluindo a variação visual desperta.
- Modelo do Morador Ofendido e quatro variantes de material para `moradora_do_13`, que mantém
  a fantasia do jogador e gira o matiz em 180°. A Bruxinha espelhada reutiliza o GLB polido
  anterior; os outros três reflexos usam as bases desta avaliação.
- 12 arquivos GLB, 12 arquivos Blender, 72 renders, pranchas estáticas, comparações, prompts e
  fontes reproduzíveis. Todos são estáticos, sem rig ou animações. Escala e pivôs de animação
  dependem de uma etapa posterior à aprovação.
- `revisao/cobertura.json` relaciona os 18 inimigos e os quatro campeões aos modelos novos ou
  anteriores; `revisao/validacao-glb.json` registra a conferência da exportação por reimportação.

As imagens anteriores de `turnarounds-v5` não foram alteradas. Esta coleção não muda balanceamento,
regras, interface ou iluminação do jogo.

## Tarefa 14, parte 3: balanceamento (1ª etapa)

Números mudados depois de seis rodadas de bots (o porquê está nas notas da tarefa em `TASKS.md`):

| Onde                                                    | Antes                          | Agora                          |
| ------------------------------------------------------- | ------------------------------ | ------------------------------ |
| `campeoes.json` → Coragem                               | 105/115/135/125                | 126/138/160/150                |
| `inimigos.json` → Pestinha (golpe)                      | 6                              | 5                              |
| `habilidades.json` → `ovo`                              | 10                             | 9                              |
| `inimigos.json` → Poste Corrompido                      | 480                            | 320                            |
| `inimigos.json` → Síndico / Viúva / Dono                | 2.900/4.000/6.500              | 5.500/5.400/5.200              |
| `habilidades.json` → garras/investida/lágrimas da Viúva | 22/32/10                       | 18/26/8                        |
| `inimigos.json` → Cobrador                              | 700                            | 550                            |
| `inimigos.json` → `escalaPorBairro`                     | [1; 1,6; 2,4] e [1; 1,15; 1,3] | [1; 1,4; 2,0] e [1; 1,05; 1,1] |
| `gerador.json` → `rota.encontros.porNo`                 | 0,35                           | 0,2                            |

## Música (`audio.json` → `musica`)

| Campo          | O que é                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `volume`       | Volume do canal da música (0,5), embaixo do volume geral                                      |
| `tonica`       | Nota MIDI da tônica (45 = Lá 2)                                                               |
| `escala`       | Semitons da escala (lá menor harmônico: 0 2 3 5 7 8 11)                                       |
| `transicaoS`   | Cruzamento entre trilhas e entrada/saída do combate (1,5 s)                                   |
| `combate`      | Rua em combate: ao menos `minimo` (2) inimigos vivos a até `raioTiles` (9) do jogador         |
| `instrumentos` | Onda, volume, oitava (semitons), ataque, soltar, filtro; percussão com `freqBatida` e `queda` |
| `trilhas`      | `titulo`, `rua` e `chefe`: bpm e camadas (instrumento, compassos de 16 passos, `intensa`)     |

Num compasso, cada passo é uma semicolcheia separada por espaço: número = grau da escala (7 é a
oitava de cima, negativos descem), `x` = batida, `-` = segura a nota anterior, `.` = silêncio.
As camadas `intensa` só soam com a rua em combate.

## Controles e rolamento (`controles.json`, `jogador.json`)

| Campo                          | Valor                              | O que faz                                |
| ------------------------------ | ---------------------------------- | ---------------------------------------- |
| `controles.habilidades`        | Q: BOTAO_DIREITO, W: Q, E: E, R: R | Tecla física de cada habilidade da ficha |
| `controles.rolar`              | SPACE                              | Rolamento                                |
| `controles.lanterna`           | SHIFT                              | Pulso da lanterna                        |
| `controles.interagir`          | F                                  | Portas, baús, campainhas                 |
| `jogador.rolamento.distancia`  | 2,5                                | Tiles do rolamento                       |
| `jogador.rolamento.velocidade` | 12                                 | Tiles por segundo                        |
| `jogador.rolamento.imuneS`     | 0,3                                | Segundos sem levar dano                  |
| `jogador.rolamento.recargaS`   | 1,2                                | Segundos até rolar de novo               |

Os nomes das teclas são os de `Phaser.Input.Keyboard.KeyCodes`; `BOTAO_DIREITO` é o mouse.
WASD e as setas andam sempre.

## Ataque básico manual (`combate.json` → `ataqueManual`)

| Campo              | Valor | O que faz                                                  |
| ------------------ | ----- | ---------------------------------------------------------- |
| `arcoGraus`        | 100   | Abertura do golpe de perto, à frente da mira               |
| `alcanceExtra`     | 0,3   | Tiles somados ao alcance do campeão (`autoAtaque.alcance`) |
| `golpesNoCombo`    | 3     | Golpes do combo                                            |
| `janelaComboS`     | 0,9   | Pausa máxima entre golpes antes de o combo recomeçar       |
| `multUltimo`       | 1,6   | Dano do último golpe do combo                              |
| `empurraoUltimo`   | 0,7   | Tiles que o último golpe empurra quem recua                |
| `alcanceProjetil`  | 7     | Alcance do tiro da Bruxinha                                |
| `assistenciaGraus` | 20    | O tiro é puxado para o inimigo a até tantos graus da mira  |

O dano e a velocidade de cada campeão continuam em `campeoes.json` → `autoAtaque`
(`base`, `razao`, `porSegundo`, `projetil`). `audio.json` → `golpeFinalNoCombo` (2) escolhe o golpe
que toca o som pesado.

## Noite curta, doce ou travessura e preço na hora

| Onde                                                                    | Valor                 | O que faz                                                            |
| ----------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `run.json` → `noiteCurta.bairros`                                       | 1                     | Bairros da Noite curta (Enter no título)                             |
| `exploracao.json` → `campainha.pesosDoce`                               | doces 75, história 25 | O que sai pedindo doce (F)                                           |
| `exploracao.json` → `campainha.travessura.multDoces`                    | 2                     | Doces da travessura vencida (G), vezes os da campainha, mais um item |
| `controles.json` → `travessura`                                         | G                     | Tecla da travessura                                                  |
| `visual.json` → `combateNaTela.trato.raioCasa`                          | 8                     | A casa a até tantos tiles apaga as janelas ao aceitar o trato        |
| `visual.json` → `combateNaTela.trato.raioPostes`                        | 14                    | Raio dos postes que apagam nos preços de luz                         |
| `visual.json` → `combateNaTela.trato.postesRuaSemLuz`                   | 6                     | Postes que apagam na Rua Sem Luz (no Poste Apagado, 1)               |
| `visual.json` → `combateNaTela.trato.iconeLadoPx` / `sobePx` / `iconeS` | 56 / 70 / 2,4         | Ícone do preço subindo da casa                                       |

## Mundo vivo, passo 1: a Bruxinha com ritmo, efeito e som

Ponto de partida para o ajuste à mão no modo desenvolvedor (F1).

| Onde                                             | Antes              | Agora                         | Por quê                                       |
| ------------------------------------------------ | ------------------ | ----------------------------- | --------------------------------------------- |
| `campeoes.json` → Bruxinha, golpes por segundo   | 1                  | 2,2                           | Golpe a cada ~0,45 s, em combo de 3           |
| `campeoes.json` → Bruxinha, Energia por segundo  | 4                  | 10                            | Sem 25 s parada esperando Energia             |
| `combate.json` → `ataqueManual.lequeUltimo`      | —                  | 3 projéteis em 30°            | O 3º golpe de quem atira sai em leque (novo)  |
| `combate.json` → `ataqueManual.energiaPorAcerto` | —                  | 4                             | O golpe que acerta devolve Energia (novo)     |
| Vassoura Disparada: recarga                      | 6 s                | 3 s                           |                                               |
| Vassoura Disparada: `estouro`                    | —                  | raio 1,2; 40%; empurra 0,8    | Estoura no fim do voo ou no 1º inimigo (novo) |
| Poção Pegajosa: recarga / voo (`atraso`) / cor   | 12 s / 0 / laranja | 7 s / 0,35 s / roxa           | O frasco voa em arco antes de cair            |
| Salto de Vassoura: recarga                       | 14 a 10 s          | 6 a 4 s                       |                                               |
| Salto de Vassoura: `estouro` (pouso)             | —                  | raio 1,4; sem dano; empurra 1 | O pouso abre espaço (novo)                    |
| Chuva de Abóboras: recarga                       | 90 a 60 s          | 40 a 30 s                     |                                               |

Atravessar inimigos (Vassoura Pesada) e deixar rastro que machuca (Rastro de Faíscas) continuam
sendo das evoluções, para a escolha do posto 3 valer.

**Tela** (`visual.json` → `combateNaTela.feiticos`, geometria em `src/render/feiticos.ts`): o golpe
é uma estrela de 4 pontas girando com halo e rastro, e brilha onde acerta; a Vassoura voa de verdade
(cabo claro, amarração roxa, palha laranja) soltando folhas; o estouro solta faíscas em estrela e um
anel; a poção voa em arco com sombra e alvo marcado, quebra em cacos e a poça borbulha; o Salto solta
estrelas na decolagem e no caminho, e o pouso levanta poeira; cada abóbora da Chuva tem sombra que
cresce, cabinho verde, solta sementes e deixa o chão queimado por 3 s. `pausa.golpeFinal` (0,04 s),
`pausa.estouro` (0,05 s), `tremor.estouroPx` (2) e `tremor.rPx` (3 → 5).

**Som** (`audio.json`): sons próprios por campeão e feitiço, pelo nome `<campeão>_<evento>_<tecla>`
(sem o próprio, toca o timbre comum do campeão): `bruxinha_golpe` (um "plim" que sobe
`semitonsPorGolpe` = 2 a cada golpe do combo) e `bruxinha_golpeFinal`; `bruxinha_lancar_Q` (sopro) e
`bruxinha_estouro_Q`; `bruxinha_lancar_W` (arremesso, vidro quebrando e borbulhas); `bruxinha_lancar_E`
(decolagem) e `bruxinha_estouro_E` (pouso); `bruxinha_lancar_R` (sino grave) e `bruxinha_pulso_R`
(cada onda de abóboras).

## Janelas quentes e sem poças de luz

Pedido: "remova essas poças de luz e melhore essas luzes na casa, parecem leds fluorescentes".

| Onde                                    | Antes                     | Agora                                                                        |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `luz.json` → `janela.iluminaChao`       | (sempre)                  | `false`: a janela não joga feixe no chão (regra e tela)                      |
| `visual.json` → `janelasAcesas.cores`   | branco `#EEF1F6` em todas | 4 tons quentes e fracos, um por janela (fixo pela posição)                   |
| `visual.json` → `janelasAcesas`         | um painel inteiro         | vidraças: 2 colunas se larga (≥ 0,45 tile), travessa a 58%, caixilho de 2 px |
| `visual.json` → `luzNaTela.pocas.poste` | 20%                       | 8% (a luz do poste fica, sem o disco branco)                                 |
| `visual.json` → `luzNaTela.lampada`     | 55%                       | 35%                                                                          |

Sem o feixe das janelas, a luz que conta para a regra (cura, Lanterna, vigias) é a dos postes, da
lanterna e da abóbora das campainhas. Na fase 2 da Viúva, a praça fica toda escura.

## Mundo vivo, passo 2: objetos quebráveis (`exploracao.json` → `quebraveis`)

Os golpes e feitiços do jogador quebram objetos da rua, que soltam doces (a moeda do jogo).

| Objeto          | Coragem | Corpo (tiles) | Doces | Material |
| --------------- | ------: | ------------: | ----: | -------- |
| `lixeira`       |      30 |           0,3 | 2 a 4 | metal    |
| `caixa_correio` |      20 |          0,22 | 1 a 3 | metal    |
| `abobora_decor` |      15 |           0,3 | 2 a 5 | abóbora  |
| `floreira`      |      40 |          0,65 | 1 a 3 | madeira  |
| `cone`          |      12 |           0,2 | 0 a 2 | plástico |
| `cavalete`      |      25 |          0,62 | 1 a 3 | madeira  |

- Ao quebrar: 6% de sair uma pestinha escondida (`chanceSurpresa`), 8% de um consumível da
  campainha (`chanceItem`). Os doces seguem o multiplicador do Susto, como os dos inimigos.
- O corpo cobre a colisão do objeto (teste): a estrela e a vassoura acertam antes de bater nele.
- São entidades neutras: só os golpes do jogador acertam; não dão Susto, Energia, XP nem contam como
  inimigo derrotado; nada os empurra; o lugar fica livre para andar depois de quebrar.
- `raioBrilho` 4: a até 4 tiles do jogador, uma estrelinha amarela pisca acima do objeto.

**Tela** (`visual.json` → `combateNaTela.quebraveis`): o objeto treme 2 px por 50 ms a cada golpe e
solta 3 lascas; ao quebrar, some e 9 pedaços voam nas cores do material (`cores`), com um anel de
poeira. Sem número de dano. **Som** (`audio.json`): `bater_<material>` e `quebrar_<material>`.

## Mundo vivo, passo 3: inimigos em cerco e com reações (`inimigos.json` → `reacoes`)

| Campo                            | Valor                           | O que faz                                                                |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `cerco.especies`                 | pestinha_lencol                 | Quem entra no cerco                                                      |
| `cerco.raio` / `anel`            | 6 / 2,2 tiles                   | Perto do jogador, as que esperam ficam num anel de raio 2,2              |
| `cerco.vagas` / `atacantesMax`   | 8 / 3                           | Só 3 atacam ao mesmo tempo                                               |
| `cerco.pesoEspera`               | 0,6 por segundo                 | Quem espera mais ganha a vez                                             |
| `cerco.bonusAtacante` / `turnoS` | 2 / 3 s                         | Quem ataca segura a vez 3 s; depois cede aos poucos (rodízio sem tremer) |
| `cerco.giroPorS`                 | 0,35 rad/s                      | O anel gira devagar: as que esperam rodeiam                              |
| `interromperPreparo.recargaS`    | 0,5 s                           | Golpe do jogador no preparo de um inimigo pequeno corta o ataque         |
| `lanterna`                       | pestinha_lencol, medo 1,5 s     | O pulso da lanterna assusta os lençóis                                   |
| `aliadoCaiu`                     | raio 3, 0,3 s                   | Quem está perto de um aliado que cai hesita                              |
| `vidaBaixa`                      | arremessador, 25%, até 10 tiles | Foge para perto de um aliado (sem atirar)                                |

- `pestinha_lencol.autoAtaque.preparo`: 0,25 → 0,35 s (o aviso do golpe dá para ver).
- `jogador.json` → `rolamento.tontoS` 0,4: o rolamento atravessando um inimigo pequeno (os que
  recuam) deixa tonto (atordoado), uma vez por rolamento.
- Tela (`visual.json` → `animacao.preparoRecuo` 0,18 tile e `preparoTremor` 0,035): no preparo, o
  inimigo recua para longe do alvo e treme; estrelinhas no tonto e um brilho no preparo cortado.

## Mundo vivo, passo 4: armas do cenário (`exploracao.json` → `armas`)

| Arma              | Como se usa                                   | O que faz                                                                     | Números                                                 |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| Carro             | Qualquer golpe                                | Alarme: uma isca invisível no carro atrai os inimigos (como a Doce-isca)      | 6 s; recarga 15 s; corpo 1,15                           |
| Poste aceso       | Qualquer golpe                                | O fio cai: o chão em volta dá dano e lentidão nos inimigos                    | 5 s; raio 1,8; 20 a cada 0,5 s; 40% lento; recarga 20 s |
| Hidrante          | Quebrar (35 de Coragem)                       | Jato: empurra os inimigos para longe                                          | 4 s; raio 2,2; empurra 1,2 a cada 0,4 s                 |
| Abóbora gigante   | Quebrar (45 de Coragem)                       | Aviso laranja e explosão (inimigos e outros objetos; pode estourar a vizinha) | aviso 0,6 s; raio 2,5; dano 120                         |
| Portão do quintal | Só o golpe forte (último do combo) ou feitiço | Abre o beco do quintal (colisão e caminho dos inimigos liberados)             | 1 de Coragem                                            |

- O gerador põe um portão de madeira (cercas do grupo `portaoQuintal:N`) atravessando o beco de
  cada quintal, logo depois da boca (`RuaGerada.portoes`), e abóboras gigantes nas calçadas
  (`gerador.json` → `rota.chanceDeAboboraGigante` 0,2 por rua, com um sorteio à parte para o resto
  da rua não mudar). Modelo novo `abobora_gigante` (`src/render/modelosCidade.ts`).
- Golpe comum no portão: "Golpe final!" na tela, sem dano (`objetoAtingido.resistiu`).
- Sons novos: `alarme_carro`, `fio_caiu`, `faisca`, `jato`, `pavio` (aviso da abóbora) e
  `explosao` (também a da Abóbora-Canhão, que não tinha som).

## Mundo vivo, passo 5: espécies novas e inimigos encantados

**Morceguinho** (`inimigos.json`, comportamento `morcego`; ataque `mergulho_morcego` em
`habilidades.json`): Coragem 24, velocidade 3,6. Voa alto (`alturaPx` 46) numa órbita de 3,2 tiles em
volta do jogador; voando, nenhum golpe acerta (`marcas.voando`). A cada 2,8 s mergulha: aviso
vermelho no chão por 0,5 s e um dash de 6 tiles (dano 6); depois fica baixo 1,4 s (aí apanha) e sobe.
Chegam em **enxames** de 5 com as ondas (`ondas.json` → `enxame`: da 2ª onda em diante, chance de
35%, 50% e 65% por bairro).

**Saco-Surpresa** (comportamento `saco`): Coragem 70, mordida 7. Fica disfarçado de lixeira, sem
barra de vida; acorda com o jogador a 2 tiles ou com um golpe, morde por 3,5 s, foge 6 tiles e se
disfarça de novo. Cada rua troca de 1 a 3 lixeiras (longe da entrada) por sacos (`sacosPorRua`).

**Inimigos encantados** (`inimigos.json` → `encantos`): 8,3% dos comuns (pestinha, arremessador,
abóbora-canhão, saco e morceguinho) nascem com um traço, com anel no chão, barra contornada e o nome
na cor do encanto (`visual.json` → `combateNaTela.encantos`):

| Encanto     | Efeito                                                                    | Cor     |
| ----------- | ------------------------------------------------------------------------- | ------- |
| Apressado   | +40% de velocidade                                                        | verde   |
| Encouraçado | O escudo aguenta 3 golpes inteiros (o nome mostra quantos faltam)         | branco  |
| Explosivo   | Ao cair, aviso vermelho de 0,6 s e estouro de raio 1,8 (dano 25)          | laranja |
| Chamador    | Ao ver o jogador (6 tiles), chama 2 lençóis, uma vez (eles nascem comuns) | roxo    |

Sons novos: `surpresa` (o saco acorda) e `escudo`.

## Mundo vivo, passo 6: arena do Síndico (pátio do condomínio)

`gerador.json` → `arena.patio.sindico_zeloso`: pátio de 20 × 16 (era a praça de 15 × 15), guarita a
(−6,5; 3,6) do centro (cobertura contra a Multa), 3 canteiros e cancelas listradas nos dois portões
(a de saída sobe quando o chefe cai). Modelos novos desenhados por código: `guarita`, `canteiro` e
`cancela`.

**Regulamento** (`inimigos.json` → `sindico_zeloso.param`): enquanto houver canteiro de pé, o Síndico
leva 50% menos dano (`protecao`; contorno roxo na barra). Cada canteiro quebrado (`exploracao.json` →
`quebraveis.modelos.canteiro`: Coragem 60, 4 a 8 doces, `efeito: canteiro`) tira a proteção por 4 s
(`desprotegidoS`) e atordoa o Síndico 0,8 s (`atordoaCanteiroS`; nos chefes vira lentidão), com o
grito "Meu canteiro!". Sem canteiros, a proteção acaba.

**Entrada do chefe** (`visual.json` → `camera.entradaDoChefe`): o nome do chefe em letras grandes
por 2,6 s e a câmera olhando para ele 1,6 s antes de voltar ao jogador.

## Mundo vivo, passo 7: atalho escuro e fins de beco (`gerador.json` → `rota`, `exploracao.json` → `fins`)

**Atalho escuro** (`rota.atalho`): ligado (`ativo`), só entre nós a pelo menos 4 nós de distância
pela rota (`ganhoMinimo`), com 3 lixeiras (`lixeiras`) e um baú sorteado como os dos quintais. Sem
postes: a rua iluminada é o caminho longo.

**Fins de beco** (peso 1 cada em `rota.tiposDeRamo`; meia-largura da sala em `rota.salas`):

| Fim               | Sala | Regra                                                                                                        |
| ----------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| Poço dos Desejos  | 5    | F perto (raio 1,6) troca 30 doces (`poco.preco`) por um consumível da campainha, uma vez                     |
| Quintal das Velas | 6    | F acende; a 1ª começa 8 s (`tempoS`) e chama 3 pestinhas; inimigo a 0,7 apaga; as 3 acesas: 40 doces e 60 XP |
| Casa Assombrada   | 7    | Entrar chama ondas de 3 e 4 pestinhas (`ondas`); vencidas, um baú de 50 doces                                |

## Mundo vivo, passo 8: movimento com peso (`jogador.json` → `aceleracao`, `visual.json` → `animacao`)

| Número                     | Valor     | O que faz                                                        |
| -------------------------- | --------- | ---------------------------------------------------------------- |
| `aceleracao.arranqueS`     | 0,08 s    | Do parado à velocidade cheia (o 1º tick já anda ~21%)            |
| `aceleracao.freioS`        | 0,06 s    | Da velocidade cheia ao parado (escorrega ~0,1 tile)              |
| `animacao.direcoesMalha`   | 16        | Desenhos por volta das malhas (4 rotações e as guinadas do meio) |
| `animacao.giroGrausPorS`   | 900       | Rapidez para virar o corpo (90° em 0,1 s)                        |
| `animacao.golpeMs`         | 280 ms    | Golpe inteiro: esticada (30%, `golpeFracaoEstica`) e acomodação  |
| `animacao.golpeEscala`     | 0,16      | Quanto estica no golpe                                           |
| `animacao.golpeInclina`    | 0,14 rad  | Inclinação para a frente no golpe                                |
| `animacao.atingidoMs`      | 200 ms    | Reação a um golpe levado                                         |
| `animacao.atingidoAchata`  | 0,1       | Quanto achata ao levar golpe                                     |
| `animacao.atingidoInclina` | 0,12 rad  | Inclinação para longe de quem bateu                              |
| `animacao.tontoInclina`    | 0,12 rad  | Balanço do tonto, `tontoPorS` 2,4 vezes por segundo              |
| `animacao.balancoParado`   | 0,014 rad | Balanço leve parado, no ritmo da respiração                      |
| `malhas.degrausDoPasso`    | 3         | Posições das pernas de cada lado do passo (eram 2)               |
| `malhas.posesPorQuadro`    | 3         | Desenhos novos assados por quadro (poses e guinadas)             |

## Mundo vivo, passo 9: Encruzilhada e passagem (`gerador.json` → `rota.encruzilhada`, `visual.json` → `interface.passagem`)

| Número                      | Valor   | O que faz                                                |
| --------------------------- | ------- | -------------------------------------------------------- |
| `encruzilhada.margemNorte`  | 14      | Faixa ao norte da grade, onde ficam os ramais            |
| `encruzilhada.espaco`       | 13      | Tiles entre os ramais (um quarteirão no meio)            |
| `encruzilhada.pista`        | 4,4     | Pista de cada ramal (calçada de 1 de cada lado)          |
| `encruzilhada.recuoPortao`  | 4,5     | Do alto da rua de ligação até o portão do ramal          |
| `encruzilhada.alemDoPortao` | 1,5     | Depois do portão, a saída do ramal (vence a rua)         |
| `passagem.andarMs`          | 1500 ms | Ela segue andando sozinha depois de vencer               |
| `passagem.fecharMs`         | 1000 ms | O círculo fecha nos últimos 1000 ms                      |
| `passagem.abrirMs`          | 750 ms  | No mapa novo, o círculo abre                             |
| `passagem.entrarMs`         | 800 ms  | No mapa novo, ela entra andando antes do controle voltar |

## Mundo vivo, passo 10: interface (`visual.json` → `tela`)

| Número            | Valor | O que faz                                                           |
| ----------------- | ----- | ------------------------------------------------------------------- |
| `tela.altura`     | 720   | Altura lógica (fixa); a largura segue a proporção da janela         |
| `tela.larguraMin` | 960   | Largura lógica mínima (janelas mais estreitas que 4:3 ganham borda) |
| `tela.larguraMax` | 1720  | Largura lógica máxima (mais larga que ~21:9 ganha borda)            |

Na interface (constantes do código): 3 avisos na fila do canto, apagando nos últimos 400 ms; texto
das placas das casas a até 7 tiles e dos portões a até 13.

Menu de pausa (`dicas.json` → `pausa`): `susto` são as linhas da explicação (as faixas e o Frenesi
vêm do `susto.json`, com os números de agora) e `controles` são as linhas de tecla e ação que não
saem do `controles.json`.

## Mundo vivo, passo 11: áudio gravado (`audio.json` → `arquivos` e `musica.gravada`)

`arquivos.sons.<som>`: `arquivos` (nomes em `public/audio/efeitos`, sem extensão), `volume`, `tom`
(semitons de base) e `variacaoTom` (± semitons por toque). Exemplos: acerto 5 socos médios (0,55,
±1,5), crítico 5 batidas de chapa pesada (0,7), Poste caindo 5 metais pesados 4 semitons abaixo,
doce 2 moedas, Chuva de Abóboras o sino grave 5 semitons abaixo.

`musica.gravada`: volume 0,55, troca de faixa em 1,5 s; trilhas `titulo` (FLAC), `rua` e `chefe`;
`combate` entra por cima da rua (a rua baixa até 15%); vinhetas `vitoria` e `derrota`, com a
música a 25% enquanto tocam. As trilhas e a camada de combate tocam em streaming (`<audio>` ligado
ao mixer, O4.1); as vinhetas e os efeitos, curtos, são decodificados uma vez e guardados.

## Mundo vivo, passo 12: vida no cenário (`visual.json` → `vida`)

| Grupo      | Números                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `fumaca`   | um fiapo a cada 0,45 s por chaminé, vive 3,2 s, sobe 46 px, alfa 0,5, até 10 chaminés   |
| `folhas`   | 14 folhas de 4 px, vento ×0,9                                                           |
| `morcegos` | bando de 3 a 6 a cada 16 a 30 s, 5 s cruzando a tela                                    |
| `criancas` | até 3, uma a cada 7 s, 1,1 tile/s; fogem a 3,2 tiles/s por 1,4 s com luta a até 8 tiles |
| `gatos`    | até 2; pulam com o jogador a 3,5 tiles (salto de 0,5 s) e fogem por 1,6 s               |
| `janelas`  | uma casa da cidade de fundo acende ou apaga a cada 6 s                                  |

## Mundo vivo, passo 13: arenas dos chefes, Espantalho e Pestinha de Vela

**Viúva** (`gerador.json` → `arena.patio.viuva_do_mirante`, `inimigos.json` → Viúva → `param`):
jardim de 18 × 18 com o patamar de pedra diante do mirante e 4 velas no chão. F acende; cada vela
acesa é uma luz (não cura) que as Sombras não atravessam. A noite (fase 2) apaga todas; na fase 3
só uma fica acesa por vez.

**Dono** (`arena.patio.dono_do_bairro`: a rua diante da casa, 24 × 14; `inimigos.json` → Dono →
`param`): cada tijolo da chaminé que cai vira uma **pilha de tijolos** no chão (modelo
`pilha_tijolos`), cobertura que para o feixe e qualquer golpe inimigo em linha. Quebra em
`coberturaGolpes` 3 golpes, forte ou fraco (cada um tira 1); no máximo `coberturasMax` 6, raio
`coberturaRaio` 0,45. A cada andar, um poste da rua apaga.

**Moradora** (`arena.patio.moradora_do_13`: corredor de 26 × 10 com 4 espelhos quebráveis,
`exploracao.json` → `quebraveis.modelos.espelho`: Coragem 150, vidro). Enquanto houver espelho
inteiro, ela **repete na hora a habilidade que o jogador acabou de usar** (mesmo em recarga, sempre
anunciada) e, no Reflexo partido (abaixo de 50%), recarrega mais rápido (`fatorRecargaFase2` 0,7).
Cada espelho quebrado a atordoa (`atordoaEspelhoS` 0,8; nos chefes vira lentidão); o último acaba
com a cópia e com as recargas curtas.

**Espantalho de Quintal** (`inimigos.json` → `espantalho`, ataque `palha_espantalho`):

| Coragem | Velocidade  | Ataque                                                                                                            | Troca                                                                      |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 110     | 0 (fincado) | Palha em linha, aviso de 0,5 s, 6 tiles a 5 tiles/s: 7 de dano e 35% lento por 1,5 s; recarga 2,6 s; vê a 7 tiles | Ao apanhar, troca de lugar com outro espantalho a até 14 tiles; espera 3 s |

Nasce em par (`ondas.json` → `espantalhos`: `n` 2) num quintal da rua, com chance de 50%, 60% e 70%
por bairro. Não recua.

**Pestinha de Vela** (`inimigos.json` → `pestinha_vela`): Coragem 45, velocidade 2,4; não ataca.
Fica atrás do grupo, a 4,5 tiles do jogador, com uma luz própria (raio 1,6). Os inimigos a até 3
tiles dela ficam iluminados e causam 30% mais dano (`raioAura`, `danoAura`). Vem com a onda
(`ondas.json` → `vela`: da 2ª onda em diante, chance de 30%, 45% e 60% por bairro).

Modelos novos desenhados por código: `espantalho`, `pestinha_vela` (`src/render/modelos.ts`) e
`pilha_tijolos` (`src/render/modelosCidade.ts`).

## Controle (`controles.json` → `controle`)

| Campo                                     | Valor      | O que faz                                                               |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `menus.limiarAnalogico`                   | 0,5        | Quanto inclinar o analógico para mover o foco nos menus                 |
| `menus.repeticaoInicialS` / `repeticaoS`  | 0,4 / 0,15 | Segurar uma direção repete depois de 0,4 s, a cada 0,15 s               |
| `miraAFrente`                             | 4          | Sem o analógico direito, a mira fica 4 tiles à frente (com assistência) |
| `miraAutomatica.graus` / `grausAnalogico` | 70° / 35°  | Áreas, alvos e cones: o cone onde a mira automática procura inimigos    |
| `miraAutomatica.qualquerLadoAte`          | 6          | Sem ninguém no cone, o inimigo mais perto de qualquer lado até 6 tiles  |
| `miraAutomatica.semAlvoTiles`             | 3,5        | Sem inimigo ao alcance, a área cai 3,5 tiles à frente (não no fim)      |

- Mira automática (pedido de 18/10, `miraAutomatica` em `src/sim/assistencia.ts`): no controle, a
  área vai para o ponto que pega mais inimigos dentro do raio dela (o do mais perto, no empate),
  entre os que estão ao alcance e no cone de onde a personagem anda ou olha (35° quando o analógico
  direito aponta, que é mira de propósito). Linhas e o salto seguem com a assistência de 10°.

Botões: analógico esquerdo anda; RT golpeia (segurar repete); X, Y, B e LT são as habilidades
(lançam ao soltar; LB + botão sobe o posto); A rola; L3 é a lanterna; RB interage (doce na
campainha); direcional para cima pede travessura, para os lados usa os consumíveis; Back segura o
mapa; Start pausa. Nos menus: direcional ou analógico movem o foco, A aperta, B e Start voltam,
LB e RB trocam de carta ou aba.

## Pedido de 17/10: iluminação, sons e menus

**Iluminação (`visual.json`)**

| Campo                          | Valor                                       | O que faz                                               |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| `paleta.fundo`                 | `#0B1424`                                   | Céu da noite fora do mapa                               |
| `paleta` (chão, faces, piso)   | cinzas azulados                             | A cidade na cor da referência                           |
| `luzNaTela.escuridao`          | `#071226`, 0,78                             | Escuridão azul-marinho                                  |
| `luzNaTela.tintNoEscuro`       | `#5F6E98`                                   | Objetos fora da luz, tingidos de azul                   |
| `luzNaTela.pocas.poste`        | `#C7D9FF`, 0,2                              | Poça fria embaixo dos postes                            |
| `luzNaTela.cone`               | `#C7D9FF`, 0,22, topo 0,35, base 2,6 tiles  | Cone de luz da lâmpada até o chão, por cima dos objetos |
| `luzNaTela.atmosfera`          | névoa `#3A5C86` 0,08; bordas `#030812` 0,65 | Névoa em toda a tela e bordas escuras                   |
| `luzNaTela.neblina`            | `#1A2740`, 0,94, transição 3 tiles          | Véu da condição Neblina em volta do jogador, em degradê |
| `luzNaTela.sombras.dosObjetos` | `true`                                      | Os objetos recortam a poça com a sombra deles           |
| `luzNaTela.brilhoProprio`      | Moradora e os 4 campeões; luz mínima 0,8    | Quem joga não some no escuro                            |
| `janelasAcesas.cores`          | âmbar, amarelo, ciano e branco frio         | Cada janela com um tom, fixo pela posição               |
| `janelasAcesas.fracaoApagadas` | 0,5                                         | Metade das janelas apagada                              |

**Sons (`audio.json`)**

- Camadas de síntese: `filtroTipo` (baixa, alta, banda), `ressonancia`, `freqFim` também no
  ruído, `ataqueS` e `repetir` (grãos). Arquivos: `atrasoS` e `comSintese` (tocam com a síntese).
- Sons novos: `bruxinha_*` (golpe, Vassoura, Poção com vidro e bolhas, Salto, Chuva),
  `lancar_fantasma`, `lancar_esqueleto`, `lancar_vampirinho`, `golpe`, `golpeFinal`, `doce`,
  `compra`, `trato`, `campainha`, `lanterna`, `bauAberto`, `bauRaro`, `bauAmaldicoado`, `segredo`,
  `surpresa`, `derrotado`, `interrompeu`, `onda`, `faseChefe`, `grito`, `recusado` e os avisos
  `aviso_area`, `aviso_linha`, `aviso_investida`, `aviso_golpe`, `aviso_chefe`.
- `musica.gravada.mixagem`: ganhos por trilha (título 1,3), camada de combate ×3,7 (a faixa é
  10 dB mais baixa) e a rua a 35% na luta.

**Menus (`visual.json` → `interface.tema`)**: painel `#0D1424`, placa clara `#172238`, borda
`#2C3F63`, filete `#A9BFE6`, sombra `#02050C`, cartão `#121C30` e cartão com foco `#1C2A44`.

**Controle (`controles.json`)**: os rótulos da tela trocam com o dispositivo em uso
(`src/game/dispositivo.ts`); o mapa dos botões aparece por 9 s na primeira vez.

## Inteligência dos inimigos (`inimigos.json`)

**Táticas (`reacoes.taticas`)**

| Campo       | Valor                                                                                      | O que faz                                              |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `separacao` | raio 1,15, peso 1,2                                                                        | Quem anda se afasta dos aliados colados                |
| `flanco`    | lençol, guarda e abóbora; de 8 a 2,4 tiles; peso 0,85                                      | Cada um curva para um lado (pelo id) e chega espalhado |
| `esquiva`   | lençol 0,2, arremessador 0,45, vela 0,5, guarda 0,25, síndico 0,3; 1,2 tile; recarga 2,5 s | Pulo de lado do projétil que chega em até 0,45 s       |
| `areas`     | lençol, arremessador, vela e abóbora; 2 pulsos ou mais                                     | Sai das áreas do jogador que ainda vão pulsar          |

**Cerco (`reacoes.cerco`)**: `encostar` 0,95 (cada atacante encosta pelo seu lado),
`contornarAte` 3,2 e `raioDeContorno` 1,7 (contorna o jogador até o lado dele).

**Parâmetros novos por inimigo (`param`)**

| Inimigo          | Campos                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Arremessador     | `antecipacao` 0,7; `trocaLadoS` 1,8; `lentidaoDeLado` 0,35                                                                        |
| Abóbora-Canhão   | `rolarDesde` 3; `rolarAte` 6; `antecipacao` 0,6; ataque `rolada_abobora`                                                          |
| Pestinha de Vela | `fugaDe` 2,6; `bonusFuga` 0,35                                                                                                    |
| Espantalho       | `antecipacao` 0,5                                                                                                                 |
| Poste Corrompido | `visaoNaSombra` 2,4; `alertaS` 6; `raioPulso` 2,2; `antecipacao` 0,8; `limiarAjuda` 0,5; `pestinhasAjuda` 2; ataque `pulso_poste` |
| Cão, Cobrador    | `antecipacao` 0,6 e 0,5                                                                                                           |
| Síndico          | `antecipacao` 0,6; `trocaLadoS` 2,5; `atrasDosGuardas` 1,3                                                                        |
| Viúva            | `antecipacao` 0,5; `raioDoCerco` 1,4; `atrasDoJogador` 1,6                                                                        |
| Dono do Bairro   | `antecipacao` 1                                                                                                                   |
| Moradora do 13   | `antecipacao` 0,5; `trocaLadoS` 2,2                                                                                               |

**Ataques novos (`habilidades.json`)**: `pulso_poste` (área de 2,2 em volta do Poste, aviso 0,7 s,
16 de dano e empurra 1,6) e `rolada_abobora` (rola 4 tiles, aviso 0,6 s, 10 de dano).

## Movimento da interface (`visual.json` → `interface.animacao`)

| Campo                          | Valor                                                  | O que faz                                            |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| `entradaMs`, `zoomEntrada`     | 320 ms, 1,04                                           | Telas por cima do jogo entram assentando             |
| `saidaMs`                      | 260 ms                                                 | Escurecer ao sair do título para o Álbum e o Diário  |
| `deslizePx`, `escalonamentoMs` | 16 px, 45 ms (até 420 ms)                              | Botões chegam deslizando, um depois do outro         |
| `mesmaLevaMs`                  | 120 ms                                                 | Botões criados juntos entram na mesma fila           |
| `focoMs`, `pulsoFocoMs`        | 150 ms, 700 ms                                         | Halo do foco acendendo e pulsando                    |
| `pulaMs`                       | 180 ms                                                 | Pulinho de escala (botão apertado, número que mudou) |
| `letraMs`                      | 55 ms                                                  | Intervalo entre as letras do logo                    |
| `brilhoMs`, `brilhoPausaMs`    | 900 ms, 3,2 s                                          | Brilho que corre pela faixa de cima das molduras     |
| `contagemMs`                   | 900 ms                                                 | Números contando (fim da run, Doces Guardados)       |
| `fecharMs`, `abrirMs`          | 520 ms, 600 ms                                         | Círculo que fecha no título e a rua clareando        |
| `fundo`                        | céu, lua, telhados, 46 partículas, morcegos a cada 9 s | Fundo vivo do Álbum e do Diário                      |

**Som novo (`audio.json`)**: `foco`, um tique curto ao mudar o foco nos menus.

## Acervo de inimigos v7 — arquivos para avaliação

Em `Design Codex/Elenco v7/`, Morceguinho, Saco-Surpresa, Espantalho de Quintal e Pestinha de Vela
receberam designs de frente, costas, lados, topo e base, seguidos de modelos Blender/GLB. O Dono
foi detalhado com fundação, molduras, montantes, varanda, escada lateral, calhas, chaminé aberta e
rosto desperto. Cada arquivo tem sete vistas renderizadas e materiais sem texturas externas.

A Casa Perseguidora usa a geometria real de `casaTerrea` (`src/render/modelos.ts`) em escala 1:
3,12 × 3,98 tiles, altura original de 93,6 px. A animação de 4 s mantém os volumes da casa e eleva
sua fundação em 0,72 tile, revelando quatro apoios e acendendo o olhar vermelho. O GLB contém um
clipe de animação de objetos; a cena Blender tem quadros 1–96 a 24 quadros/s. Uma cópia da casa
normal acompanha a entrega para comparação exata.

São seis inimigos, oito arquivos de cada formato contando as variantes, cinco folhas de design,
56 vistas, quatro estados adicionais da casa, GIF e galeria local. A pedido do usuário, os novos
arquivos ficam para avaliação: `content/`, a lista de malhas em uso e o comportamento do jogo
continuam independentes desta entrega. Veja `LEIA-ME.md` e os relatórios em `revisao/` no acervo.

## Elenco v7 no jogo (pedido de 17/10)

As malhas do Elenco v7 entraram no jogo pelo conversor (`scripts/converter-glb.py`, que agora lê
outras pastas do Design Codex e escolhe o quadro da animação) e substituem os modelos por código:

| Malha (`visual.json` → `malhas.alturaPx`)      | Altura (px)          | Triângulos    |
| ---------------------------------------------- | -------------------- | ------------- |
| Morceguinho / Saco-Surpresa                    | 22 / 26              | 1.092 / 1.212 |
| Espantalho / Pestinha de Vela                  | 50 / 28              | 2.374 / 1.518 |
| Dono do Bairro / desperto (o rosto do andar 3) | 216,7 / 216,7        | 5.739 / 5.823 |
| Casa Perseguidora (quadros q1 a q4 e o final)  | 93,6 a 123,4 / 121,8 | 1.496 cada    |

- A Casa Perseguidora é a casa térrea do mapa em escala 1 (39,19 px por unidade do GLB, a mesma
  conversão da entrega). As alturas dos quadros seguem a de cada um, para a escala não mudar.
- `malhas.transformacoes.casa_perseguidora`: os 5 quadros da transformação (quadros 1, 24, 48, 72
  e 96 da animação de 4 s), mostrados em partes iguais de `inimigos.json` → `param.transformacaoS`
  (1,6 s). Na volta (a Casa Desperta deitando), na ordem contrária.
- A elite sai de uma casa térrea da rota: a mais perto da praça a até `loteAteTiles` (14) e a pelo
  menos `loteLongeDoJogador` (8) do jogador, sem campainha. A casa some do lote (colisão, luzes das
  janelas e desenho), o inimigo nasce no meio do lote olhando para a rua, levanta parado e sai pela
  porta. Sem casa que sirva, nasce na praça e levanta lá.
- O corpo cresceu com o desenho: raio 1,5 (era 0,85); o Pisão passou de raio 2 para 2,6 e o alcance
  em que ela pisa (`alcancePisao`) de 1,9 para 2,2.

## Jogáveis e chefes com os modelos do Codex, braços e pernas animados (pedido de 17/10)

Todo personagem que anda agora vem de um GLB do Design Codex. Os que faltavam saíram do pacote v6
(`Design Codex/Avaliacao de Modelagem v6/modelos/glb`) e substituem os modelos por código:

| Malha (`visual.json` → `malhas.alturaPx`) | Altura (px)       | Triângulos                  |
| ----------------------------------------- | ----------------- | --------------------------- |
| Fantasma / Esqueleto / Vampirinho         | 44 / 46 / 50      | 338 / 2.002 / 1.120         |
| Morador Ofendido                          | 38                | 3.092                       |
| Viúva do Mirante / Sombra da Viúva        | 58 / 16           | 992 / 420                   |
| Moradora do 13 (reflexo de cada fantasia) | 46 / 44 / 46 / 50 | 5.000 / 338 / 2.002 / 1.120 |

- Os jogáveis ficaram do tamanho da Bruxinha (46 px com o chapéu); a Viúva manteve os 58 px do
  modelo antigo. O Morador Ofendido deixou de usar o desenho do Vizinho Curioso e a Sombra da Viúva o
  da Sombra Rasteira.
- A Moradora do 13 usa `moradora_13_<fantasia do jogador>` (o reflexo pronto do Codex). O giro de
  matiz de `inimigos.json` (`param.matiz`) só vale para uma fantasia sem reflexo.
- **Peças:** o conversor guarda a peça de cada triângulo (`pecas` e `pecaDe` no JSON da malha). Uma
  região do esqueleto pode ser `{ "pecas": [...], "lado": "E" | "D", "x": "frente" | "tras" }`, e o
  pivô pode ser `{ "topoDe": [...], "lado": ... }` (o meio do topo das peças, como o ombro em cima
  da manga). `plano: "lado"` gira para cima e para baixo (as asas).
- `malhas.esqueletoIgual`: as malhas de corpo igual a outra (os reflexos da Moradora) usam o
  esqueleto dela.

| Esqueleto (`malhas.esqueletos`) | Partes (passo / golpe, graus)                                            |
| ------------------------------- | ------------------------------------------------------------------------ |
| Fantasma                        | abas do lençol −16 e 16 / 55 e 15                                        |
| Esqueleto                       | braços −24 e 24 / 60 e 20; pernas 28 e −28                               |
| Vampirinho                      | braços −22 e 22 / 60 e 20; pernas 26 e −26                               |
| Morador Ofendido                | braços −20 e 20 / 55 e 25; pernas 24 e −24                               |
| Viúva do Mirante                | braços com as garras −10 e 10 / 50 e 35                                  |
| Sombra da Viúva                 | braços rasteiros −8 e 8 / 30                                             |
| Pestinha de Vela                | os dois braços com a vela 5 / 25; pernas 24 e −24                        |
| Morceguinho                     | asas de lado 30 e −30 / 40 e −40 (sobem juntas); patinhas 20 e −20       |
| Espantalho                      | braços da cruz de lado 12 e −12 / 25 e −25                               |
| Saco-Surpresa                   | tampa 4 / 35 (abre no golpe); patas da frente 22 e −22, de trás −22 e 22 |

## Ondas nos pontos da rua (`ondas.json` → `modo: "pontos"`, pedido de 18/10)

As ondas deixaram de vir a cada 25 s. Agora os **pontos** são os bueiros da rota, um a cada
`aCada` (2) na ordem do caminho (os bueiros ficam a cada ~24 tiles, então um grupo a cada ~48),
nenhum a menos de `longeDaEntrada` (10 tiles) da entrada. Cada ponto solta o grupo dele (o mesmo
tamanho, `porBairro`, e a mesma mistura, `composicao`) **uma vez**, quando o jogador passa a até
`raioGatilho` (13 tiles). Parado, nada nasce dos bueiros: o jogador decide quando avançar.

- Rodada de 18/10 ("inimigos longe demais"): antes eram só 6 pontos, a 70–100 tiles um do outro e
  o primeiro a ~70 tiles da entrada, com raio de 9. Agora são ~10 por rua, o primeiro a ~50.
- **Morceguinhos** continuam por tempo, como antes: a cada `intervalo` (25 s, desde `primeiraEm`)
  a rua sorteia um enxame (`enxame`, a partir do `desdeOnda`-ésimo sorteio, com a chance do
  bairro), que sai do bueiro perto do jogador (`bueirosDaOnda`), mesmo com ele parado.
- A Pestinha de Vela segue com a chance de antes, contando os pontos que já acordaram.
- Ondas Famintas (preço) e o nível de Lua Cheia de "ondas a cada 20 s" fazem os bueiros acordarem
  de mais longe, na proporção do intervalo: 13 × 25/20 ≈ 16 tiles (e o enxame, a cada 20 s). A
  Festa no Quarteirão e a pestinha a mais da Lua Cheia somam pestinhas a cada bueiro.
- O rastreador mostra "Bueiros 2/10 · acordam quando você chega perto".
- `modo: "tempo"` volta às ondas por relógio (os testes antigos rodam nele).

## Ataque básico de cada campeão de perto (`campeoes.json` → `autoAtaque.combo`)

A Bruxinha atira (e fecha o combo em leque). Os outros três têm combo próprio:

| Campeão    | Golpes | Golpe comum                         | Golpe final                                                                       |
| ---------- | ------ | ----------------------------------- | --------------------------------------------------------------------------------- |
| Fantasma   | 3      | arco de 60°, +0,7 tile, 1,7/s       | **Passagem**: atravessa 2,2 tiles (faixa de 1 tile) e acerta todos, ×1,6          |
| Esqueleto  | 3      | arco de 150°, +0,2 tile, 0,9/s      | **Pancada no chão**: todos a até 2 tiles em volta, empurra 1 tile para fora, ×1,5 |
| Vampirinho | 4      | arco de 90°, +0,3 tile, 1,5/s, ×0,8 | **Puxão**: o arco, e puxa quem acertou até 1,2 tile para perto; cura 25%, ×1,3    |

- A janela do combo (`combate.ataqueManual.janelaComboS`, 0,9 s) conta depois da recarga do golpe;
  antes, o Esqueleto (1,1 s entre golpes) nunca chegava ao golpe final.

## Campainha com minijogo (`exploracao.json` → `campainha.minijogo`, pedido de 18/10)

Toda casa com a luz de interação abre um minijogo (os quatro da Casa Desconfiada, sorteado pela
semente da casa). Inimigo a até `desconfiada.raioRecusa` tiles: a porta não abre.

| Campo             | Valor | O que faz                                                                |
| ----------------- | ----- | ------------------------------------------------------------------------ |
| `nivelDoce`       | 0     | F (doce): o minijogo no nível do bairro 1 (índice das listas por bairro) |
| `folgaDoce`       | 1,3   | F: janelas e tempos 30% maiores (fácil)                                  |
| `nivelTravessura` | 2     | G (travessura): sempre no nível do bairro 3 (difícil)                    |
| `multPerfeito`    | 1,5   | F perfeito: doces garantidos (12 a 26) vezes 1,5                         |
| `textoFechada`    | —     | F errado: "ninguém abriu a porta" (sem doces; a casa não acorda)         |

- F acertando (sem perfeito): o sorteio de sempre (`pesosDoce`: doces, item ou história).
- G acertando: o prêmio da travessura vencida na hora (item e doces × `travessura.multDoces`), sem
  briga. G errando: as pestinhas saem da porta, como antes, e vencidas pagam o mesmo prêmio.
- A janela mostra "CAMPAINHA · DOCE (FÁCIL)" ou "CAMPAINHA · TRAVESSURA (DIFÍCIL)".

`gerador.json` → `exploracao.casasPorRua` (4; era 2 até 18/10): toda rua com nome da rota (os
trechos retos do mapa) tem pelo menos 4 portas com interação (campainhas ou Casas Desconfiadas).
As que faltam viram campainhas, primeiro casas da própria rua (porta a até 1,5 tile da faixa
dela), depois da esquina (até 5 tiles) e, se ainda faltar (a rua curta entre dois largos), as
casas que dão para o largo, menos o do 1º Poste, que é arena. A avenida da entrada e os ramais da
Encruzilhada não têm lotes e ficam de fora. Com isso os mapas têm ~26 campainhas (antes ~16); em
36 mapas medidos (3 bairros, 12 sementes), 302 das 303 ruas da rota ficam com 4 ou mais (a outra
só tem 3 lotes) e nenhuma fica sem porta.

## Casa Desconfiada (C1)

Plano em `docs/PLANO_CASA_DESCONFIADA.md`. F bate na porta de uma casa com aldrava e janelas
apagadas; a rua para e abre um minijogo (`src/sim/minijogos.ts`, tela em `CenaDesafio`).

`gerador.json` → `exploracao.desconfiadas`: `porBairro` [3, 4] / [3, 5] / [4, 6] (já desde a
primeira rua; pedido de 18/10), nos lotes de
`casa_terrea`, `geminado`, `geminadas` e `casa_grande` (os maiores viram casa térrea alinhada pela
fachada, para a casa que acorda ser a do Elenco v7), a 7 tiles umas das outras e 8 da saída. O
sorteio usa um gerador derivado do da rua sem gastar dele: as ruas de antes continuam iguais.

`exploracao.json` → `desconfiada`:

| Campo                                   | Valor                     | O que faz                                                       |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `raioRecusa`                            | 5                         | Inimigo de pé a até 5 tiles: a porta não abre                   |
| `premios` perfeito / acerto / derrotada | 45 / 30 / 70              | Doces do bairro 1 (com o Susto, sem o Frenesi)                  |
| `multPorBairro`                         | 1 / 1,3 / 1,6             | Os prêmios em cada bairro                                       |
| `chanceConsumivelPerfeito`              | 0,3                       | Perfeito: um consumível da campainha                            |
| `chanceItemDerrotada`                   | 0,25                      | Casa Desperta derrotada: um item comum                          |
| `folga`                                 | 1,5                       | "Minijogos com folga" (título, F): janelas e tempos maiores     |
| `toque` toques / janelaS                | 3-4-5 / 0,28-0,24-0,2 s   | Ritmo de 0,45 a 0,85 s; espera e pausa 0,8 s; prazo ritmo + 3 s |
| `olho` setas / mostrarS                 | 3-4-5 / 2,0-2,3-2,6 s     | 5 s para digitar; perfeito até 0,55 s por seta                  |
| `fresta` vão / velocidade               | 26-20-16% / 0,65-0,8-0,95 | Perfeito no terço do meio do vão; 5 s                           |
| `quem` tempoS                           | 2,6 / 2,2 / 1,8 s         | 3 silhuetas depois de 0,8 s de porta abrindo; perfeito nos 40%  |

- Com 3 a 6 casas por rua, os prêmios caíram (70/45/90 → 45/30/70) para os doces da Casa
  Desconfiada continuarem perto da meta dos bots (8% a 15% da run). Os tempos subiram cerca de 60%;
  `bots.json` → `minijogo.atrasoOlhoS` 0,8 e `atrasoQuemS` 1,3 seguram a taxa de perfeitos.
- `inimigos.json` → `casa_perseguidora` e `casa_desperta`: `saidaPresaS` 0,5. A casa que levanta
  e não chega mais perto da calçada nesse tempo (um portão, uma lixeira) larga a saída e segue.

- O primeiro erro da run é perdoado (a casa só apaga a luz). Depois, errar acorda a casa:
  `inimigos.json` → `casa_desperta` (450 de Coragem, o Pisão da Casa Perseguidora, levanta em
  1,6 s, desiste e volta ao lote se o jogador ficar 12 tiles longe por 8 s). Ela não dá doces pela
  tabela do inimigo: derrotada, solta `premios.derrotada` × o bairro.
- Doces por fonte: as regras da rua contam os doces soltos por fonte (`docesPorFonte`), e o
  relatório dos bots mostra a tabela e duas metas novas (doces da Casa Desconfiada entre 8% e 15%
  da run e 60% a 80% dos minijogos vencidos, bot médio).
- `bots.json`: `bateNasCasas` e `acertoMinijogo` por perfil (iniciante não bate; médio 0,7;
  experiente 0,85) e `minijogo` (30% dos acertos perfeitos; os outros respondem atrasados).
- Sons: `aldrava` (Impact Sounds, metal médio) e `casaAcordou` (madeira pesada), já creditados em
  `docs/CREDITS.md`, com síntese de reserva; `minijogoAcerto` e `minijogoErro` só sintetizados.

## Modo dev: aba Testar (pedido de 17/10)

Sem números novos no `content/`: a aba lê os que já existem. As fantasias vêm de `campeoes.json`,
os bairros de `run.json` → `nomesDosBairros`, as espécies de `inimigos.json` (sem os chefes e a
Casa Desperta) e os minijogos de `exploracao.json` → `desconfiada.minijogos`. O minijogo avulso usa
o bairro da rua e o raio de recusa (`desconfiada.raioRecusa`) decide até onde "Ir à casa" tira os
inimigos.
