# Desempenho medido

Gerado por `npm run medir` (`scripts/medir.mjs`, passo O1 do `docs/PLANO_OTIMIZACAO.md`): o
build de produção no `vite preview`, Chromium do Playwright sem placa de vídeo (SwiftShader),
janela de 1280×720, `devicePixelRatio` 1. Cada cena abre numa aba nova; depois de pronta, espera
3 s e amostra 5 s de quadros.

- **Até jogável**: da navegação até `window.__portaAPorta.pronta`.
- **Quadro**: intervalo entre requestAnimationFrame (médio, percentil 95 e pior).
- **Canvases**: `document.createElement('canvas')` desde a abertura (as texturas assadas).
- **Texturas na GPU**, nas tabelas históricas: soma dos bytes enviados por `texImage2D`
  (largura × altura × 4). São uploads acumulados, não a memória viva nem a VRAM total.
- **Heap do JS**: `performance.memory.usedJSHeapSize` no fim, depois de uma coleta de lixo.
- **Áudio decodificado**: soma dos `AudioBuffer` de `decodeAudioData` (amostras de 32 bits).
- **Baixado**: `transferSize` de tudo o que a aba baixou (o preview serve o JS com gzip).

Sem GPU os quadros saem bem mais lentos que num navegador comum: os tempos servem para comparar
antes e depois, não como valor absoluto. A medida varia de uma rodada para outra (±15% nos
quadros e no tempo até jogável); só diferenças maiores que isso contam.

<!-- medições: a mais nova primeiro -->

## 18/10/2026 · O9: começo da run, reinícios e qualidade manual (sobre 5af6fdf)

Medição nova com `scripts/medir-gameplay.mjs`, separada do método histórico acima. Três runs de
30 segundos pela mesma semente da noite, na mesma aba, com movimento aos 5 s e 30 pestinhas
extras aos 10 s, ataque básico e Q. Janela 1280 × 720, DPR 1; nenhuma outra suíte em execução.
Os comandos foram os mesmos nos builds anterior e novo. O passo fixo pode avançar quantidades
diferentes sob lentidão: não é uma reprodução determinística de todos os ticks.

Embora iniciado sem forçar `--software`, o Chromium informou **ANGLE / SwiftShader**, com
renderização por software. Os números comparam esse ambiente; não medem o PC com vídeo integrado
usado pelo autor e não comprovam 30 ou 60 FPS nesse aparelho.

| Medida                                     | Anterior                   | Novo, Alta               | Novo, Leve               |
| ------------------------------------------ | -------------------------- | ------------------------ | ------------------------ |
| Entrada na primeira run                    | 2,25 s                     | 5,08 s                   | 4,12 s                   |
| Entrada nas runs 2 / 3                     | 1,11 / 0,98 s              | 1,92 / 1,76 s            | 2,02 / 1,89 s            |
| Quadro médio, runs 1 / 2 / 3               | 118,0 / 94,8 / 94,2 ms     | 93,8 / 81,7 / 80,9 ms    | 92,6 / 96,2 / 85,8 ms    |
| p95, runs 1 / 2 / 3                        | 150,0 / 116,8 / 116,7 ms   | 116,7 / 100,0 / 100,0 ms | 116,7 / 116,7 / 100,1 ms |
| Pior quadro, runs 1 / 2 / 3                | 1.283,2 / 999,9 / 849,9 ms | 133,4 / 116,7 / 116,6 ms | 150,0 / 116,8 / 116,7 ms |
| Primeiros 5 s da primeira run: média / p95 | 176,7 / 500,0 ms           | 79,8 / 99,9 ms           | 80,9 / 100,0 ms          |
| Heap após coleta, terceira run             | 435,3 MiB                  | 346,7 MiB                | 346,3 MiB                |

O ganho mais consistente foi a redução das pausas de 0,85–1,28 s durante a gameplay para até
150 ms nessas amostras. Parte do trabalho passou para a preparação visível, que fica mais longa
antes de liberar os controles. O Retorno após derrota continuou abaixo da meta: 8,0 s de relógio
de parede no teste isolado, incluindo a apresentação da derrota e a carga da run seguinte.

O modo Leve não apresentou ganho consistente no quadro médio frente ao Alta neste teste por
software. Ele reduz a resolução da luz, as sombras das figuras, direções e partículas decorativas;
isso precisa ser comparado na GPU integrada real. Não se deve prometer ganho de FPS a partir
apenas dessa comparação. As texturas vivas estimadas na terceira run foram 210,9 MiB em Alta e
199,5 MiB em Leve; essa estimativa RGBA também não é VRAM total.

Arquivos brutos locais, ignorados pelo Git: `test-results/desempenho/base-gameplay-final.json`,
`otimizado-alta-2poses.json` e `otimizado-leve-final.json`. As capturas `desempenho-alta.png` e
`desempenho-leve.png` esperam a simulação chegar a 90 ticks, após a abertura; capturar apenas ao
receber `pronta` pegava a transição preta e fazia a cena parecer escura demais.

Auditoria adicional: dez reinícios de 3 s em Leve, variando a semente, com coleta de lixo após
cada trecho. Heap entre 306,7 e 363,8 MiB; primeira run 338,7 MiB e décima 350,8 MiB. Nas três
últimas, as texturas vivas estimadas oscilaram de 207,9 a 222,9 MiB, com 1.020–1.024 texturas.
Não houve crescimento contínuo nessa amostra. Isso verifica reinícios curtos; não substitui uma
sessão longa atravessando os três bairros nem mede a VRAM do processo. Dados em
`test-results/desempenho/memoria-10-runs.json`. O teto de 128 MiB vale para o cache de modelos sem
uso; ele não é um teto para todas as texturas da aplicação ou para os desenhos ativos.

