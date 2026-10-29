import albumJson from '../../../content/album.json';
import audioJson from '../../../content/audio.json';
import dicasJson from '../../../content/dicas.json';
import campeoesJson from '../../../content/campeoes.json';
import combateJson from '../../../content/combate.json';
import geradorJson from '../../../content/gerador.json';
import inimigosJson from '../../../content/inimigos.json';
import ondasJson from '../../../content/ondas.json';
import exploracaoJson from '../../../content/exploracao.json';
import entreRunsJson from '../../../content/entreRuns.json';
import evolucoesJson from '../../../content/evolucoes.json';
import botsJson from '../../../content/bots.json';
import sustoJson from '../../../content/susto.json';
import tratosJson from '../../../content/tratos.json';
import precosJson from '../../../content/precos.json';
import itensJson from '../../../content/itens.json';
import runJson from '../../../content/run.json';
import noiteJson from '../../../content/noite.json';
import controlesJson from '../../../content/controles.json';
import habilidadesJson from '../../../content/habilidades.json';
import jogadorJson from '../../../content/jogador.json';
import luaCheiaJson from '../../../content/luaCheia.json';
import luzJson from '../../../content/luz.json';
import modelosJson from '../../../content/modelos.json';
import ruasJson from '../../../content/ruas.json';
import simulacaoJson from '../../../content/simulacao.json';
import visualJson from '../../../content/visual.json';
import publicacaoJson from '../../../content/publicacao.json';
import {
  esquemaAlbum,
  esquemaAudio,
  esquemaDicas,
  esquemaCampeoes,
  esquemaCombate,
  esquemaEntreRuns,
  esquemaControles,
  esquemaBots,
  esquemaEvolucoes,
  esquemaExploracao,
  esquemaGerador,
  esquemaItens,
  esquemaRun,
  esquemaNoite,
  esquemaPrecos,
  esquemaTratos,
  esquemaInimigos,
  esquemaOndas,
  esquemaSusto,
  esquemaHabilidades,
  esquemaJogador,
  esquemaLuaCheia,
  esquemaLuz,
  esquemaModelos,
  esquemaRuas,
  esquemaSimulacao,
  esquemaVisual,
  esquemaPublicacao,
} from './esquemas';
import { montarEvolucoes } from '../evolucoes';

// O conteúdo é validado ao carregar: um JSON inválido quebra o jogo e os testes na hora.
export const visual = esquemaVisual.parse(visualJson);
export const publicacao = esquemaPublicacao.parse(publicacaoJson);
export const luz = esquemaLuz.parse(luzJson);
export const ruas = esquemaRuas.parse(ruasJson).ruas;
export const modelos = esquemaModelos.parse(modelosJson);
export const simulacao = esquemaSimulacao.parse(simulacaoJson);
export const jogador = esquemaJogador.parse(jogadorJson);
export const controles = esquemaControles.parse(controlesJson);
export const gerador = esquemaGerador.parse(geradorJson);
export const inimigos = esquemaInimigos.parse(inimigosJson);
export const ondas = esquemaOndas.parse(ondasJson);
export const susto = esquemaSusto.parse(sustoJson);
export const tratos = esquemaTratos.parse(tratosJson);
export const precos = esquemaPrecos.parse(precosJson);
export const itens = esquemaItens.parse(itensJson);
export const configRun = esquemaRun.parse(runJson);
export const noite = esquemaNoite.parse(noiteJson);
export const exploracao = esquemaExploracao.parse(exploracaoJson);
export const habilidades = esquemaHabilidades.parse(habilidadesJson).habilidades;
export const evolucoes = esquemaEvolucoes.parse(evolucoesJson).evolucoes;
/** As evoluções já montadas sobre as habilidades (e validadas de novo ao carregar). */
export const tabelaDeEvolucoes = montarEvolucoes(evolucoes, habilidades);
/** Bots e metas do relatório de balanceamento (só os testes e `npm run bots` usam). */
export const bots = esquemaBots.parse(botsJson);
export const campeoes = esquemaCampeoes.parse(campeoesJson);
/** Álbum de Fantasias (desbloqueios com Doces Guardados) e os níveis de Lua Cheia. */
export const album = esquemaAlbum.parse(albumJson);
export const luaCheia = esquemaLuaCheia.parse(luaCheiaJson);
/** Maestria, Diário do Bairro, moradores que lembram e desafio da semana (GAMEPLAY.md). */
export const entreRuns = esquemaEntreRuns.parse(entreRunsJson);
export const combate = esquemaCombate.parse(combateJson);
/** Os sons sintetizados (só a tela toca). */
export const audio = esquemaAudio.parse(audioJson);
/** Dicas da primeira run (só a tela mostra). */
export const dicas = esquemaDicas.parse(dicasJson);

/** Prioridade de alvo do "atacar e mover" (GAMEPLAY.md): maior primeiro. */
export const prioridadeAlvo: Readonly<Record<string, number>> = {
  arremessador: 4,
  pestinha_lencol: 3,
  abobora_canhao: 2,
  poste_corrompido: 1,
};

/** Tudo que `montarPartida` precisa. */
export const conteudo = {
  modelos,
  simulacao,
  jogador,
  campeoes,
  habilidades,
  combate,
  prioridadeAlvo,
  inimigos,
  ondas,
  susto,
  gerador,
  luz,
  tratos,
  precos,
  itens,
  run: configRun,
  noite,
  exploracao,
  evolucoes,
  luaCheia,
};
