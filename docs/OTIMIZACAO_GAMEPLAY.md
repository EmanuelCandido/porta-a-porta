# Otimização da gameplay — 18/10/2026

Aplicação do plano solicitado após o teste em outro computador, semelhante ao do autor, com
vídeo integrado. O relato foi de quedas tanto no navegador quanto no executável e FPS baixo
no começo de toda run, aumentando depois. O retorno do teste real está registrado a seguir.

Após a publicação desta otimização, o autor relatou um novo teste no computador e **60 FPS
estáveis**. É um relato de uso real; as tabelas de SwiftShader abaixo continuam sendo uma medição
separada. A pedido do autor, o menu dos jogadores conserva apenas qualidade e retorno, sem
instrução de teste nem botão de relatório.

## Implementação

- A rua prepara o chão próximo, os carimbos de luz e as poses essenciais da fantasia antes de
  liberar controles e ticks. A interface apresenta “Preparando a noite…”. O cronômetro da
  simulação fica parado durante essa etapa. O tempo de entrada também é medido.
- As poses novas são rasterizadas em um Worker com OffscreenCanvas. A tela usa uma pose já
  disponível enquanto aguarda. Há uma tarefa de cada vez e uma reserva síncrona para navegadores
  sem esse recurso; a fila respeita tempo por quadro. O Worker é encerrado ao sair da rua.
- Chão e carimbos de sombra usam um orçamento em milissegundos. Um índice espacial busca apenas
  os obstáculos próximos da luz. Alterar um objeto invalida as sombras que alcançam sua área.
- A iluminação é dimensionada pela câmera e pelo zoom mínimo necessário, com redimensionamento
  real das texturas. Leve usa metade da largura e da altura; Média usa 75%; Alta usa resolução
  integral. Raios e regras de luz da simulação não são alterados.
- O recorte de entidades ocorre antes de criar figuras ou calcular suas poses, luz e barras.
  A simulação das entidades fora da câmera continua rodando normalmente.
- Barras comuns mantêm a geometria até mudar o valor ou estado; a posição acompanha a entidade.
  Os encantos conservam os pulsos. O relógio tem um desenho separado dos ícones de itens e poderes.
  O HUD atualiza no máximo a cada 33 ms e acumula o tempo das animações entre atualizações.
- Números flutuantes são reutilizados. A quantidade de folhas, fumaça e morcegos decorativos
  segue a qualidade. As áreas vermelhas de ataques e os projéteis permanecem legíveis.
- Texturas locais de chão e sombras são liberadas na saída. O minimapa remove as texturas do mapa
  anterior. Os modelos reutilizáveis têm cache LRU de 128 MiB; desenhos em uso e sombras
  compartilhadas são protegidos. O limite é aplicado ao liberar uma cena, sem expulsar imagens
  que ainda estão sendo desenhadas.

## Como testar no outro computador

1. No título, abrir **Desempenho (O)** e escolher **Leve** antes de iniciar a run.
2. Jogar pelo menos 30 segundos, andar, atacar e experimentar a primeira onda.
3. Repetir o mesmo percurso com Média ou Alta para comparar a fluidez.

O diagnóstico permanece interno para o desenvolvimento e para `scripts/medir-gameplay.mjs`.
O menu publicado não pede ao jogador que execute testes ou exporte arquivos.

A escolha é salva separadamente do progresso. Na pausa, a nova qualidade passa a valer ao entrar
na próxima rua. O padrão continua Alta. A qualidade automática fica para uma etapa posterior,
orientada pelas medições do aparelho, conforme o plano aprovado.

## Medição

`npm run medir:gameplay` mede o build publicado pelo caminho título → semente da noite → fantasia
→ run. A mesma aba é usada nos reinícios; cada trecho dura 30 segundos. Há movimento aos 5 segundos
e 30 pestinhas extras aos 10 segundos, com ataque básico e Q. O relatório separa 0–5, 5–15 e
15–30 segundos, informa média, p95, p99, pior quadro e quantos passaram de 50/100 ms.

O primeiro intervalo que cruza a transição é descartado: ele pertence também ao carregamento,
cuja duração é registrada em `ateJogavelMs`. As pausas de fim de run ficam fora dos trechos.
As amostras preservam os engasgos durante o trecho jogável.

O relatório exportado pelo jogo contém os primeiros 30 segundos, uma janela limitada de quadros
recentes e até dez ruas. Registra qualidade, ambiente, tempos da CenaRua por etapa e uma estimativa
dos pixels das texturas vivas. CPU da CenaRua não inclui o custo total de GPU, renderização ou HUD.
Pixels estimados e uploads acumulados não equivalem à VRAM total do processo. O relatório do jogo
não força coleta de lixo; o script coleta após cada trecho para comparar o heap entre runs.

Resultados comparativos e limitações do ambiente estão em `DESEMPENHO.md`.

## Validação

Os testes cobrem o orçamento de tempo, a consulta espacial, percentis, a proteção de sombras
compartilhadas no cache, preparo com ticks parados, níveis salvos, retorno pelo mouse e
reserva sem Worker. A verificação completa inclui a suíte já existente, screenshots e o aplicativo
Windows empacotado. Os resultados finais são registrados em `TASKS.md`.

O alvo no PC com vídeo integrado é 30 FPS estáveis no modo Leve, buscando 60 onde houver capacidade.
As medidas de Chromium com SwiftShader servem para comparar builds e não comprovam esse alvo.
