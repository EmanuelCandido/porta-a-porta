# Relatório de balanceamento dos bots

Gerado em 18/10/2026 por `npm run bots`: 192 runs (bruxinha, fantasma, esqueleto, vampirinho), 3 bairros, perfis do GDD (`content/bots.json`). Cada run usa outra semente.

## Resumo por perfil

| Perfil     | Runs | Vence | Ruas vencidas | Rua (min) | Chefe (min) | Frenesis/rua | Susto ≥ 50 | Pedidos | Nível |
| ---------- | ---- | ----- | ------------- | --------- | ----------- | ------------ | ---------- | ------- | ----- |
| Iniciante  | 64   | 0%    | 0/64          | —         | —           | 0,2          | 3%         | —       | 1,4   |
| Médio      | 64   | 63%   | 467/488       | 3,5       | 2,0         | 3,5          | 35%        | 26%     | 10,7  |
| Experiente | 64   | 75%   | 493/508       | 3,6       | 2,1         | 3,8          | 40%        | 27%     | 11,0  |

## Por campeão

| Campeão    | Perfil     | Runs | Vence | Ruas vencidas | Rua (min) | Nível | Onde acaba                                                                     |
| ---------- | ---------- | ---- | ----- | ------------- | --------- | ----- | ------------------------------------------------------------------------------ |
| bruxinha   | Iniciante  | 16   | 0%    | 0/16          | —         | 1,1   | 1-1: 16                                                                        |
| bruxinha   | Médio      | 16   | 94%   | 139/140       | 2,7       | 11,8  | vitória: 15, 2-2: 1                                                            |
| bruxinha   | Experiente | 16   | 100%  | 144/144       | 2,8       | 12,0  | vitória: 16                                                                    |
| fantasma   | Iniciante  | 16   | 0%    | 0/16          | —         | 2,1   | 1-1: 16                                                                        |
| fantasma   | Médio      | 16   | 19%   | 77/89         | 3,2       | 8,7   | vitória: 3, 3-3: 3, 1-2: 2, 1-1: 2, 2-1: 2, 1-3: 1, 3-2: 1, 3-1: 1, chefe 1: 1 |
| fantasma   | Experiente | 16   | 63%   | 102/108       | 3,2       | 9,9   | vitória: 10, 1-2: 3, 1-3: 1, 2-2: 1, 2-1: 1                                    |
| esqueleto  | Iniciante  | 16   | 0%    | 0/16          | —         | 1,1   | 1-1: 16                                                                        |
| esqueleto  | Médio      | 16   | 44%   | 107/115       | 3,9       | 10,4  | vitória: 7, 3-1: 2, 3-2: 2, 1-1: 2, 3-3: 1, chefe 3: 1, 1-2: 1                 |
| esqueleto  | Experiente | 16   | 69%   | 110/115       | 3,7       | 10,1  | vitória: 11, 2-2: 2, 1-1: 2, 2-1: 1                                            |
| vampirinho | Iniciante  | 16   | 0%    | 0/16          | —         | 1,3   | 1-1: 16                                                                        |
| vampirinho | Médio      | 16   | 94%   | 144/144       | 4,2       | 12,0  | vitória: 15, chefe 3: 1                                                        |
| vampirinho | Experiente | 16   | 69%   | 137/141       | 4,5       | 11,9  | vitória: 11, 3-3: 3, chefe 3: 1, 2-3: 1                                        |

## Metas

