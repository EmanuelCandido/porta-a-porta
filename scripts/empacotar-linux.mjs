import { packager } from '@electron/packager';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux')
  throw new Error('O instalador .deb deve ser gerado em Linux; veja docs/LINUX.md.');

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projeto = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8'));
const identidade = JSON.parse(await readFile(join(raiz, 'content/publicacao.json'), 'utf8'));
const preparo = await mkdtemp(join(tmpdir(), 'porta-a-porta-linux-'));
const origem = join(preparo, 'origem');
const instalacao = join(preparo, 'instalacao');
const aplicativo = join(instalacao, 'opt/porta-a-porta');
const entregas = join(raiz, 'entregas');

function executar(programa, argumentos) {
  const resultado = spawnSync(programa, argumentos, { stdio: 'inherit' });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`${programa} terminou com erro ${resultado.status}.`);
}

try {
  await mkdir(origem, { recursive: true });
  await mkdir(entregas, { recursive: true });
  await cp(join(raiz, 'dist'), join(origem, 'jogo'), { recursive: true });
  await cp(join(raiz, 'desktop/principal.mjs'), join(origem, 'principal.mjs'));
  await writeFile(
    join(origem, 'package.json'),
    JSON.stringify({
      name: projeto.name,
      version: projeto.version,
      main: 'principal.mjs',
      type: 'module',
      author: identidade.autor,
      description: projeto.description,
    }),
  );
  const [pasta] = await packager({
    dir: origem,
    name: identidade.nome,
    executableName: 'porta-a-porta',
    appVersion: projeto.version,
    electronVersion: projeto.devDependencies.electron,
    platform: 'linux',
    arch: 'x64',
    out: join(preparo, 'pacote'),
    asar: true,
    prune: false,
    appCopyright: `© 2026 ${identidade.autor}`,
  });
  await mkdir(dirname(aplicativo), { recursive: true });
  await cp(pasta, aplicativo, { recursive: true });
  await cp(join(raiz, 'public/creditos.html'), join(aplicativo, 'CREDITOS.html'));
  await cp(join(raiz, 'public/licencas'), join(aplicativo, 'licencas'), { recursive: true });

  let bytesInstalados = 0;
  const ajustarPermissoes = async (diretorio) => {
    await chmod(diretorio, 0o755);
    for (const item of await readdir(diretorio, { withFileTypes: true })) {
      const arquivo = join(diretorio, item.name);
      if (item.isDirectory()) await ajustarPermissoes(arquivo);
      else if (item.isFile()) {
        bytesInstalados += (await stat(arquivo)).size;
        const modo =
          item.name === 'chrome-sandbox'
            ? 0o4755
            : item.name === 'porta-a-porta' || item.name === 'chrome_crashpad_handler'
              ? 0o755
              : 0o644;
        await chmod(arquivo, modo);
      }
    }
  };
  await ajustarPermissoes(aplicativo);

  const atalhos = join(instalacao, 'usr/share/applications');
  const icones = join(instalacao, 'usr/share/icons/hicolor/256x256/apps');
  const documentos = join(instalacao, 'usr/share/doc/porta-a-porta');
  const controle = join(instalacao, 'DEBIAN');
  for (const diretorio of [atalhos, icones, documentos, controle])
    await mkdir(diretorio, { recursive: true });
  await cp(join(raiz, 'public/favicon.png'), join(icones, 'porta-a-porta.png'));
  await writeFile(
    join(atalhos, 'porta-a-porta.desktop'),
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${identidade.nome}`,
      `Comment=${identidade.subtitulo}`,
      'Exec=/opt/porta-a-porta/porta-a-porta',
      'Icon=porta-a-porta',
      'Terminal=false',
      'Categories=Game;ActionGame;',
      'StartupWMClass=Porta a Porta',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(documentos, 'LEIA-ME.txt'),
    [
      'PORTA A PORTA — UMA NOITE DE HALLOWEEN',
      `Criação e design: ${identidade.autor}`,
      '',
      'LINUX — UBUNTU, DEBIAN E DERIVADOS, 64 BITS (AMD64)',
      '1. Abra o arquivo .deb com o instalador de aplicativos da sua distribuição.',
      '2. Clique em Instalar e conclua a instalação.',
      '3. Procure Porta a Porta no menu de aplicativos e abra o jogo.',
      'Não precisa de terminal. Depois de instalado, o jogo funciona sem internet.',
      'O instalador pode baixar bibliotecas do sistema na primeira instalação.',
      '',
      'Mouse e teclado. F11: tela cheia. Esc: pausa. M: som.',
      'Comece pela Noite curta. Se precisar, abra Desempenho (O) e escolha Leve.',
      'Seu progresso é salvo automaticamente neste computador.',
      'Os saves do navegador, Windows e Linux são separados.',
      '',
      'Créditos: /opt/porta-a-porta/CREDITOS.html e pasta licencas no mesmo local.',
      'LICENSE e LICENSES.chromium.html contêm as licenças do motor incluído.',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(controle, 'control'),
    [
      'Package: porta-a-porta',
      `Version: ${projeto.version}-1`,
      'Section: games',
      'Priority: optional',
      'Architecture: amd64',
      `Maintainer: ${identidade.autor} <EmanuelCandido@users.noreply.github.com>`,
      `Installed-Size: ${Math.ceil(bytesInstalados / 1024)}`,
      // Ubuntu 24.04+ e Debian 13 renomearam algumas bibliotecas com o sufixo t64.
      'Depends: libc6 (>= 2.31), libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2 | libasound2t64, libgbm1, libx11-xcb1, libdrm2, libxss1, libxshmfence1',
      'Homepage: https://emanuelcandido.itch.io/porta-a-porta',
      'Description: Porta a Porta — Uma noite de Halloween',
      ' Jogo de ação isométrica para um jogador, com exploração, fantasias e tratos.',
      ' Inclui o motor de execução. Funciona sem internet depois de instalado.',
      '',
    ].join('\n'),
  );
  executar('desktop-file-validate', [join(atalhos, 'porta-a-porta.desktop')]);
  const destino = join(entregas, 'porta-a-porta-linux-amd64.deb');
  executar('dpkg-deb', ['--build', '--root-owner-group', '-Zgzip', '-z6', instalacao, destino]);
  executar('dpkg-deb', ['--info', destino]);
  console.log(`Instalador Linux pronto: ${destino}`);
} finally {
  await rm(preparo, { recursive: true, force: true });
}