## 18/10/2026 · depois do O4.1 (música em streaming) (sobre ef72d8b)

| Cena (semente 5)      | Até jogável | Quadro médio / p95 / pior | Canvases | Texturas na GPU | Heap do JS | Áudio decodificado | Baixado |
| --------------------- | ----------- | ------------------------- | -------- | --------------- | ---------- | ------------------ | ------- |
| Título                | 6,2 s       | 110 / 117 / 2.167 ms      | 566      | 247 MB          | 243 MB     | 0 MB               | 3,3 MB  |
| Rua 1, de dia         | 5,9 s       | 38 / 50 / 100 ms          | 1.054    | 232 MB          | 250 MB     | 16 MB              | 5,2 MB  |
| Rua 1, de noite       | 5,5 s       | 79 / 117 / 2.017 ms       | 1.104    | 241 MB          | 255 MB     | 16 MB              | 5,2 MB  |
| Rua 1 com 30 inimigos | 5,5 s       | 89 / 167 / 2.300 ms       | 1.128    | 243 MB          | 254 MB     | 16 MB              | 5,2 MB  |
| Chefe do bairro 1     | 4,1 s       | 58 / 167 / 183 ms         | 743      | 180 MB          | 177 MB     | 16 MB              | 4,2 MB  |

O que mudou: a música (rua, combate, chefe, título) toca por `<audio>` em streaming, e o áudio
decodificado cai de 69 para 16 MB; os 16 MB que sobram são os efeitos curtos (O4.3: carregar só
os da rua e da fantasia da vez). O navegador guarda só alguns segundos de cada faixa, fora do
heap do JS e desta conta. O "Baixado" também cai (6,5 → 5,2 MB) porque as faixas chegam aos
poucos, enquanto tocam. A diferença nos quadros fica dentro da variação entre rodadas.

## 18/10/2026 · depois do O3.1 (texturas a 1,2× com DPR 1) (sobre 91466c6)

| Cena (semente 5)      | Até jogável | Quadro médio / p95 / pior | Canvases | Texturas na GPU | Heap do JS | Áudio decodificado | Baixado |
| --------------------- | ----------- | ------------------------- | -------- | --------------- | ---------- | ------------------ | ------- |
| Título                | 6,3 s       | 107 / 133 / 2.000 ms      | 566      | 247 MB          | 243 MB     | 0 MB               | 3,3 MB  |
| Rua 1, de dia         | 5,9 s       | 38 / 83 / 100 ms          | 1.054    | 232 MB          | 249 MB     | 69 MB              | 6,5 MB  |
| Rua 1, de noite       | 5,6 s       | 76 / 117 / 1.917 ms       | 1.104    | 241 MB          | 255 MB     | 69 MB              | 6,5 MB  |
| Rua 1 com 30 inimigos | 5,6 s       | 60 / 150 / 2.050 ms       | 1.142    | 243 MB          | 256 MB     | 69 MB              | 6,5 MB  |
| Chefe do bairro 1     | 4,2 s       | 75 / 150 / 1.800 ms       | 759      | 182 MB          | 184 MB     | 47 MB              | 5,5 MB  |

O que mudou: os modelos assados (personagens, casas, objetos) passaram de ~176 MB para ~64 MB
na GPU (−64%, como previsto: 1,2² / 2² dos pixels), o heap caiu ~85 MB (o assado das malhas
guarda menos amostras) e a rua fica pronta ~0,9 s antes. O total na GPU caiu só 27% porque o
resto não depende dessa resolução: o chão assado em 28 blocos de 1024×1024 (112 MB) e as quatro
camadas do tamanho da tela da escuridão e do ar (2342×1092, 39 MB). Os dois ficam para o O3 e o
O6 (blocos de chão menores ou em meia resolução, guardar menos blocos; escuridão em meia
resolução).

## 18/10/2026 · base, antes do O3.1 e do O4.1 (sobre e24f01e)

| Cena (semente 5)      | Até jogável | Quadro médio / p95 / pior | Canvases | Texturas na GPU | Heap do JS | Áudio decodificado | Baixado |
| --------------------- | ----------- | ------------------------- | -------- | --------------- | ---------- | ------------------ | ------- |
| Título                | 7,3 s       | 83 / 150 / 167 ms         | 562      | 314 MB          | 327 MB     | 0 MB               | 3,3 MB  |
| Rua 1, de dia         | 6,8 s       | 40 / 83 / 100 ms          | 1.054    | 317 MB          | 334 MB     | 69 MB              | 6,5 MB  |
| Rua 1, de noite       | 6,5 s       | 80 / 117 / 1.967 ms       | 1.104    | 326 MB          | 339 MB     | 69 MB              | 6,5 MB  |
| Rua 1 com 30 inimigos | 6,6 s       | 60 / 133 / 2.117 ms       | 1.134    | 328 MB          | 340 MB     | 69 MB              | 6,5 MB  |
| Chefe do bairro 1     | 4,9 s       | 77 / 133 / 1.867 ms       | 753      | 245 MB          | 236 MB     | 47 MB              | 5,5 MB  |
