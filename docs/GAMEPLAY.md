# Porta a Porta: gameplay (complemento do GDD)

13/10/2026 · @Emanuel

> Fonte: `docs/GAMEPLAY.pdf` (versão completa, 20 páginas). Onde este documento muda o GDD, vale a
> tabela [O que muda no GDD](#o-que-muda-no-gdd); o resto do GDD continua valendo.

Este documento complementa o GDD já entregue ao Claude Code: detalha o combate minuto a minuto e
acrescenta os sistemas que fazem o jogador querer "só mais uma run". Onde ele muda algo do GDD, a
mudança está listada na última seção.

## Os ganchos de vício

O jogo prende em quatro escalas de tempo ao mesmo tempo: a cada luta o jogador sente que jogou bem, a
cada rua escolhe para onde ir, a cada run monta uma build diferente e, ao perder, vê exatamente o que
faltou. Cada ciclo termina abrindo o próximo, e o último devolve o jogador ao primeiro.

| Ciclo                 | O que acontece                                                                                                 | Leva a                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Luta (a cada 30 s)    | Susto enche ao acertar e desviar; Frenesi: recargas 50% mais rápidas; interromper avisos vermelhos rende bônus | Rua (fecha a rua)            |
| Rua (a cada 3 min)    | Pedido do morador como meta curta; baús, quintais e encontros raros; portão: escolher entre 2 rotas            | Run (soma tratos e níveis)   |
| Run (cerca de 45 min) | Evoluções no posto 3 das habilidades; marcas e Conjuntos de tratos; rota do Pacto ou do Bom Vizinho            | Entre as runs (fim da run)   |
| Entre as runs         | A tela mostra o quanto faltou; maestria, Diário e moradores que lembram; nova run em menos de 10 s             | Luta (nova run, outra build) |

### O que cada sistema novo resolve

| Sistema                            | Problema que resolve                   | Por que dá vontade de voltar                               |
| ---------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Susto e Frenesi                    | Lutar parece igual do início ao fim    | Jogar bem rende poder na hora, e o jogador sente a melhora |
| Evoluções de habilidade            | O mesmo campeão joga igual em toda run | Cada run testa outra combinação de evoluções               |
| Marcas e Conjuntos                 | Tratos parecem só números maiores      | O jogador persegue uma build com nome e identidade         |
| Rotas e condições da noite         | O caminho é sempre o mesmo             | Toda run passa por ruas e riscos diferentes                |
| Pedidos dos moradores              | Ruas sem objetivo próprio              | Uma meta pequena a cada 3 minutos                          |
| Surpresas raras                    | A run fica previsível                  | Sempre pode aparecer algo que vira a run                   |
| Tela de derrota, maestria e Diário | Perder parece tempo perdido            | Toda run avança alguma barra e sugere o próximo objetivo   |

## Minuto a minuto

Em cada rua o jogador alterna entre três ritmos: avançar pela luz, limpar a onda de pestinhas e punir
o Poste ou o elite quando eles se expõem. Os números abaixo são o alvo para uma rua de cerca de 3
minutos.

### Ritmo de uma rua

| Momento     | O que acontece                                                             |
| ----------- | -------------------------------------------------------------------------- |
| 0:00        | Entrada pelo portão da esquerda, com o pedido do morador na tela           |
| 0:10        | Primeira onda; depois uma a cada 25 s, num total de 6                      |
| 0:15 a 1:25 | Luta pelo Poste Corrompido 1, a 12 tiles do portão                         |
| 0:45 a 1:35 | Janela ideal para um quintal opcional                                      |
| 1:35 a 2:35 | Luta pelo Poste Corrompido 2, a 18 tiles, com o elite (da rua 2 em diante) |
| 2:45        | O portão de saída abre e aparecem as 2 rotas seguintes                     |

A rua tem 22 × 8 tiles. As pestinhas nascem em dois bueiros do lado direito. Cada onda tem 4
pestinhas no bairro 1, 5 no bairro 2 e 6 no bairro 3.

### Movimento e colisão

- O corpo do jogador tem raio de 0,4 tile. Inimigos corpo a corpo bloqueiam o caminho; só dashes e o
  Atravessar do Fantasma passam por eles.
- Casas são obstáculos. Vielas de 1 tile ligam a rua aos quintais.
- A câmera acompanha com suavização e olha 2 tiles à frente na direção do movimento.

### Auto-ataque

| Campeão    | Alcance                         | Ataques por segundo | Dano            |
| ---------- | ------------------------------- | ------------------- | --------------- |
| Bruxinha   | 5 tiles (projétil a 12 tiles/s) | 1,0                 | 6 + 60% Feitiço |
| Fantasma   | 1,5 tile                        | 1,4                 | 100% Força      |
| Esqueleto  | 1,5 tile                        | 0,9                 | 120% Força      |
| Vampirinho | 1,5 tile                        | 1,1                 | 100% Força      |

O golpe tem 0,2 s de preparo e sai só se o jogador não se mover nesse tempo; mover antes cancela sem
perder o ritmo. "Atacar e mover" (A + clique) ataca o inimigo mais próximo no caminho, com prioridade
para Arremessadores, depois Pestinhas de Lençol, Abóboras-Canhão e Postes.

### Lançar habilidades

- **Lançamento rápido (padrão):** segurar a tecla mostra a área e soltar lança. Esc ou o botão
  direito, enquanto segura, cancela sem custo. Há opção para lançar ao apertar.
- **Tempo de lançamento:** Q e W levam 0,25 s e o R 0,8 s, com o jogador parado. O E é instantâneo.
  Atordoamento e Medo interrompem o lançamento, e a habilidade volta com metade da recarga.
- **Fora do alcance:** linhas saem até o alcance máximo na direção do cursor, e áreas caem no ponto
  mais distante possível.
- **Comando guardado:** uma tecla apertada até 0,15 s antes do fim da ação atual sai logo em
  seguida.
- **Controle:** assistência de mira de 10 graus na direção do analógico.

### Regras de legibilidade (obrigatórias)

- Nenhuma habilidade inimiga, fora o auto-ataque das pestinhas, causa dano com menos de 0,4 s de
  aviso vermelho no chão.
- Projéteis inimigos andam a no máximo 9 tiles por segundo.
- No máximo 3 áreas de aviso se sobrepõem ao jogador ao mesmo tempo.
- Todo dano recebido faz o personagem piscar em branco.

### Como jogar cada campeão

| Campeão    | Abertura              | Meio da luta                               | Fechamento                    | Erro comum                   |
| ---------- | --------------------- | ------------------------------------------ | ----------------------------- | ---------------------------- |
| Bruxinha   | Q de longe na onda    | W no caminho e Q nos lentos                | R na onda inteira             | Gastar Energia e ficar sem E |
| Fantasma   | Esperar na sombra     | E para entrar com o crítico e Q na fila    | R em alvo fraco e W para sair | Lutar na luz                 |
| Esqueleto  | E no meio da onda     | Q no mais perigoso e W antes do dano forte | R prendendo onda e elite      | W cedo demais                |
| Vampirinho | Q no alvo mais frágil | Névoa na sombra e golpes com roubo de vida | R nas lutas longas            | Capa antes do dano forte     |

### Ondas e Postes

- As pestinhas seguem o campo de fluxo até o jogador, mas não em fila: de longe cada uma curva para
  um lado (flanco), ninguém se amontoa (separação) e, no cerco, as 3 que atacam chegam cada uma por
  um lado, contornando o jogador. Arremessadores ficam a 5 tiles andando de lado, contornam as
  casas para ter linha de tiro e jogam o ovo onde o jogador vai estar. A Abóbora-Canhão prioriza
  quem está parado e, de meia distância, rola até ele (anunciado). A Pestinha de Vela foge de quem
  chega perto.
- Alguns inimigos pulam de lado quando um projétil do jogador vem neles (chance por espécie) e
  saem das áreas dele que ainda vão pulsar.
- O Poste Corrompido mira primeiro o Doce-isca e depois o jogador. Na sombra só enxerga de perto,
  mas quem bate nele o deixa em alerta (6 s enxergando em todo o alcance). De perto, solta o Pulso
  (anunciado, empurra); os tiros alternam entre onde o jogador está e onde ele vai estar; abaixo da
  metade, chama 2 pestinhas. Com 3 ou mais pestinhas a até 4 tiles dele, recebe 50% menos dano,
  então limpar a onda antes compensa.
- **Doce-isca (consumível novo, 40 doces):** atrai inimigos e Postes por 4 s num raio de 5 tiles.
- Postes amigos curam 2% da Coragem por segundo a quem está na luz deles.

### Quintais e vielas

- Cada rua tem de 3 a 5 vielas para quintais de 6 × 6 tiles, com 1 selvagem e um baú.
- A Casa Perseguidora não cabe nas vielas, que viram refúgio contra ela.
- Quintais ficam na sombra e o Relógio da Meia-Noite continua andando, então entrar é sempre uma
  aposta.

## Medidor de Susto e Frenesi

O Susto é uma barra de 0 a 100 que enche quando o jogador acerta sem ser acertado e transborda em
Frenesi, alguns segundos em que tudo recarrega rápido. É a recompensa imediata por jogar bem, e o
motivo para o jogador arriscar acertos em vez de só fugir.

### Como enche e esvazia

| Evento                                                                      | Efeito no Susto                              |
| --------------------------------------------------------------------------- | -------------------------------------------- |
| Acerto de habilidade (por alvo, até 3 por lançamento)                       | +4                                           |
| Auto-ataque que acerta                                                      | +1                                           |
| Inimigo derrotado                                                           | +6 (elite +20)                               |
| Acertar um inimigo durante o aviso vermelho dele (interromper)              | +10 e o ataque é cancelado, exceto em chefes |
| Desviar por pouco: um aviso vermelho termina a menos de 0,5 tile do jogador | +5                                           |
| Ser atingido por um ataque com aviso vermelho                               | Perde metade do Susto                        |
| 3 s sem acertar nada                                                        | Esvazia 8 por segundo                        |

O dano sem aviso (auto-ataque das pestinhas) não tira Susto, então o medidor pune só o erro de
desvio, nunca o dano inevitável.

### Faixas e recompensas

| Faixa   | Nome          | Bônus                                                                                            |
| ------- | ------------- | ------------------------------------------------------------------------------------------------ |
| 0 a 24  | Calmo         | Nenhum                                                                                           |
| 25 a 49 | Arrepio       | Doces ×1,25                                                                                      |
| 50 a 99 | Pavor         | Doces ×1,5 e +10% de velocidade                                                                  |
| 100     | Frenesi (6 s) | Recargas 50% mais rápidas, habilidades sem custo de Energia e doces ×2; depois a barra volta a 0 |

**Na tela:** a barra fica sob as habilidades e muda de cor por faixa (cinza, laranja, roxo). No
Frenesi, a lanterna do jogador fica laranja, a música ganha uma camada de percussão e cada acerto
mostra o número em tamanho maior.

**Alvo de ritmo:** um jogador médio entra em Frenesi de 1 a 2 vezes por rua; um bom jogador, de 3 a 4. Tratos e evoluções podem interagir com o Susto (por exemplo, começar cada rua com 25 ou prolongar
o Frenesi).

## Evoluções de habilidade

Quando Q, W ou E chegam ao posto 3, o jogo pausa e o jogador escolhe 1 entre 2 evoluções para aquela
habilidade; quando o R chega ao posto 3 (nível 12), escolhe 1 entre 2 Despertares. A escolha vale
até o fim da run, então o mesmo campeão joga diferente a cada run.

Com 9 pontos para Q, W e E (máximo de 5 cada), o jogador consegue evoluir as três, mas só maximiza
duas, e decide a ordem. As evoluções somam ao que o GDD já define para a habilidade.

### Bruxinha

| Habilidade           | Evolução A                                                                           | Evolução B                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Q Vassoura Disparada | **Ricochete:** ao acertar, salta para mais 2 inimigos a até 3 tiles, com 60% do dano | **Vassoura Pesada:** atravessa todos os inimigos e empurra 1 tile, mas recarga +2 s         |
| W Poção Pegajosa     | **Poção Explosiva:** ao sumir, explode com 150% do dano por segundo                  | **Poção Grudenta:** enraíza por 1 s quem fica 1,5 s dentro                                  |
| E Salto de Vassoura  | **Rastro de Faíscas:** deixa uma linha que causa dano por 2 s                        | **Pouso Leve:** os 2 s seguintes ao salto dão 30% de velocidade e a próxima Q sai sem custo |
| R Chuva de Abóboras  | **Despertar: Tempestade:** 5 ondas em vez de 3, com área que segue o cursor          | **Despertar: Abóbora Gigante:** uma única queda com 400% do dano e atordoamento de 1,5 s    |

### Fantasma

| Habilidade        | Evolução A                                                                                                      | Evolução B                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Q Arranhão Gélido | **Corte Duplo:** a Q pode ser usada de novo em até 2 s, com 50% do dano                                         | **Gelo:** deixa lento em 40% por 1,5 s                                           |
| W Atravessar      | **Passagem Fria:** quem estiver no caminho fica com Medo por 1 s                                                | **Duas Paredes:** acumula 2 cargas                                               |
| E Lençol          | **Lençol Longo:** dura 2 s a mais e se renova ao derrotar um inimigo enquanto ativo                             | **Lençol Vazio:** ao sair da invisibilidade, o primeiro golpe causa +80% de dano |
| R Assombração     | **Despertar: Corrente de Almas:** se o alvo cair, salta automaticamente para o inimigo mais fraco a até 6 tiles | **Despertar: Pesadelo:** o alvo fica com Medo por 2 s antes do golpe             |

### Esqueleto

| Habilidade           | Evolução A                                                                              | Evolução B                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Q Soco de Osso       | **Osso Quebrado:** o cone dobra de tamanho                                              | **Fratura:** o alvo recebe +20% de dano por 4 s                                              |
| W Escudo de Costelas | **Espinhos:** quem bate no escudo recebe 30% do dano de volta                           | **Escudo Duplo:** 2 cargas, com 60% do escudo cada                                           |
| E Investida          | **Atropelo:** atordoa por 0,5 s quem for empurrado contra uma casa                      | **Retorno:** pode voltar ao ponto de partida em até 3 s                                      |
| R Ossuário           | **Despertar: Cemitério:** o anel dura 4 s e cura 3% de Coragem por segundo ao Esqueleto | **Despertar: Desabamento:** ao fechar, causa dano igual a 15% da Coragem máxima do Esqueleto |

### Vampirinho

| Habilidade        | Evolução A                                                                          | Evolução B                                                         |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Q Mordida         | **Mordida Dupla:** morde 2 vezes, com 60% do dano cada                              | **Sangria:** aplica dano por 3 s igual a 50% do golpe              |
| W Capa de Morcego | **Revoada:** os morcegos causam dano por onde passam                                | **Capa Longa:** voa 5 tiles e fica 0,8 s imune                     |
| E Névoa           | **Névoa Faminta:** inimigos dentro perdem 2% de Coragem por segundo                 | **Névoa Densa:** inimigos dentro ficam 30% mais lentos             |
| R Banquete        | **Despertar: Sem Fim:** cada inimigo derrotado durante o Banquete o prolonga em 1 s | **Despertar: Transfusão:** ao terminar, cura 30% da Coragem máxima |

As duas evoluções de cada habilidade ficam disponíveis desde a primeira run, para a escolha existir
sempre. Os Despertares do R só aparecem depois da primeira vez que o jogador chega ao nível 12 com
aquele campeão, o que dá uma meta clara às primeiras runs.

## Builds: marcas, conjuntos e rotas

Cada trato tem uma marca, e juntar tratos da mesma marca ativa um Conjunto, um bônus que muda o jeito
de jogar. Isso transforma a escolha na porta de "qual trato é mais forte" em "qual trato fecha a
minha build", e é o principal motivo para começar outra run testando outra combinação.

Com 1 trato por fase Porta a Porta (6 fases por run, mais Gato Preto e Janela Vermelha), o jogador
termina uma run com 6 a 8 tratos, o suficiente para fechar 1 Conjunto completo e começar outro.

### As 6 marcas e seus Conjuntos

| Marca   | 2 tratos                                          | 4 tratos                                                                                           |
| ------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Luz     | Postes amigos curam o dobro                       | **Farol:** a lanterna não gasta Luz e o pulso causa dano                                           |
| Sombra  | +10% de dano na sombra                            | **Noite Eterna:** ruas escuras viram vantagem, com o jogador invisível a vigias em qualquer sombra |
| Doce    | Doces ×1,2                                        | **Fome de Doce:** cada 100 doces carregados dão +3% de dano (até 30%)                              |
| Eco     | Habilidades têm 15% de chance de repetir          | **Coro:** toda 3ª habilidade se repete com 60% do efeito                                           |
| Abóbora | Inimigos derrotados têm 20% de chance de explodir | **Colheita:** toda explosão de abóbora enche +5 de Susto e pode encadear                           |
| Pacto   | +5% de dano por preço ativo                       | **Contrato Fechado:** cada preço ativo também reduz 4% da recarga (até 40%)                        |

Um trato pode ter 2 marcas. A tela da porta mostra as marcas de cada trato e quantas faltam para o
próximo Conjunto, com destaque quando o trato completa um.

### Marcas dos tratos do GDD

| Trato               | Marca   |
| ------------------- | ------- |
| Relógio de Bolso    | Eco     |
| Dentes Afiados      | Pacto   |
| Segundo Fôlego      | Luz     |
| Mira Torta          | Eco     |
| Lua no Bolso        | Sombra  |
| Sombra Amiga        | Sombra  |
| Eco                 | Eco     |
| Ímã de Doces        | Doce    |
| Corrente de Abóbora | Abóbora |
| Pacto do Porão      | Pacto   |
| Casca Grossa        | Luz     |
| Chave Mestra        | Doce    |

### Tratos novos para fechar os Conjuntos (18, completando os 30 do GDD)

| Trato                | Marca          | Poder                                                                |
| -------------------- | -------------- | -------------------------------------------------------------------- |
| Vagalume             | Luz            | O pulso da lanterna cura 10% da Coragem                              |
| Janela Aberta        | Luz            | Janelas acesas também curam como postes                              |
| Lâmpada no Bolso     | Luz            | A lanterna ilumina 1 tile a mais                                     |
| Gato no Telhado      | Sombra         | Sair da sombra dá 1 s de invisibilidade                              |
| Cortina Pesada       | Sombra         | Na sombra, recebe 15% menos dano                                     |
| Vela Apagada         | Sombra e Pacto | Começa cada rua com 1 poste amigo a menos e +20 de Força ou Feitiço  |
| Pote sem Fundo       | Doce           | O Doce-isca dura o dobro e não custa doces 1 vez por rua             |
| Bala de Coco         | Doce           | Comprar no banco cura 10% da Coragem                                 |
| Cofre de Porquinho   | Doce e Pacto   | +1 doce por inimigo, mas o banco cobra 20% a mais                    |
| Sino da Igreja       | Eco            | O R também reinicia a recarga do E                                   |
| Disco Riscado        | Eco            | Auto-ataques reduzem 0,3 s das recargas                              |
| Semente de Abóbora   | Abóbora        | Explosões deixam o chão em chamas por 2 s                            |
| Lanterna de Abóbora  | Abóbora e Luz  | Explosões iluminam a área por 3 s                                    |
| Espantalho           | Abóbora        | Uma vez por rua, ao chegar a 20% de Coragem, explode e empurra todos |
| Assinatura em Sangue | Pacto          | +30% de dano, mas o próximo trato vem com 2 preços                   |
| Dívida Antiga        | Pacto          | O Cobrador passa a soltar 100 doces ao ser derrotado                 |
| Recibo Rasgado       | Pacto          | Uma vez por run, apaga o preço mais antigo                           |
| Coleção de Chaves    | Doce           | Baús de quintal dão 1 item comum extra                               |

### Duas rotas de run

- **Rota do Pacto (poder com risco):** aceitar muitos tratos, de preferência os de Pacto, que ficam
  mais fortes a cada preço. A run fica escura e cheia de Casas Perseguidoras, mas o jogador fica
  muito forte. O chefe final usa a Cobrança, que cresce com os tratos, então essa rota pede uma
  build que aguente o fim.
- **Rota do Bom Vizinho (disciplina):** recusar tratos. Cada recusa dá os 80 doces do GDD e uma
  **Medalha de Bom Vizinho** (+4% de dano e +4% de Coragem máxima por medalha). Com 4 medalhas, a
  próxima porta oferece a **Chave da Cidade**: um trato sem preço que dá +25% em todos os
  atributos. Terminar o bairro 3 com zero tratos leva à Moradora do 13 (GDD).

Misturar as duas rotas é possível, e a melhor build costuma estar no meio: poucos tratos certeiros
que fecham um Conjunto.

## Rotas, condições da noite e pedidos

Ao sair de cada rua, o jogador escolhe entre 2 portões, e cada um mostra a condição da noite, o
elite e a recompensa extra da rua seguinte. O bairro continua com 3 ruas, mas agora o jogador decide
onde arriscar, e nenhuma run passa pelas mesmas ruas.

### O que cada portão mostra

- A **condição da noite** da rua (abaixo), com ícone e uma frase.
- O **elite** que vai aparecer.
- A **recompensa extra**: baú raro, +1 casa na próxima porta, 1 reroll de preço, doces em dobro ou
  um item comum.
- Quantos postes amigos ainda acendem lá, considerando os preços ativos.

### Condições da noite

| Condição            | Efeito                                                                     | Para quem é boa                     |
| ------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| Noite Comum         | Nenhum                                                                     | Qualquer build                      |
| Neblina             | Visão de 4 tiles; inimigos só aparecem perto                               | Esqueleto e Vampirinho              |
| Lua Vermelha        | Inimigos com +20% de dano; doces ×2                                        | Rota do Doce                        |
| Ventania            | Projéteis inimigos fazem curva; 1 poste amigo apaga por 20 s a cada minuto | Fantasma e Sombra                   |
| Festa no Quarteirão | Ondas com +2 pestinhas; XP +50%                                            | Bruxinha e Abóbora                  |
| Silêncio            | Sem música, Corvos dormindo, vigias enxergam metade                        | Fantasma e Sombra                   |
| Chuva de Doces      | 2 baús extras e o Gato Preto aparece com certeza                           | Rota do Doce e quem precisa de item |
| Apagão Parcial      | Metade das janelas apagadas, postes amigos curam o dobro                   | Luz                                 |

As condições raras (Chuva de Doces e Apagão Parcial) aparecem em no máximo 1 portão por bairro.

### Pedidos dos moradores

Ao entrar na rua, um morador faz um pedido opcional, mostrado no topo da tela. Cumprir dá uma
recompensa na próxima porta; falhar não tem punição.

| Pedido                                          | Recompensa                                     |
| ----------------------------------------------- | ---------------------------------------------- |
| Derrube o Poste 2 em até 20 s depois do Poste 1 | 1 reroll de preço grátis                       |
| Termine a rua sem usar a lanterna               | +1 casa acesa na próxima porta                 |
| Derrote 6 pestinhas com uma única habilidade    | 60 doces                                       |
| Entre em Frenesi 2 vezes                        | O próximo trato vem com o preço mais leve      |
| Termine a rua sem perder mais de 30% da Coragem | Item comum aleatório                           |
| Derrote o selvagem de um quintal                | Mostra a condição da noite das próximas 2 ruas |
| Interrompa 3 ataques com aviso vermelho         | +25 de Susto no início da próxima rua          |

Os pedidos dão um objetivo pequeno a cada 3 minutos e fazem o jogador usar o kit de jeitos que não
usaria sozinho.

## Surpresas e recompensas variáveis

Toda rua tem a chance de uma surpresa boa, e algumas são raras o bastante para o jogador lembrar e
comentar. O jogador nunca sabe exatamente o que vem no próximo baú ou na próxima porta, e essa
incerteza é o que mantém a atenção.

### Baús (nos quintais e como recompensa de portão)

| Baú                    | Chance | Conteúdo                                               |
| ---------------------- | ------ | ------------------------------------------------------ |
| Comum (madeira)        | 70%    | 60 a 100 doces                                         |
| Raro (com fita roxa)   | 25%    | Item comum ou 1 reroll de preço e 50 doces             |
| Amaldiçoado (tremendo) | 5%     | Um trato forte com 1 preço, aceito ou recusado na hora |

O baú só revela o tipo quando o jogador chega perto, e o raro e o amaldiçoado têm um som próprio ao
serem notados.

### Encontros raros

| Encontro           | Chance                          | O que acontece                                                                                                                       |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Gato Preto         | 1 em cada 3 ruas                | Foge; se for pego em até 20 s, dá um trato extra sem preço (GDD)                                                                     |
| Janela Vermelha    | 5% por fase Porta a Porta       | Uma casa oferece um trato lendário com 2 preços, como "Noite Sem Fim": o Frenesi dura o dobro e a barra de Susto não esvazia sozinha |
| Carrinho de Pipoca | 1 vez por run, no bairro 2 ou 3 | Loja ambulante com 3 itens com 40% de desconto, por 30 s                                                                             |
| Criança Perdida    | 10% por rua                     | Leve-a até o portão sem ela ser atingida; recompensa de 150 doces e +1 Medalha de Bom Vizinho                                        |
| Festa na Garagem   | 10% por rua                     | Uma garagem se abre com uma onda bônus de 8 pestinhas que dão o triplo de doces                                                      |

### Tratos lendários (Janela Vermelha)

| Trato                | Poder                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Noite Sem Fim        | O Frenesi dura o dobro e o Susto não esvazia sozinho               |
| Coroa de Abóbora     | Toda explosão de abóbora dispara uma Q gratuita                    |
| Relógio Parado       | O Relógio da Meia-Noite para por 10 minutos                        |
| Espelho do Mirante   | Toda habilidade é lançada também por um reflexo, com 40% do efeito |
| Chave Mestra Dourada | Todos os baús são raros ou melhores                                |

**Regra de frequência:** o jogo garante ao menos 1 baú raro por bairro e evita 2 encontros raros na
mesma rua, para as surpresas parecerem sorte e não ruído.

## Progressão dentro da run

O jogador sobe do nível 1 ao 12 ao longo da run, ganhando um ponto de habilidade por nível, e chega
ao nível 12 por volta do chefe do bairro 3. A dificuldade sobe rua a rua, com algo novo em cada uma.

### Experiência

| Origem                                            | XP             |
| ------------------------------------------------- | -------------- |
| Pestinha de Lençol, Arremessador e Abóbora-Canhão | 6, 7 e 10      |
| Cão de Guarda, Corvo da Árvore e Gato Preto       | 40, 20 e 30    |
| Poste Corrompido                                  | 40             |
| Elite                                             | 120            |
| Chefes dos bairros 1, 2 e 3                       | 300, 400 e 500 |

- XP para subir: 100 + 60 × (nível − 1). Do nível 1 ao 12 são 4.400 de XP, e uma rua rende cerca de 400.
- 12 pontos no total: o R recebe 1 ponto nos níveis 4, 8 e 12 (GDD) e os outros 9 vão para Q, W e E,
  no máximo 5 cada.
- A evolução aparece no posto 3 de cada habilidade (ver Evoluções), e é por isso que a ordem dos
  pontos importa.

### Curva das ruas por posição

As 2 rotas de cada portão sorteiam o elite a partir da lista da posição, então o jogador ainda
escolhe entre dois.

| Posição | Elites possíveis                              | Novidade                                  |
| ------- | --------------------------------------------- | ----------------------------------------- |
| 1-1     | Nenhum                                        | Tutorial de movimento, luz e Postes       |
| 1-2     | Vizinho Curioso ou Casa Perseguidora          | Alarme do Corvo                           |
| 1-3     | Casa Perseguidora ou Vizinho Curioso          | Primeiro Pisão e primeiro pedido difícil  |
| 2-1     | Sombra Rasteira ou Cobrador                   | Metade dos postes amigos já nasce apagada |
| 2-2     | Cobrador ou Casa Perseguidora                 | Dívida e marca                            |
| 2-3     | Qualquer elite, reforçado                     | Mais Abóboras-Canhão por onda             |
| 3-1     | Sombra Rasteira ou Vizinho Curioso, reforçado | Quase sem postes amigos                   |
| 3-2     | Cobrador ou Casa Perseguidora, reforçado      | Ondas com os 3 tipos de pestinha          |
| 3-3     | 2 elites ao mesmo tempo                       | Rua escura antes do chefe final           |

Elite reforçado tem +30% de Coragem e de dano, além do aumento de cada bairro do GDD. Os preços
ativos se somam a tudo isso.

## Entre as runs

O jogador volta por três motivos: cada run termina mostrando o que faltou e o que está perto de ser
desbloqueado, cada campeão tem uma trilha própria de maestria e o bairro lembra das escolhas
anteriores. Tudo isso se soma ao Álbum de Fantasias e à Lua Cheia do GDD.

### Tela de derrota (ou de vitória)

- Mostra o quanto faltou: "O Síndico ficou com 12% de Coragem".
- Lista a build da run: campeão, evoluções, tratos, Conjuntos e preços.
- Mostra 2 barras de progresso: o próximo desbloqueio do Álbum e a próxima maestria do campeão.
- Sugere um objetivo para a próxima run, tirado do Diário ("Você nunca fechou o Conjunto Eco").
- O botão "Nova run" aparece em até 3 s, com o último campeão já selecionado; Enter começa direto.

### Maestria por campeão (níveis 1 a 5)

Cada campeão ganha pontos de maestria pela XP da run, com bônus ao vencer chefes.

| Nível | Recompensa                                                               |
| ----- | ------------------------------------------------------------------------ |
| 1     | Despertares do R liberados (ao chegar ao nível 12 com o campeão)         |
| 2     | Cor alternativa da fantasia                                              |
| 3     | Começo alternativo: escolher 1 entre 3 tratos sem preço antes da rua 1-1 |
| 4     | Uma passiva alternativa para o campeão                                   |
| 5     | Título e moldura dourada no Diário                                       |

### Passivas alternativas (maestria 4)

| Campeão    | Passiva alternativa                                                                  |
| ---------- | ------------------------------------------------------------------------------------ |
| Bruxinha   | **Feitiço Instável:** habilidades têm 20% de chance de causar o dobro e 5% de falhar |
| Fantasma   | **Frio na Espinha:** inimigos atrás do Fantasma recebem +25% de dano                 |
| Esqueleto  | **Ossos Ocos:** sem Remontar, mas +30% de velocidade e de dano do E                  |
| Vampirinho | **Luz do Dia:** sem bônus na sombra, mas cura 5% da Coragem ao derrubar um Poste     |

### Diário do Bairro

- Registra cada trato, preço, Conjunto, inimigo, condição da noite, encontro raro e evolução já
  vistos, com a porcentagem de conclusão.
- Entradas não descobertas aparecem como silhuetas com uma dica ("Uma janela que só acende em
  vermelho").
- Fechar uma página (por exemplo, todos os tratos de Sombra) dá Doces Guardados.

### Moradores que lembram

- Se o jogador aceitou o trato de um morador na run anterior, ele cumprimenta na próxima e a
  pechincha com ele custa metade.
- Se recusou o mesmo morador 3 vezes, ele se ofende e aparece numa rua como uma versão elite de si
  mesmo, que dá o trato dele sem preço ao ser derrotada.
- Essas falas são curtas (1 linha) e usam o mesmo arquivo de textos do GDD.

### Desafio da semana

Além da semente da noite do GDD, uma vez por semana há uma run com regras fixas (por exemplo, "só
tratos de Abóbora" ou "todas as ruas com Neblina"), com recompensa de 200 Doces Guardados na primeira
vitória.

## Sensação, interface e primeira run

Cada acerto precisa ser sentido, e o jogador precisa entender a tela num relance, porque o fundo
cinza só funciona se a ação saltar dele. Os valores abaixo são o ponto de partida para o ajuste fino.

### Sensação de impacto

- Pausa de 0,05 s ao acertar uma habilidade e de 0,08 s em críticos e ao derrubar um Poste.
- Tremida de câmera de 3 px em explosões e no R, e de 6 px na queda de um Poste.
- Inimigos pequenos recuam 0,3 tile ao serem atingidos; elites e chefes não recuam.
- Cada acerto tem som próprio, mais agudo a cada acerto seguido em até 2 s (até 3 degraus).
- Números de dano sobem por 0,6 s; críticos são maiores e amarelos.
- Ao derrubar um Poste, a luz roxa se apaga com um estalo e a rua clareia por 1 s.
- Ao aceitar um trato, a câmera se afasta 1 s e mostra o preço sendo aplicado no bairro (o poste
  apagando, a casa ganhando olhos).

### Interface

- Embaixo à esquerda: barras de Coragem e Energia.
- Embaixo ao centro: Q, W, E e R com tecla, posto, recarga e o ícone da evolução escolhida; logo
  abaixo, a barra de Susto.
- Embaixo à direita: 5 itens e 2 consumíveis.
- Em cima à direita: Doces e o Relógio da Meia-Noite.
- Em cima ao centro: régua da rua com os dois Postes e o portão, e o pedido do morador.
- Em cima à esquerda: ícones dos tratos ativos, agrupados por marca, com o contador do próximo
  Conjunto.
- Barra fina de Coragem sobre cada inimigo e barra grande para elites e chefes.

### Primeira run

- A rua 1-1 da primeira run tem 90 s de dicas curtas na tela: andar, atacar, Q, luz e lanterna,
  Poste e portão.
- A primeira fase Porta a Porta mostra só 2 tratos, ambos com preço leve, e explica as marcas.
- O Susto e as evoluções aparecem com uma dica de uma linha na primeira vez.
- As dicas podem ser desligadas e não voltam depois da primeira vitória.

## Metas de teste dos ganchos

Os bots do GDD também medem os ganchos deste documento, para o agente saber se eles funcionam, e não
só se o jogo está equilibrado. As metas abaixo se somam às metas de balanceamento do GDD.

| Gancho    | Métrica                                               | Meta                                              |
| --------- | ----------------------------------------------------- | ------------------------------------------------- |
| Susto     | Frenesis por rua, bot médio / experiente              | 1 a 2 / 3 a 4                                     |
| Susto     | Tempo com o Susto em 50 ou mais, bot experiente       | 30% a 50% da rua                                  |
| Evoluções | Escolha de cada evolução                              | Nenhuma abaixo de 25% nem acima de 75% no par     |
| Conjuntos | Runs com ao menos 1 Conjunto de 4 completo            | 50% a 70%                                         |
| Conjuntos | Taxa de vitória de cada Conjunto de 4, bot experiente | Entre 45% e 75%, nenhum acima de 30% das vitórias |
| Rotas     | Escolha de cada condição da noite                     | 10% a 30% quando oferecida                        |
| Rotas     | Vitórias da rota do Bom Vizinho, bot experiente       | 10% a 25%                                         |
| Pedidos   | Pedidos cumpridos, bot médio                          | 35% a 60%                                         |
| Surpresas | Runs sem nenhum encontro raro                         | Menos de 10%                                      |
| Retorno   | Tempo entre a derrota e o início da nova run          | Menos de 10 s                                     |

O relatório dos bots deve listar as 5 builds com maior e menor taxa de vitória, para o agente
ajustar primeiro as que estão fora da faixa.

## Como entregar ao Claude Code

### O que muda no GDD

| Assunto            | No GDD                                              | Agora                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caminho no bairro  | 3 ruas em sequência                                 | 3 ruas, escolhendo 1 entre 2 portões após cada rua                                                                                                                                                                                     |
| Postes Corrompidos | Miravam as pestinhas primeiro (erro corrigido aqui) | Miram o Doce-isca primeiro; 50% menos dano com 3 ou mais pestinhas perto                                                                                                                                                               |
| Tratos             | 30 tratos sem marca                                 | 30 tratos com marcas e Conjuntos (12 do GDD com marca + 18 novos)                                                                                                                                                                      |
| Recusar tratos     | 80 doces                                            | 80 doces e uma Medalha de Bom Vizinho                                                                                                                                                                                                  |
| Controles          | Estilo MOBA (botão direito anda)                    | Estilo Minecraft Dungeons: WASD anda, botão esquerdo é o ataque básico manual (combo de 3 de perto, tiro reto da Bruxinha), botão direito, Q, E e R são as habilidades, Espaço rola, Shift é a lanterna (`docs/PLANO_JOGABILIDADE.md`) |
| Habilidades        | Postos de 1 a 5                                     | Evolução no posto 3 de Q, W e E; Despertar no posto 3 do R                                                                                                                                                                             |
| Consumíveis        | Pirulito e Bala Efervescente                        | Mais o Doce-isca (40 doces)                                                                                                                                                                                                            |
| Meta-progressão    | Álbum de Fantasias e Lua Cheia                      | Mais maestria, Diário do Bairro, moradores que lembram e desafio da semana                                                                                                                                                             |

Tudo que não aparece nesta tabela continua como no GDD.

### Decisões tiradas do complemento

Pontos que a primeira versão (4 páginas) deixava em aberto e que esta versão resolve:

| Assunto                    | Decisão                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cura na luz                | Só **postes amigos** curam (2% da Coragem por segundo, também em combate). Janelas só curam com o trato Janela Aberta; o Conjunto Luz de 2 e o Apagão Parcial dobram a cura.                                         |
| Controles                  | **Estilo MOBA:** botão direito move; Q, W, E e R são habilidades miradas no cursor; A + clique é "atacar e mover". O WASD do GDD sai, porque W e A colidem com habilidade e auto-ataque; as setas continuam movendo. |
| Pedidos, rotas e evoluções | Definidos nas seções acima.                                                                                                                                                                                          |

### Tarefas novas para TASKS.md

| #   | Tarefa                                                                                              | Entra depois da tarefa do GDD | Pronta quando                                                         |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| G1  | Regras de lançamento, auto-ataque, comando guardado e legibilidade (Minuto a minuto)                | 6                             | Testes dos tempos e do cancelamento passando                          |
| G2  | Medidor de Susto e Frenesi, com interface                                                           | 7                             | Bot médio entra em Frenesi de 1 a 2 vezes por rua                     |
| G3  | Doce-isca e prioridade dos Postes                                                                   | 7                             | Teste de mira dos Postes passando                                     |
| G4  | Marcas, Conjuntos e os 18 tratos novos, mais a Medalha de Bom Vizinho                               | 8                             | Os 6 Conjuntos ativam nos testes                                      |
| G5  | Portões com 2 rotas, condições da noite e pedidos dos moradores                                     | 9                             | Uma run de bairro 1 com escolha de rota em cada portão                |
| G6  | Evoluções de Q, W e E da Bruxinha, com a tela de escolha                                            | 9                             | As 6 evoluções funcionam e têm teste                                  |
| G7  | Evoluções e Despertares dos outros campeões                                                         | 11                            | As 18 evoluções restantes e os 8 Despertares dos 4 campeões têm teste |
| G8  | Baús, encontros raros e tratos lendários                                                            | 12                            | Regra de frequência validada em 500 runs simuladas                    |
| G9  | Tela de derrota, maestria, passivas alternativas, Diário, moradores que lembram e desafio da semana | 13                            | Progresso persiste e aparece na tela de derrota                       |
| G10 | Sensação de impacto e métricas dos ganchos no relatório dos bots                                    | 14                            | Metas de teste dos ganchos atingidas                                  |

**Se o tempo apertar,** corte nesta ordem: desafio da semana, moradores que lembram, passivas
alternativas, encontros raros (exceto o Gato Preto), tratos lendários e Despertares. Susto,
Conjuntos, evoluções e rotas são o núcleo do vício e devem ficar.

### Prompt de integração

```
Adicionei docs/GAMEPLAY.md, que complementa docs/GDD.md com o detalhamento do
combate e novos sistemas: Susto e Frenesi, evoluções de habilidade, marcas e
Conjuntos de tratos, rotas com condições da noite, pedidos dos moradores,
surpresas e progressão entre runs.

1. Leia docs/GAMEPLAY.md inteiro. Onde ele diverge do GDD, siga a tabela "O
que muda no GDD"; o resto do GDD continua valendo.
2. Não refaça o que já está pronto. Compare o estado atual do código com o
documento e liste em TASKS.md o que precisa ser ajustado nas tarefas já
concluídas.
3. Insira as tarefas G1 a G10 em TASKS.md, cada uma depois da tarefa do GDD
indicada.
4. Mantenha as regras de docs/ARQUITETURA.md: todo número e todo conteúdo novo em
content/*.json com Zod, cada efeito novo com teste e a simulação sem Phaser.
5. Acrescente ao relatório dos bots as métricas da seção "Metas de teste dos
ganchos".
6. Siga as tarefas na ordem, com testes, lint, build e commit a cada uma.
```
