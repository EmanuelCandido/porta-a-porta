# Linux — instalador e verificação

Versão de 64 bits, arquitetura amd64, em `entregas/porta-a-porta-linux-amd64.deb`.
Destinada a Ubuntu, Debian e distribuições derivadas com ambiente gráfico. O jogo e o motor
Electron acompanham o instalador; as bibliotecas gráficas e de áudio são dependências do sistema.

## Para jogar

1. Baixar o arquivo `.deb` na página do jogo.
2. Abri-lo com o instalador de aplicativos da distribuição e escolher **Instalar**.
3. Abrir **Porta a Porta** no menu de aplicativos.

Não há comandos de terminal para o jogador. A instalação pode baixar dependências; o jogo
instalado funciona sem internet. O progresso fica no perfil local do Linux e é separado dos
saves do Windows e do navegador. Créditos em `/opt/porta-a-porta/CREDITOS.html`.

## Para gerar a entrega

O `dist/` deve ser o mesmo build validado para navegador e Windows. Em Linux, `npm run
empacotar:linux` faz o build e gera o instalador. `scripts/empacotar-linux.mjs` usa Electron
Packager e `dpkg-deb`, com dono root no arquivo de instalação, permissões de execução, ícone PNG
e atalho `.desktop`. O pacote contém apenas arquivos de execução, créditos e licenças.

O [formato Debian](https://www.debian.org/doc/manuals/debian-handbook/packaging-system.en.html)
inclui os metadados e os arquivos instaláveis; a geração usa a ferramenta nativa `dpkg-deb`.
`chrome-sandbox` permanece com as permissões do auxiliar de sandbox, sem argumentos que desativem
a proteção no executável ou no atalho publicado.

Comandos usados no Windows (Docker Desktop ligado; o `dist/` vem de `npm run build` no Windows,
porque o `node_modules` da pasta é do Windows e o empacotamento só precisa de JavaScript):

```bash
docker build -f desktop/Dockerfile.linux -t porta-a-porta-linux desktop
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/trabalho" -w /trabalho porta-a-porta-linux node scripts/empacotar-linux.mjs
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/trabalho" -w /trabalho porta-a-porta-linux sh scripts/verificar-linux.sh
```

O `Depends` aceita os nomes `t64` das bibliotecas renomeadas no Ubuntu 24.04 e no Debian 13
(`libasound2 | libasound2t64`, `libgtk-3-0 | libgtk-3-0t64`). A instalação pelo `apt` foi
conferida em contêineres Ubuntu 22.04 e 24.04, sem biblioteca faltando no `ldd`.

No host Windows desta sessão, `desktop/Dockerfile.linux` fornece Debian 12, Node 24, bibliotecas,
Xvfb e Openbox para empacotar e verificar. A imagem é construída com contexto restrito a
`desktop/`; fontes e arquivos de trabalho não são copiados para ela. A pasta do projeto é
montada apenas durante os comandos locais de build e teste.

## Verificação

`npm run test:linux` executa `scripts/verificar-aplicativo.mjs` contra o aplicativo instalado em
`/opt/porta-a-porta`. Usa um perfil novo, verifica título, escolha de qualidade, Worker,
entrada na partida, áudio, tela cheia, preferências persistentes e ausência de HTTP e de Node
no renderizador. As capturas ficam em `test-results/screenshots/linux-*.png`.

O contêiner de QA usa Xvfb e não fornece os namespaces de sandbox do host ao Chromium. Somente
esse teste pode receber `PORTA_A_PORTA_TESTE_CONTAINER=1`; a opção não entra nos arquivos
publicados. Essa distinção segue a orientação de
[sandbox do Electron](https://www.electronjs.org/docs/latest/tutorial/sandbox#disabling-chromiums-sandbox-testing-only).
O teste em contêiner verifica a execução do aplicativo, não a integração de cada distribuição
gráfica ou o desempenho numa GPU Linux real. Os resultados da entrega ficam em `PUBLICACAO.md`.
