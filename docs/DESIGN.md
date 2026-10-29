# Porta a Porta — direção de arte, level design e interface (passe D)

13/10/2026 · plano do passe de design pedido depois da tarefa G5. Vale junto com o GDD e o
complemento; onde este documento muda números de layout, os números novos estão no JSON.

## 1. Diagnóstico do que existia

| Problema                                                              | Efeito no jogador                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| Rua jogável de 22 × 8 tiles, com 2 tiles de margem e o vazio em volta | O mapa parece um corredor numa caixa de papelão      |
| Os limites são só cercas e o fim do chão                              | Não há cidade; o mundo acaba onde a luta acaba       |
| Só 3 modelos de casa e 4 objetos de rua                               | Toda rua parece a mesma rua                          |
| Chão de um tom só, sem pista, calçada nem praça                       | Não dá para ler onde é rua, onde é casa, onde é rota |
| Inimigos nascem sempre no mesmo canto, numa reta sem cobertura        | Toda onda chega igual; o Poste não tem "terreno"     |
| Interface só com texto e retângulos                                   | Difícil ler recarga, vida e objetivo de relance      |
| Escuridão, halos e sombras em canvases do tamanho do mapa             | Não escala para um mapa maior                        |

## 2. Pilares do passe

1. **A rua é um lugar.** Cada trecho tem função e cara própria: largo da entrada, quarteirão
   residencial, praça do meio, comércio e largo da saída.
2. **A cidade continua.** Além da área jogável há quarteirões, ruas de trás, a avenida que segue
   depois dos portões e a travessa bloqueada por obras. O limite é sempre um objeto do mundo (muro,
   tapume, portão, grade), nunca o fim do chão. A câmera nunca mostra o vazio.
3. **Ler o chão.** Pista, calçada, praça, grama e faixas em cinzas próximos (sem cor de acento,
   sem textura), para o jogador saber onde está e por onde as ondas vêm.
4. **Terreno com intenção.** Carros estacionados, bancas, floreiras e o chafariz são cobertura:
   cortam a linha de tiro, quebram a reta das ondas e criam flancos perto dos Postes.
5. **Interface de jogo, não de planilha.** Ícones desenhados por código, recarga em leque,
   minimapa, rastreador de objetivo e números em fonte pixel.

## 3. Layout da rua de luta

> **Substituído pelo passe E (seção 9):** a rua de luta virou uma rota linear pela cidade. O texto
> abaixo fica como registro do passe D.

Rua principal na direção y (entrada no sul, saída no norte), agora com **36 tiles** de comprimento.

### Corte de oeste para leste (x, em tiles)

| Faixa       | Largura | O que tem                                                        |
| ----------- | ------- | ---------------------------------------------------------------- |
| Quintal     | 6       | Selvagem, baú, árvores; acesso só pelas vielas                   |
| Casas       | 4,4     | Fachada para a rua; muro dos fundos separa do quintal            |
| Jardim      | 0,8     | Caixa de correio, abóbora, floreira, portãozinho                 |
| Calçada     | 1,6     | Postes, árvores, hidrantes, lixeiras, orelhão, ponto de ônibus   |
| Pista       | 8       | Asfalto, faixa central, carros estacionados no meio-fio, bueiros |
| (espelhado) |         | Calçada, jardim, casas e quintal do lado leste                   |

Total: 34 tiles de largura jogável. A pista continua tendo 8 tiles (o GDD fala de 22 × 8).

### Trechos ao longo da rua (distância a partir do portão de entrada)

| Trecho               | Distância | Função de jogo                                                                               |
| -------------------- | --------- | -------------------------------------------------------------------------------------------- |
| Largo da entrada     | 0 a 3     | Chegada calma: pórtico do bairro, ponto de ônibus, pedido na tela                            |
| Quarteirão das casas | 3 a 14    | Vielas para os quintais; **Poste Corrompido 1 a 10 tiles**, entre carros estacionados        |
| Praça do meio        | 14 a 22   | Alarga a rua para um lado; chafariz, coreto ou parquinho. Arena da **elite** (rua 2+)        |
| Travessa em obras    | 15 a 19   | Do outro lado da praça: rua transversal de 6 tiles fechada por tapume. **3º bueiro**         |
| Comércio             | 22 a 33   | Lojas com toldo e vitrine acesa; **Poste Corrompido 2 a 27 tiles**, com a banca de cobertura |
| Largo da saída       | 33 a 36   | Bueiros 1 e 2 junto à saída; portões das rotas; pórtico                                      |

