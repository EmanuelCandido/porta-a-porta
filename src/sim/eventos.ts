import type { TipoGolpe } from './combate';
import type { V2 } from './geometria';

type Id = number;
type Lado = 'jogador' | 'inimigo' | 'neutro';

/**
 * O que aconteceu na simulação, para a tela mostrar (números de dano, explosões, piscar), para as
 * regras da run reagirem (Susto, XP, doces, tratos, pedidos) e para os testes conferirem. A
 * simulação só acrescenta; quem consome esvazia a lista.
 */
export type Evento =
  // Rolamento do jogador (esquiva)
  | { tipo: 'rolou'; id: Id; x: number; y: number }
  // Golpe manual do jogador (botão esquerdo): `combo` 0, 1, 2...; acertou ou não, a tela mostra
  | {
      tipo: 'golpeou';
      id: Id;
      combo: number;
      /** O último golpe do combo (mais forte; leque na Bruxinha). */
      final: boolean;
      x: number;
      y: number;
      acertos: number;
    }
  // Habilidades
  | {
      tipo: 'lancou';
      id: Id;
      tecla: string;
      alvo: V2;
      fortalecida: boolean;
      /** Repetição de graça de um trato (Eco, Coro), que não conta para outros efeitos. */
      eco?: boolean;
    }
  | {
      tipo: 'recusado';
      id: Id;
      tecla: string;
      motivo: 'recarga' | 'energia' | 'ocupado' | 'posto' | 'controle' | 'semAlvo';
    }
  | { tipo: 'anunciou'; id: Id; chave: string; alvo: V2; duracao: number }
  | { tipo: 'lancamentoInterrompido'; id: Id; tecla: string }
  | { tipo: 'interrompeu'; por: Id; id: Id; pos: V2 }
  | { tipo: 'acerto'; dono: Id; alvo: Id; chave: string; n: number; cargaId: number }
  | { tipo: 'acertoAuto'; dono: Id; alvo: Id }
  /** O estouro no fim da Vassoura ou no pouso do Salto (efeito e som próprios na tela). */
  | { tipo: 'estouro'; dono: Id; chave: string; lado: Lado; centro: V2; raio: number }
  | { tipo: 'pulso'; tecla: string; lado: Lado; centro: V2; raio: number; dono: Id; final: boolean }
  | { tipo: 'golpeLinha'; chave: string; dono: Id; lado: Lado; de: V2; ate: V2; largura: number }
  | {
      tipo: 'golpeCone';
      chave: string;
      dono: Id;
      lado: Lado;
      de: V2;
      dir: V2;
      alcance: number;
      angulo: number;
    }
  | { tipo: 'marcouAlvo'; dono: Id; alvo: Id; chave: string; atraso: number }
  | { tipo: 'recargaReiniciada'; id: Id; tecla: string }
  | { tipo: 'explosaoCaldeirao'; centro: V2; raio: number }
  | { tipo: 'projetilFim'; pos: V2; chave: string; lado: Lado }
  | { tipo: 'quaseAcerto'; id: Id }
  /** Feitiço Instável: a habilidade falhou. */
  | { tipo: 'feiticoFalhou'; id: Id; pos: V2 }
  // Combate
  | {
      tipo: 'dano';
      origem: Id;
      alvo: Id;
      valor: number;
      absorvido: number;
      critico: boolean;
      golpe: TipoGolpe;
      comAviso: boolean;
      fonte?: string;
      pos: V2;
      /** O alvo é um objeto quebrável (a tela não mostra número; o som é o do material). */
      objeto?: boolean;
    }
  | { tipo: 'cura'; alvo: Id; valor: number; pos: V2; origem?: string }
  | { tipo: 'derrotado'; id: Id; por: Id; pos: V2 }
  /** Golpe ou feitiço do jogador num objeto quebrável (treme, lasca e faz o som do material). */
  | {
      tipo: 'objetoAtingido';
      id: Id;
      objeto: number;
      material: string;
      pos: V2;
      /** O portão do quintal aguentou: só o golpe forte (o último do combo ou um feitiço) abre. */
      resistiu?: boolean;
    }
  /** O objeto quebrou: some da rua e solta doces (`objeto` é o índice em `rua.objetos`). */
  | {
      tipo: 'quebrou';
      id: Id;
      objeto: number;
      especie: string;
      material: string;
      pos: V2;
      /** Objetos de um grupo (o portão do quintal) somem juntos. */
      grupo?: string;
    }
  /** Armas do cenário: o alarme do carro tocando (a cada segundo), o fio do poste no chão. */
  | { tipo: 'alarmeCarro'; pos: V2 }
  | { tipo: 'fioCaiu'; centro: V2; raio: number; duracaoS: number }
  | { tipo: 'faisca'; centro: V2; raio: number }
  | { tipo: 'jato'; centro: V2; raio: number }
  /** A abóbora gigante vai explodir: aviso no chão até a explosão. */
  | { tipo: 'avisoExplosao'; centro: V2; raio: number; segundos: number; lado: Lado }
  /** O escudo do inimigo Encouraçado aguentou um golpe (faltam `restam`). */
  | { tipo: 'escudoBateu'; id: Id; pos: V2; restam: number }
  /** Um objeto da rua virou outra coisa (a lixeira que era um Saco-Surpresa): a tela o esconde. */
  | { tipo: 'objetoVirou'; objeto: number }
  /** O objeto voltou para a rua (a Casa Desperta deitou de novo no lote): a tela o mostra. */
  | { tipo: 'objetoVoltou'; objeto: number }
  /** Remontar do Esqueleto: desmontou em vez de cair, e voltou. */
  | { tipo: 'desmontou'; id: Id; pos: V2 }
  | { tipo: 'remontou'; id: Id; pos: V2 }
  /** Saiu da invisibilidade ao golpear. */
  | { tipo: 'apareceu'; id: Id; pos: V2 }
  /** Um inimigo pulou de lado para fugir de um projétil do jogador. */
  | { tipo: 'esquivou'; id: Id; pos: V2 }
  /** O golpe do Arrepio assustou as pestinhas em volta do alvo. */
  | { tipo: 'arrepio'; id: Id; pos: V2; raio: number }
  | { tipo: 'arrepioPronto'; id: Id }
  | { tipo: 'renasceu'; id: Id; pos: V2 }
  | { tipo: 'ataqueAuto'; id: Id; alvo: Id }
  // Regras da rua e da run
  | { tipo: 'nivel'; id: Id; nivel: number }
  | { tipo: 'xp'; id: Id; valor: number }
  | { tipo: 'doces'; valor: number; pos: V2 }
  | { tipo: 'pegouDoce'; valor: number; pos: V2 }
  | { tipo: 'frenesi'; ativo: boolean }
  | { tipo: 'susto'; delta: number; motivo: string }
  | { tipo: 'pulsoLanterna'; pos: V2; raio: number }
  /** O rolamento atravessou um inimigo pequeno: ele fica tonto um instante. */
  | { tipo: 'tonto'; id: Id; pos: V2 }
  /** O golpe do jogador cortou o preparo do ataque de um inimigo pequeno. */
  | { tipo: 'preparoCortado'; id: Id; pos: V2 }
  | { tipo: 'onda'; numero: number }
  | { tipo: 'posteCaiu'; id: Id; pos: V2; indice: number }
  | { tipo: 'portaoAbriu'; pos: V2; grupo?: string }
  | { tipo: 'explosaoAbobora'; centro: V2; raio: number }
  | { tipo: 'bauAberto'; id: Id; pos: V2; doces: number; item: string | null }
  | { tipo: 'alarme'; pos: V2; raio: number }
  | { tipo: 'grito'; id: Id; texto: string; pos?: V2 }
  | { tipo: 'invocou'; id: Id; especie: string; pos: V2 }
  | { tipo: 'tremor'; motivo: 'poste' | 'chefe' }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'bau'; id: Id; tipoBau: string; pos: V2 }
  /** Um encontro raro mudou de situação (a Criança achada, a Festa aberta, o Carrinho chegou). */
  | { tipo: 'encontro'; encontro: string; situacao: 'ativo' | 'cumprido' | 'falhou' }
  /** O jogador chegou perto de um baú e ele mostrou o tipo (comum, raro ou amaldiçoado). */
  | { tipo: 'bauRevelado'; id: Id; tipoBau: string; pos: V2 }
  | { tipo: 'pedidoCumprido'; pedido: string }
  // Exploração do bairro aberto
  | { tipo: 'ganhouXp'; valor: number; motivo: string }
  | {
      tipo: 'campainha';
      indice: number;
      objeto: number;
      pos: V2;
      /** `fechada`: errou o minijogo da campainha e a porta não abriu. */
      resultado: 'doces' | 'item' | 'travessura' | 'historia' | 'fechada';
      texto: string;
    }
  | { tipo: 'segredo'; indice: number; pos: V2; achados: number; total: number }
  // Casa Desconfiada: F bateu e o minijogo começou (a rua para); o resultado dele
  | {
      tipo: 'desafioIniciado';
      /** De quem é a porta: a campainha não acorda a casa no erro. */
      origem: 'desconfiada' | 'campainha' | 'travessura';
      indice: number;
      minijogo: 'toque' | 'olho' | 'fresta' | 'quem';
      pos: V2;
    }
  | {
      tipo: 'desafioResultado';
      indice: number;
      objeto: number;
      pos: V2;
      resultado: 'perfeito' | 'acerto' | 'erro';
      /** Errou, mas foi o primeiro erro da run: a casa só apagou a luz. */
      perdoado: boolean;
      doces: number;
      item: string | null;
      texto: string;
    }
  // Doce ou travessura: a travessura pedida (G) foi vencida
  | { tipo: 'travessuraVencida'; pos: V2; item: string | null; doces: number }
  | { tipo: 'canal'; acao: 'poste' | 'mirante'; pos: V2; duracao: number }
  | { tipo: 'canalCancelado' }
  | { tipo: 'posteReligado'; indice: number; objeto: number; pos: V2 }
  /** Luzes apagadas de vez (a Viúva apaga a praça): os objetos que acendiam cada uma. */
  | { tipo: 'luzesApagadas'; objetos: number[] }
  | { tipo: 'mirante'; pos: V2 }
  | { tipo: 'descoberta'; fracao: number }
  | { tipo: 'surpresa'; pos: V2 }
  // Fins de beco com desafio
  /** Uma vela do Quintal das Velas acendeu ou apagou (a tela troca o modelo). */
  | { tipo: 'vela'; objeto: number; acesa: boolean; pos: V2 }
  /** O Poço dos Desejos levou os doces e deu um consumível. */
  | { tipo: 'desejo'; pos: V2; item: string; preco: number }
  | { tipo: 'desafioVencido'; desafio: 'velas' | 'assombrada'; pos: V2 }
  | { tipo: 'faseChefe'; fase: number; nome: string };
