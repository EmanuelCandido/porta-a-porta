import { app, BrowserWindow, dialog, Menu, net, protocol, session } from 'electron';
import { mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// O mesmo build do navegador, com Chromium incluído e uma origem local estável para o save.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'portaaporta',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app.setName('Porta a Porta');
const emTeste = process.env.PORTA_A_PORTA_TESTE === '1';
const pastaDoPerfil =
  process.env.PORTA_A_PORTA_PERFIL ?? join(app.getPath('appData'), 'Porta a Porta');
mkdirSync(pastaDoPerfil, { recursive: true });
app.setPath('userData', pastaDoPerfil);
let janela;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (janela?.isMinimized()) janela.restore();
    janela?.show();
    janela?.focus();
  });

  app
    .whenReady()
    .then(async () => {
      const pastaDoJogo = join(app.getAppPath(), 'jogo');
      protocol.handle('portaaporta', async (pedido) => {
        try {
          const url = new URL(pedido.url);
          if (url.hostname !== 'jogo') return new Response('Não encontrado', { status: 404 });
          const caminho = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
          const arquivo = resolve(pastaDoJogo, `.${caminho}`);
          const dentro = relative(pastaDoJogo, arquivo);
          if (dentro.startsWith('..') || isAbsolute(dentro))
            return new Response('Acesso negado', { status: 403 });
          return await net.fetch(pathToFileURL(arquivo).toString(), { headers: pedido.headers });
        } catch {
          return new Response('Não encontrado', { status: 404 });
        }
      });
      session.defaultSession.setPermissionRequestHandler((_origem, _permissao, responder) =>
        responder(false),
      );
      Menu.setApplicationMenu(null);
      janela = new BrowserWindow({
        title: 'Porta a Porta — Uma noite de Halloween',
        width: 1280,
        height: 720,
        minWidth: 960,
        minHeight: 540,
        useContentSize: true,
        show: false,
        backgroundColor: '#101623',
        icon: join(pastaDoJogo, process.platform === 'linux' ? 'favicon.png' : 'favicon.ico'),
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          devTools: emTeste,
        },
      });
      janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      janela.webContents.on('will-navigate', (evento, destino) => {
        if (!destino.startsWith('portaaporta://jogo/')) evento.preventDefault();
      });
      janela.webContents.on('before-input-event', (evento, tecla) => {
        if (tecla.type === 'keyDown' && tecla.key === 'F11') {
          evento.preventDefault();
          janela.setFullScreen(!janela.isFullScreen());
        }
      });
      janela.once('ready-to-show', () => {
        janela.show();
        janela.focus();
      });
      janela.on('closed', () => {
        janela = undefined;
      });
      await janela.loadURL('portaaporta://jogo/index.html');
    })
    .catch((erro) => {
      console.error(erro);
      dialog.showErrorBox(
        'Porta a Porta',
        process.platform === 'linux'
          ? 'Não foi possível abrir o jogo. Reinstale o aplicativo e abra Porta a Porta pelo menu de aplicativos.'
          : 'Não foi possível abrir o jogo. Extraia o ZIP inteiro para uma pasta e abra Porta a Porta.exe novamente.',
      );
      app.quit();
    });
}

app.on('window-all-closed', () => app.quit());