### Inimigos: onde nascem e por quê

| Quem                | Onde                                           | Intenção                                                   |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Ondas (bueiros 1–2) | Largo da saída, um de cada lado da pista       | As ondas descem a rua inteira: tempo de ler e preparar o Q |
| Ondas (bueiro 3)    | Boca da travessa, na praça                     | Da onda 3 em diante uma parte chega de lado, pela praça    |
| Poste Corrompido 1  | Pista, a 10 tiles, ao lado de um par de carros | Primeira luta com cobertura: os carros cortam o tiro       |
| Poste Corrompido 2  | Comércio, a 27 tiles, atrás da banca de jornal | Flanco obrigatório pela calçada ou pela praça              |
| Elite               | Porta mais perto da praça                      | A praça é aberta: espaço para desviar dos avisos vermelhos |
| Selvagens           | Quintais (inalterado)                          | Aposta opcional, na sombra                                 |

A praça e a travessa trocam de lado conforme a semente, e o tipo de praça (chafariz, coreto ou
parquinho) também; cada bairro tem pesos próprios de casas e de praça.

## 4. A cidade em volta (cenário)

Gerada com a mesma semente da rua, sem colisão e sem efeito na simulação:

- **Anel de 18 tiles** em volta da área jogável: com zoom 0,8 a câmera nunca chega ao fim do
  mundo, porque o enquadramento fica preso dentro do losango do mapa, não do retângulo.
- **Ruas de trás** paralelas, atrás dos muros dos quintais, e **ruas cruzadas** depois dos
  portões: a avenida continua para o norte e para o sul.
