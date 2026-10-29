import { packager } from '@electron/packager';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projeto = JSON.parse(await readFile(join(raiz, 'package.json'), 'utf8'));
const identidade = JSON.parse(await readFile(join(raiz, 'content/publicacao.json'), 'utf8'));
const preparo = join(raiz, 'test-results', `preparo-windows-${Date.now()}`);
const entregas = join(raiz, 'entregas');
await mkdir(preparo, { recursive: true });
await mkdir(entregas, { recursive: true });
await cp(join(raiz, 'dist'), join(preparo, 'jogo'), { recursive: true });
await cp(join(raiz, 'desktop/principal.mjs'), join(preparo, 'principal.mjs'));
await writeFile(
  join(preparo, 'package.json'),
  JSON.stringify({
    name: projeto.name,
    version: projeto.version,
    main: 'principal.mjs',
    type: 'module',
    author: identidade.autor,
    description: projeto.description,
  }),
);

const [pastaWindows] = await packager({
  dir: preparo,
  name: identidade.nome,
  executableName: identidade.nome,
  appVersion: projeto.version,
  electronVersion: projeto.devDependencies.electron,
  platform: 'win32',
  arch: 'x64',
  out: entregas,
  overwrite: true,
  asar: true,
  prune: false,
  icon: join(raiz, 'public/favicon.ico'),
  appCopyright: `© 2026 ${identidade.autor}`,
  win32metadata: {
    CompanyName: identidade.autor,
    FileDescription: `${identidade.nome} — ${identidade.subtitulo}`,
    ProductName: identidade.nome,
  },
});
await cp(join(raiz, 'public/creditos.html'), join(pastaWindows, 'CREDITOS.html'));
await cp(join(raiz, 'public/licencas'), join(pastaWindows, 'licencas'), { recursive: true });
await writeFile(
  join(pastaWindows, 'LEIA-ME.txt'),
  [
    'PORTA A PORTA — UMA NOITE DE HALLOWEEN',
    `Criação e design: ${identidade.autor}`,
    '',
    'COMO JOGAR NO WINDOWS',
    '1. Clique com o botão direito no ZIP e escolha Extrair tudo.',
    '2. Abra a pasta extraída.',
    '3. Dê dois cliques em Porta a Porta.exe.',
    'Pronto. Não precisa instalar nada nem usar terminal. Funciona sem internet.',
    'Mantenha o executável junto dos arquivos e pastas que vieram no ZIP.',
    '',
    'Windows 10 ou 11 de 64 bits. Mouse e teclado.',
    'F11: tela cheia. Esc: pausa. M: som.',
    'Comece pela Noite curta; o jogo apresenta as dicas na primeira partida.',
    'Se houver queda de FPS: no título, abra Desempenho (O) e escolha Leve.',
    'Seu progresso é salvo automaticamente neste computador.',
    'O progresso desta versão e o do navegador são separados.',
    '',
    'CONTROLES',
    'WASD ou setas: andar. Mouse: mirar. Botão esquerdo: ataque básico.',
    'Botão direito, Q, E e R: habilidades (segure para mirar e solte para lançar).',
    'Espaço: rolar. Shift: lanterna. F: interagir. G: travessura.',
    '1 e 2: consumíveis. Ctrl + habilidade: subir o posto quando houver ponto.',
    '',
    'Créditos e licenças: veja o arquivo CREDITOS.html nesta pasta.',
    'LICENSE e LICENSES.chromium.html contêm as licenças do motor incluído.',
    '',
  ].join('\r\n'),
  'utf8',
);

// O ZIP HTML contém somente dist; o ZIP Windows contém somente o aplicativo pronto.
const compactar = spawnSync(
  'python',
  [join(raiz, 'scripts/compactar-entregas.py'), join(raiz, 'dist'), pastaWindows, entregas],
  { stdio: 'inherit' },
);
if (compactar.status !== 0) process.exit(compactar.status ?? 1);
console.log(`Pacotes prontos em ${entregas}`);
