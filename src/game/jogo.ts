import * as Phaser from 'phaser';
import { visual } from '../sim/content';
import { CenaAlbum } from './interface/CenaAlbum';
import { CenaDiario } from './interface/CenaDiario';
import { CenaEvolucao } from './interface/CenaEvolucao';
import { CenaDesafio } from './interface/CenaDesafio';
import { CenaFimDaRun } from './interface/CenaFimDaRun';
import { CenaInterface } from './interface/CenaInterface';
import { CenaPausa } from './interface/CenaPausa';
import { CenaDesempenho } from './interface/CenaDesempenho';
import { CenaPorta } from './interface/CenaPorta';
import { CenaElenco } from './scenes/CenaElenco';
import { CenaRua } from './scenes/CenaRua';
import { CenaRuaPrevia } from './scenes/CenaRuaPrevia';
import { CenaTitulo } from './scenes/CenaTitulo';
import { mixer } from './audio/mixer';
import { ligarControleNosMenus } from './controleNosMenus';
import { ouvirTecladoEMouse } from './dispositivo';
import { larguraParaJanela } from './tela';

export function criarJogo(idPai: string): Phaser.Game {
  // O som nasce no primeiro gesto (regra do navegador); M liga e desliga em qualquer tela.
  mixer.preparar();
  // Só os atalhos conhecidos do jogo abrem o mapa. A hospedagem acrescenta parâmetros próprios
  // (como `?v=` no itch.io), que devem continuar levando ao menu inicial.
  const params = new URLSearchParams(window.location.search);
  const previa = params.get('cena') === 'previa';
  // `?cena=elenco`: a prancha dos modelos 3D dos personagens, para conferir a arte.
  const elenco = params.get('cena') === 'elenco';
  const atalhoParaRua =
    params.get('cena') === 'rua' ||
    [
      'rua',
      'modo',
      'porta',
      'bairro',
      'avancar',
      'noite',
      'zoom',
      'semente',
      'lancamento',
      'lua',
      'moradora',
      'primeira',
      'posicao',
      'chefe',
      'campeao',
      'nivel',
    ].some((chave) => params.has(chave));
  const titulo = !atalhoParaRua || params.get('cena') === 'titulo';
  const sobre = [
    CenaInterface,
    CenaPorta,
    CenaEvolucao,
    CenaDesafio,
    CenaFimDaRun,
    CenaAlbum,
    CenaDiario,
    CenaPausa,
    CenaDesempenho,
  ];
  const jogo = new Phaser.Game({
    type: Phaser.AUTO,
    parent: idPai,
    // Tela inteira: a largura lógica segue a proporção da janela (sem bordas).
    width: larguraParaJanela(window.innerWidth, window.innerHeight),
    height: visual.tela.altura,
    backgroundColor: visual.paleta.fundo,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    input: { gamepad: true },
    scene: elenco
      ? [CenaElenco]
      : previa
        ? [CenaRuaPrevia, CenaRua, CenaTitulo, ...sobre]
        : titulo
          ? [CenaTitulo, CenaRua, CenaRuaPrevia, ...sobre]
          : [CenaRua, CenaTitulo, CenaRuaPrevia, ...sobre],
  });
  acompanharJanela(jogo);
  // Controle nos menus (direcional, A, B, Start); na rua, a EntradaDoJogador lê o resto.
  ouvirTecladoEMouse();
  const controle = ligarControleNosMenus(jogo);
  // Os testes de tela leem onde está o foco do controle.
  (window as unknown as { __controleNosMenus: unknown }).__controleNosMenus = controle;
  return jogo;
}

/** Cenas que se montam pelo tamanho da tela: remontam (com os mesmos dados) quando ele muda. */
const REMONTAM = [
  'CenaTitulo',
  'CenaInterface',
  'CenaPorta',
  'CenaEvolucao',
  'CenaFimDaRun',
  'CenaAlbum',
  'CenaDiario',
  'CenaPausa',
];

/**
 * A janela mudou de proporção (ou entrou em tela cheia): a largura lógica acompanha, e as telas de
 * interface ativas se remontam. A rua só ganha mais (ou menos) mundo à vista.
 */
function acompanharJanela(jogo: Phaser.Game): void {
  let espera: number | undefined;
  const ajustar = () => {
    const largura = larguraParaJanela(window.innerWidth, window.innerHeight);
    if (largura === jogo.scale.width) return;
    jogo.scale.setGameSize(largura, visual.tela.altura);
    for (const chave of REMONTAM) {
      const cena = jogo.scene.getScene(chave);
      if (cena?.sys.isActive()) cena.scene.restart(cena.sys.settings.data);
    }
  };
  window.addEventListener('resize', () => {
    window.clearTimeout(espera);
    espera = window.setTimeout(ajustar, ESPERA_REDIMENSIONAR_MS);
  });
}

/** Espera o fim do arrasto da janela antes de remontar as telas. */
const ESPERA_REDIMENSIONAR_MS = 150;