| Meta                                                               | Alvo      | Medido |     |
| ------------------------------------------------------------------ | --------- | ------ | --- |
| Bot iniciante vence                                                | ≤ 10%     | 0%     | ✅  |
| Bot médio vence                                                    | 30% a 45% | 63%    | ❌  |
| Diferença de vitórias entre campeões, bot médio                    | ≤ 10%     | 75%    | ❌  |
| Campeão que menos vence o bairro 1, bot experiente                 | ≥ 50%     | 75%    | ✅  |
| Campeão que menos vence a run inteira, bot experiente              | ≥ 25%     | 63%    | ✅  |
| Bot experiente vence                                               | 60% a 75% | 75%    | ✅  |
| Duração de uma rua (min), bot médio                                | 2,5 a 3,5 | 3,5    | ❌  |
| Duração do chefe (min), bot médio                                  | 3,0 a 5,0 | 2,0    | ❌  |
| Frenesis por rua, bot médio                                        | 1,0 a 2,0 | 3,5    | ❌  |
| Frenesis por rua, bot experiente                                   | 3,0 a 4,0 | 3,8    | ✅  |
| Rua com o Susto em 50 ou mais, bot experiente                      | 30% a 50% | 40%    | ✅  |
| Pedidos cumpridos, bot médio                                       | 35% a 60% | 26%    | ❌  |
| Escolha de cada evolução (a menos escolhida do par), todos os bots | ≥ 25%     | 25%    | ✅  |
| Escolha de cada condição oferecida (faixa), bot experiente         | 10% a 30% | 42%    | ❌  |
| Trato mais presente nas vitórias, bot experiente                   | ≤ 45%     | 38%    | ✅  |
| Runs com ao menos 1 Conjunto de 4 completo, bot experiente         | 50% a 70% | 23%    | ❌  |
| Conjunto de 4 que menos vence, bot experiente                      | ≥ 45%     | 0%     | ❌  |
| Conjunto de 4 que mais vence, bot experiente                       | ≤ 75%     | 100%   | ❌  |
| Conjunto de 4 mais presente nas vitórias, bot experiente           | ≤ 30%     | 17%    | ✅  |
| Vitórias da rota do Bom Vizinho (até 1 trato), bot experiente      | 10% a 25% | 0%     | ❌  |
| Doces da Casa Desconfiada na run, bot médio                        | 8% a 15%  | 18%    | ❌  |
| Minijogos da Casa Desconfiada vencidos, bot médio                  | 60% a 80% | 71%    | ✅  |

- Diferença de vitórias entre campeões, bot médio: só o acaso já espalha quatro campeões iguais em cerca de 18 pontos com 32 runs cada e 9 com 128; a meta pede 128 runs por campeão.
- Campeão que menos vence o bairro 1, bot experiente: critério da tarefa 11: os bots vencem o bairro 1 com os 4 campeões.
- Campeão que menos vence a run inteira, bot experiente: critério da tarefa 12: os bots vencem a run inteira com os 4 campeões; as metas do GDD para a run ficam para o balanceamento final (tarefa 14).
- Escolha de cada condição oferecida (faixa), bot experiente: com 2 portões a escolha neutra é 50%; a meta do complemento vale com mais portões.
- Retorno (da derrota ao começo da nova run, meta abaixo de 10 s): é de tela, medido pelo Playwright em `tests/e2e/ganchos.spec.ts`.

## Doces por fonte

Doces soltos nas ruas (com o Susto e os tratos), e os minijogos da Casa Desconfiada.

| Perfil     | Inimigos | Campainha | Desconfiada | Baús | Exploração | Outros | Minijogos vencidos | Perfeitos |
| ---------- | -------- | --------- | ----------- | ---- | ---------- | ------ | ------------------ | --------- |
| Iniciante  | 94%      | 0%        | 0%          | 0%   | 4%         | 2%     | —                  | —         |
| Médio      | 66%      | 0%        | 18%         | 7%   | 7%         | 1%     | 71% de 820         | 30%       |
| Experiente | 67%      | 0%        | 16%         | 9%   | 8%         | 1%     | 85% de 804         | 25%       |

## Chefes

| Chefe    | Perfil     | Lutas | Vence | Luta vencida (min) | Coragem que sobrou nas derrotas |
| -------- | ---------- | ----- | ----- | ------------------ | ------------------------------- |
| Bairro 1 | Médio      | 56    | 98%   | 2,7                | 67%                             |
| Bairro 1 | Experiente | 58    | 100%  | 3,0                | —                               |
| Bairro 2 | Médio      | 52    | 100%  | 1,2                | —                               |
| Bairro 2 | Experiente | 52    | 100%  | 1,3                | —                               |
| Bairro 3 | Médio      | 42    | 95%   | 1,9                | 14%                             |
| Bairro 3 | Experiente | 49    | 98%   | 1,8                | 19%                             |

## Conjuntos de 4

Runs em que o Conjunto ficou completo, quantas venceram e a parte das vitórias do perfil.

| Conjunto | Perfil     | Runs | Vence | Parte das vitórias |
| -------- | ---------- | ---- | ----- | ------------------ |
| pacto    | Médio      | 2    | 100%  | 5%                 |
| luz      | Médio      | 1    | 100%  | 3%                 |
| luz      | Experiente | 9    | 89%   | 17%                |
| pacto    | Experiente | 3    | 100%  | 6%                 |
| abobora  | Experiente | 2    | 100%  | 4%                 |
| doce     | Experiente | 1    | 0%    | 0%                 |

## Builds que mais e que menos vencem