- **Quarteirões** preenchidos por lotes virados para as ruas: casas dos 8 modelos, prédios de
  apartamentos, lojas e, uma vez por cidade, um marco (igreja com torre, escola ou caixa-d'água).
- **Vida:** janelas acesas, postes decorativos que recortam a escuridão, carros, árvores, abóboras
  e decorações de Halloween nos jardins, varais com lençóis e fumaça nas chaminés.
- **Limites como objetos:** muro alto nos fundos dos quintais, tapume com cavaletes na travessa e
  pórtico com grade nos portões.

## 5. Catálogo de modelos

| Grupo       | Modelos                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Casas (rua) | casa térrea, sobrado, casa grande (já existiam); casa com varanda, geminado, chalé, casa com torreão |
| Comércio    | loja (mercadinho, padaria e farmácia: mesma base, letreiro e vitrine diferentes)                     |
| Marcos      | prédio de apartamentos, igreja, escola, galpão, caixa-d'água                                         |
| Rua         | carro, perua, hidrante, caixa de correio, orelhão, ponto de ônibus, banca, caçamba, semáforo, placa  |
| Praça       | chafariz, coreto, balanço, escorregador, floreira, arbusto, pinheiro, árvore seca                    |
| Limites     | muro alto, tapume, cavalete, cone, pórtico do bairro                                                 |
| Halloween   | abóbora acesa (brilho branco: o cenário não usa acento), lápide de jardim, varal com lençóis         |

Regra de arte inalterada: três tons pela normal, sem contorno, sem textura; o brilho do cenário é
sempre o branco frio da paleta.

## 6. Chão

O plano único vira zonas de cinza muito próximas (nenhuma cor de acento): **asfalto** um pouco mais
escuro que o chão, **calçada** e **praça** um pouco mais claras, **grama** (jardins e quintais)
quase no tom do chão, **faixas** (linha central tracejada e faixa de pedestres) e **meio-fio**.

## 7. Interface

| Área               | Conteúdo                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Embaixo à esquerda | Retrato do campeão com anel de XP e nível; Coragem grande com número, Energia e Luz da lanterna                                   |
| Embaixo ao centro  | Placa com Q W E R: ícone desenhado, recarga em leque, custo, postos e cargas; passiva à esquerda; Susto na borda de cima da placa |
| Embaixo à direita  | Itens e consumíveis com ícone e tecla                                                                                             |
| Em cima à esquerda | Rastreador: nome da rua, Postes (x/2), onda (n/6), pedido e tratos por marca                                                      |
| Em cima à direita  | Minimapa da rua (pista, casas, quintais, jogador, inimigos, Postes, saída); Doces e o Relógio da Meia-Noite como mostrador        |
| Em cima ao centro  | Barra do chefe ou da elite com placa de nome e fase; sem chefe, a régua da rua (entrada, Postes, jogador, saída)                  |
| Tab segurado       | Mapa grande opaco no meio da tela, com a legenda em símbolos                                                                      |
| Tela inteira       | Vinheta vermelha ao levar dano e pulsando com pouca Coragem; vinheta roxa no Frenesi                                              |

Números (recargas, custos, Coragem, dano) em fonte pixel 5 × 7 desenhada por código.

## 8. Escala técnica

- Chão e sombras em blocos de 1024 px; desde o passe E, assados só perto da câmera (seção 12).
- Escuridão do tamanho da tela, refeita a cada quadro com um carimbo por luz visível.
- Cada modelo continua assado uma vez por rotação e reaproveitado.

---

# Passe E — a rota, a exploração e a cidade coesa

14/10/2026 · pedido depois do D4: "mapa muito maior e linear, como os mapas de Minecraft Dungeons",
"mais envolvimento em exploração", "limites mais discretos (ruas interditadas, morros, buracos)",
"um mapa grande para o jogador, sem gastar desempenho com o que ele não vê" e "coesão, não modelos
repetidos lado a lado". Os modelos 3D novos dos personagens ficaram para depois, a pedido.

## 9. A rota

Cada rua de luta é uma **rota linear** que serpenteia por uma grade de quarteirões (6 × 8 células
de 24 tiles), da entrada (sul) ao portão de saída (norte). A busca da rota é um caminho que nunca
encosta em si mesmo: entre duas passagens sempre há um quarteirão inteiro, então o jogador lê o
caminho como uma estrada só, de sala em sala, como numa fase de dungeon crawler.

| Sala (ao longo da rota)           | Onde         | Função                                                                       |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Largo da entrada                  | 1º nó        | Chegada calma: ponto de ônibus, orelhão, pórtico; a rua de trás interditada  |
| Cruzamento do Poste               | 35% da rota  | **Poste Corrompido 1** entre carros parados (primeira luta com cobertura)    |
| Rua interditada                   | logo depois  | Cavaletes e placa: só abre quando o 1º Poste cai (o caminho é uma sequência) |
| Praça                             | 55%          | Chafariz, coreto ou parquinho; arena aberta da **elite**                     |
| Obra                              | 72%          | Tapumes, entulho, barracão; **bueiro de flanco**                             |
| Pátio da escola ou estacionamento | penúltimo nó | **Poste Corrompido 2**, com quadra ou fileiras de carros de cobertura        |
| Largo do portão                   | último nó    | Bueiros 1 e 2, portões das rotas e o pórtico                                 |

**Becos laterais (5 a 8, opcionais):** ruas estreitas sem saída que levam a um quintal grande
(selvagem e baú), ao cemitério (capela, covas, corvo), à caixa-d'água (mirante) ou só a um
esconderijo no fim da rua. Os becos são o "fora do caminho" que recompensa quem explora.

**Encontros:** grupos de 3 a 5 pestinhas dormem pelos cruzamentos da rota e acordam quando o
jogador chega a 8 tiles (ou quando levam dano). As **ondas** continuam (10 por rua), mas cada uma sai
dos bueiros mais perto do jogador pelo caminho, entre 13 e 32 tiles: a pressão acompanha quem
explora, sem pestinhas nascendo em cima dele.

**Tamanho:** o chão que dá para andar tem de 6.800 a 7.700 tiles² (mais de 5 vezes a rua antiga de
34 × 40), com 18 a 21 nós e 330 a 420 tiles de caminho.

**Como é fechado:** o caminho é a união de retângulos (ruas, salas, becos). Tudo fora dele é
bloqueado na simulação (`RuaGerada.bloqueado`) e, na tela, a borda é sempre algo do mundo: a
fachada das casas, sebes nos vãos entre elas, cercas, tapumes ou um fecho de rua.

## 10. Exploração

| Sistema           | Como funciona                                                                                               | Recompensa                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Névoa do mapa     | O minimapa (radar que anda com o jogador) e o mapa grande (Tab) começam cobertos; abrem num raio de 7 tiles | 40% e 70% do chão revelado: doces e XP                                               |
| Campainhas        | 6 a 9 casas com abóbora acesa e luz na varanda; F toca, uma vez cada                                        | Doces, um consumível, uma história (XP) ou **travessura**: 3 pestinhas saem da porta |
| Abóboras Douradas | 3 por rua, em fins de beco, cantos de quintal, cemitério, obra, pátio; só aparecem de perto ou na luz       | Doces, XP e Susto; as 3 fazem um **baú raro** aparecer                               |
| Postes apagados   | 3 a 5 postes da rota começam apagados; F e ficar parado 1,2 s religa (dano ou andar interrompe)             | Luz que cura e recarrega a lanterna; revela o mapa em volta                          |
| Mirante           | A caixa-d'água no fim de um beco; F e 2 s parado                                                            | Revela 45 tiles em volta e marca as Abóboras Douradas                                |
| Nomes de rua      | Cada rua, praça e beco tem nome; o rastreador mostra "em Rua do Corvo Manso"                                | Lugar reconhecível                                                                   |
| Pedidos novos     | Revelar 60% do mapa, achar 2 Abóboras, tocar 4 campainhas, religar 2 postes                                 | Os prêmios de pedido de sempre                                                       |

Os quintais continuam com um selvagem cada; o baú aparece em 65% deles (são mais quintais por rua).

## 11. Cidade coesa e limites discretos

- **Plano de cidade:** toda linha da grade é uma rua. As que a rota não usa são **ruas de fora**
  (cenário), com casas viradas para elas, postes e carros. Onde uma rua de fora encosta no caminho,
  ela termina numa interdição (barreira de concreto ou obra), e o jogador vê a cidade continuar.
- **Lotes:** cada casa (da rota ou de fora) tem jardim na frente e quintal nos fundos, com cerca e
  uma árvore, um varal, um arbusto ou uma lápide de Halloween; os quintais das duas fileiras se
  encontram no miolo da quadra. O mesmo modelo nunca se repete lado a lado, as esquinas tendem a ser
  comércio e às vezes há um terreno baldio com mato atrás da sebe.
- **Morros:** um quarteirão inteiro pode ser um morro (mais alto no meio, pinheiros e pedras em
  volta); um lado da cidade pode ser a encosta da serra.
- **Fechos de rua:** a entrada fica interditada atrás do jogador (barreiras), os becos sem saída
  terminam em obra, buraco na pista, barreira ou deslizamento de terra e pedras. Nenhum muro.
- Modelos novos (cenário, em cinza): morro (baixo e alto), pedra (pequena e grande), barreira de
  concreto, buraco na pista e placa de rua interditada; e a Abóbora Dourada (cor dos doces).

## 12. Desempenho

- **Só existe o que a câmera alcança:** o mundo é recortado nas colunas que a rota usa, e o cenário
  (lotes de fora, morros, árvores e a cidade em volta) só é criado até 26 tiles do caminho, que é o
  que a câmera mostra no zoom mínimo. O resto do mapa nunca aparece e não custa nada.
- **Chão sob demanda:** os blocos de 1024 px do chão são assados quando a câmera chega perto e
  descartados quando ela se afasta.
- **Luz com índice:** a simulação e a tela guardam as luzes em baldes de 4 tiles; perguntar se um
  ponto está iluminado olha só as luzes vizinhas (a rota tem centenas de janelas acesas).
- **Campo de fluxo com raio:** as ondas só calculam caminho até 55 tiles do jogador.
- No navegador de teste (sem placa de vídeo) a rota roda tão rápido quanto a rua antiga.

## 13. Animação de movimento

Sem trocar os modelos: o corpo se inclina para o lado em que anda (até 0,09 rad, suavizado), achata
um pouco quando o pé toca o chão e, no jogador, nas elites e nos chefes, cada passo levanta dois
quadradinhos de poeira. As figuras ficam presas nos pés (escala e inclinação giram em volta deles).
