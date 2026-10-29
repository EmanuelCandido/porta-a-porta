import { aplicarAjustesGuardados } from './game/dev/PainelDev';
import { criarJogo } from './game/jogo';

// Modo desenvolvedor: os números ajustados no painel (F1) entram antes do jogo começar.
aplicarAjustesGuardados();

criarJogo('jogo');