Campeão + Conjuntos ativos no fim da run, todos os perfis, com 3 runs ou mais.

| Mais vencem                    | Runs | Vence |
| ------------------------------ | ---- | ----- |
| bruxinha + abobora 2 + luz 2   | 5    | 100%  |
| vampirinho + abobora 2 + luz 2 | 4    | 100%  |
| vampirinho + doce 2 + pacto 2  | 4    | 100%  |
| bruxinha + luz 2               | 3    | 100%  |
| bruxinha + doce 2              | 3    | 100%  |

| Menos vencem     | Runs | Vence |
| ---------------- | ---- | ----- |
| fantasma         | 31   | 3%    |
| esqueleto        | 23   | 4%    |
| bruxinha         | 19   | 11%   |
| vampirinho       | 19   | 16%   |
| fantasma + luz 2 | 4    | 50%   |

## Surpresas (regra de frequência)

500 runs simuladas sem luta (4500 ruas), contando o que o sorteio pôs no caminho.

| Regra                                   | Medido           |     |
| --------------------------------------- | ---------------- | --- |
| No máximo 1 encontro raro por rua       | 1                | ✅  |
| Ao menos 1 baú raro por bairro          | 100% dos bairros | ✅  |
| Carrinho de Pipoca uma vez por run      | 1 a 1            | ✅  |
| Runs sem nenhum encontro raro (até 10%) | 0%               | ✅  |

- Encontros por rua: Gato Preto 35%, Carrinho de Pipoca 11%, Festa na Garagem 9%, Criança Perdida 8%.
- Baús: comum 64%, raro 31%, amaldiçoado 5%.
- Janela Vermelha: 5% das fases Porta a Porta.

## Onde as runs acabam

| Perfil     | 1-1 | 1-2 | 1-3 | chefe 1 | 2-1 | 2-2 | 2-3 | 3-1 | 3-2 | 3-3 | chefe 3 | vitória |
| ---------- | --- | --- | --- | ------- | --- | --- | --- | --- | --- | --- | ------- | ------- |
| Iniciante  | 64  | 0   | 0   | 0       | 0   | 0   | 0   | 0   | 0   | 0   | 0       | 0       |
| Médio      | 4   | 3   | 1   | 1       | 2   | 1   | 0   | 3   | 3   | 4   | 2       | 40      |
| Experiente | 2   | 3   | 1   | 0       | 2   | 3   | 1   | 0   | 0   | 3   | 1       | 48      |

## O que mais machuca (dano recebido, todos os perfis)

| Quem             | Dano  | Parte |
| ---------------- | ----- | ----- |
| pestinha_lencol  | 48370 | 22%   |
| morceguinho      | 36301 | 17%   |
| arremessador     | 34319 | 16%   |
| poste_corrompido | 28727 | 13%   |
| abobora_canhao   | 14478 | 7%    |
| sindico_zeloso   | 10999 | 5%    |
| cobrador         | 10788 | 5%    |
| dono_do_bairro   | 10630 | 5%    |

## Evoluções escolhidas (todos os perfis)

| Habilidade   | A   | B   |
| ------------ | --- | --- |
| bruxinha_q   | 14  | 18  |
| bruxinha_w   | 18  | 13  |
| bruxinha_e   | 10  | 21  |
| bruxinha_r   | 10  | 21  |
| fantasma_q   | 9   | 17  |
| fantasma_w   | 10  | 11  |
| fantasma_e   | 9   | 9   |
| fantasma_r   | 10  | 8   |
| esqueleto_q  | 12  | 15  |
| esqueleto_w  | 16  | 10  |
| esqueleto_e  | 14  | 10  |
| esqueleto_r  | 10  | 14  |
| vampirinho_q | 9   | 23  |
| vampirinho_w | 14  | 18  |
| vampirinho_e | 24  | 8   |
| vampirinho_r | 13  | 18  |

## Condições da noite (escolhida / oferecida)

| Condição       | Iniciante | Médio   | Experiente |
| -------------- | --------- | ------- | ---------- |
| apagao         | —         | 21/43   | 22/40      |
| chuva_de_doces | —         | 9/24    | 15/21      |
| festa          | —         | 25/53   | 33/71      |
| lua_vermelha   | —         | 34/55   | 27/57      |
| neblina        | —         | 34/56   | 25/60      |
| noite_comum    | —         | 116/196 | 118/210    |
| silencio       | —         | 41/81   | 56/83      |
| ventania       | —         | 37/69   | 38/61      |
