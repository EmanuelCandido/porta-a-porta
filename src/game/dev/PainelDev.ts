import { campeoes, configRun, habilidades, inimigos } from '../../sim/content';
import type { Desconfiada } from '../../sim/exploracao';
import { TIPOS_DE_MINIJOGO, type TipoMinijogo } from '../../sim/minijogos';
import type { Entidade, Mundo } from '../../sim/mundo';
import { rotuloDaTecla } from '../entrada';
import {
  ajustar,
  ajustesAtuais,
  aplicarAjustes,
  aplicarNasVivas,
  baseDoCampeao,
  camposDe,
  carregarAjustes,
  chaveDe,
  fotoDosInimigos,
  lerTexto,
  original,
  restaurarTudo,
  salvarAjustes,
  separarChave,
  textoDoValor,
  textoParaCopiar,
  type Campo,
  type Raiz,
  type Ajustes,
} from './ajustes';
import type { AjusteParaGravar } from './editarJson';
import { escolhaDaUrl, FASES, urlDaFase } from './fases';

/** O que a rua entrega ao painel: a partida da vez e os atalhos de teste. */
export interface AlvoDoPainel {
  campeaoId(): string;
  mundo(): Mundo;
  heroi(): Entidade;
  atalhos: Record<string, () => void>;
  /** Ferramentas da aba Testar (só nas ruas com regras; o treino não tem casas). */
  teste?: TesteDaRua;
}

/** Aba Testar: inimigos à vontade, minijogos e Casas Desconfiadas da rua da vez. */
export interface TesteDaRua {
  /** Cria `n` inimigos da espécie em volta do jogador (elites nascem como na rua). */
  criarInimigos(especie: string, n: number): void;
  afastarInimigos(): void;
  /** Abre o minijogo sem casa (o resultado não dá doces nem acorda nada). */
  minijogoAvulso(tipo: TipoMinijogo): void;
  casas(): readonly Desconfiada[];
  /** Casas que acordaram (viraram inimigo): não dá para rearmar. */
  acordada(i: number): boolean;
  irACasa(i: number): void;
  /** Destranca as casas já batidas que não acordaram (a porta abre de novo). */
  rearmarCasas(): void;
  /** O minijogo de todas as casas da rua; null volta ao sorteado. */
  forcarMinijogo(tipo: TipoMinijogo | null): void;
  /** O minijogo escolhido para as casas (null: o sorteado de cada uma). */
  minijogoForcado(): TipoMinijogo | null;
  perdaoGasto(): boolean;
  alternarPerdao(): void;
}

const NOMES_DOS_MINIJOGOS: Record<TipoMinijogo, string> = {
  toque: 'Toque Combinado',
  olho: 'Olho Mágico',
  fresta: 'Doce na Fresta',
  quem: 'Quem Bate?',
};

/** Interruptores que valem a cada quadro enquanto ligados. */
export interface InterruptoresDev {
  pausado: boolean;
  imortal: boolean;
  semRecarga: boolean;
}

/** Nome mais claro de alguns campos (o resto mostra o nome do JSON). */
const NOMES: Record<string, string> = {
  coragem: 'Vida (Coragem)',
  energia: 'Energia máxima',
  regenEnergiaPorS: 'Energia por segundo',
  recarga: 'Recarga (s, por posto)',
  custo: 'Custo de Energia',
  lancamento: 'Tempo de lançamento (s)',
  base: 'Dano base (por posto)',
  razao: 'Razão do atributo',
  porSegundo: 'Golpes por segundo',
  velocidade: 'Velocidade',
  alcance: 'Alcance (tiles)',
  raio: 'Raio (tiles)',
  resistencia: 'Resistência',
  duracao: 'Duração (s)',
  arranqueS: 'Arranque (s até a velocidade cheia)',
  freioS: 'Frenagem (s até parar)',
  giroGrausPorS: 'Giro do corpo (graus/s)',
};

const ABAS = ['Testar', 'Campeão', 'Habilidades', 'Golpe', 'Inimigos', 'Jogo', 'Atalhos'] as const;
type Aba = (typeof ABAS)[number];

interface Grupo {
  titulo: string;
  raiz: Raiz;
  caminho: string[];
}

function nomeDaHabilidade(id: string): string {
  return habilidades.find((h) => h.id === id)?.nome ?? id;
}

function armazenamento(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Onde o Imortal e o Sem recarga ficam guardados: valem de novo depois do "Ir" da aba Testar. */
const CHAVE_INTERRUPTORES = 'portaAPorta:dev:interruptores';

function lerInterruptores(): InterruptoresDev {
  const padrao: InterruptoresDev = { pausado: false, imortal: false, semRecarga: false };
  try {
    const t = armazenamento()?.getItem(CHAVE_INTERRUPTORES);
    const lido = t ? (JSON.parse(t) as Partial<InterruptoresDev>) : {};
    return { ...padrao, imortal: !!lido.imortal, semRecarga: !!lido.semRecarga };
  } catch {
    return padrao;
  }
}

function guardarInterruptores(i: InterruptoresDev): void {
  try {
    armazenamento()?.setItem(
      CHAVE_INTERRUPTORES,
      JSON.stringify({ imortal: i.imortal, semRecarga: i.semRecarga }),
    );
  } catch {
    // Sem armazenamento (janela privada): valem só até recarregar.
  }
}

/** O modo desenvolvedor existe no `npm run dev` ou com `?dev=1` na URL. */
export function devDisponivel(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');
}

/** Aplica os ajustes guardados antes do jogo ler o conteúdo (chamado no `main.ts`). */
export function aplicarAjustesGuardados(): number {
  if (!devDisponivel()) return 0;
  const guardados = carregarAjustes(armazenamento());
  const n = aplicarAjustes(guardados);
  // No `npm run dev`, o que ficou só no navegador vai para o content/*.json e sai do navegador.
  if (n > 0 && import.meta.env.DEV)
    void gravarNoContent(guardados).then((r) => {
      if (r.ok) salvarAjustes(armazenamento(), {});
    });
  return n;
}

/** Resultado de gravar no `content/`: os arquivos que mudaram, ou o erro. */
interface Gravacao {
  ok: boolean;
  texto: string;
}

/**
 * Manda os ajustes para o servidor do `npm run dev` (vite.ajustes.ts), que os grava no
 * `content/*.json`: é o que vai para o jogo final. Fora do `npm run dev` não há onde gravar.
 */
async function gravarNoContent(ajustes: Ajustes): Promise<Gravacao> {
  if (!import.meta.env.DEV) return { ok: false, texto: 'Guardado só neste navegador' };
  const lista: AjusteParaGravar[] = [];
  for (const [k, valor] of Object.entries(ajustes)) {
    const s = separarChave(k);
    if (s) lista.push({ raiz: s.raiz, caminho: s.caminho, valor });
  }
  if (lista.length === 0) return { ok: true, texto: 'Nada a gravar' };
  try {
    const r = await fetch('/__dev/ajustes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajustes: lista }),
    });
    const corpo = (await r.json()) as { arquivos?: string[]; falhas?: string[]; erro?: string };
    if (!r.ok || corpo.erro)
      return { ok: false, texto: `Erro ao gravar: ${corpo.erro ?? r.status}` };
    if (corpo.falhas?.length) return { ok: false, texto: `Não achei: ${corpo.falhas.join(', ')}` };
    return { ok: true, texto: `Gravado em ${(corpo.arquivos ?? []).join(', ')}` };
  } catch (e) {
    return { ok: false, texto: `Erro ao gravar: ${String(e)}` };
  }
}

const CSS = `
#painel-dev{position:fixed;top:0;right:0;width:360px;max-width:100vw;height:100vh;z-index:50;
  display:flex;flex-direction:column;background:#1c1d24f2;color:#e7e8ee;
  font:12px/1.35 ui-monospace,Consolas,monospace;border-left:2px solid #f08a24;box-sizing:border-box}
#painel-dev[hidden]{display:none}
#painel-dev header{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #393b48}
#painel-dev header b{color:#f08a24;flex:1}
#painel-dev nav{display:flex;flex-wrap:wrap;gap:2px;padding:6px 8px;border-bottom:1px solid #393b48}
#painel-dev nav button{flex:1 0 auto}
#painel-dev button{background:#2c2e3a;color:#e7e8ee;border:1px solid #474a5a;border-radius:3px;
  padding:4px 7px;font:inherit;cursor:pointer}
#painel-dev button:hover{border-color:#f08a24}
#painel-dev button.ativo{background:#f08a24;color:#1c1d24;border-color:#f08a24}
#painel-dev .corpo{flex:1;overflow-y:auto;padding:6px 10px 12px}
#painel-dev .busca,#painel-dev select{width:100%;box-sizing:border-box;margin:4px 0 6px;padding:5px;
  background:#121318;color:#e7e8ee;border:1px solid #474a5a;border-radius:3px;font:inherit}
#painel-dev h4{margin:12px 0 4px;color:#f6c065;font-size:12px}
#painel-dev .campo{display:grid;grid-template-columns:1fr 112px 18px;gap:4px;align-items:center;margin:2px 0}
#painel-dev .campo span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#b8bac6}
#painel-dev .campo input{width:100%;box-sizing:border-box;padding:3px 4px;background:#121318;
  color:#e7e8ee;border:1px solid #393b48;border-radius:3px;font:inherit}
#painel-dev .campo.mudou span{color:#f6c065}
#painel-dev .campo.mudou input{border-color:#f08a24}
#painel-dev .campo.erro input{border-color:#e0474c}
#painel-dev .voltar{background:none;border:0;padding:0;color:#f08a24;visibility:hidden}
#painel-dev .campo.mudou .voltar{visibility:visible}
#painel-dev footer{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-top:1px solid #393b48}
#painel-dev footer button{flex:1}
#painel-dev .estado{flex:1 0 100%;color:#8fd18b;margin-bottom:4px}
#painel-dev .estado.erro{color:#e0474c}
#painel-dev .nota{color:#8d90a0;margin:4px 0 8px}
#painel-dev .grade{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
#painel-dev textarea{width:100%;height:140px;box-sizing:border-box;background:#121318;color:#e7e8ee;
  border:1px solid #474a5a;font:inherit;margin-top:6px}
#botao-dev{position:fixed;right:8px;bottom:8px;z-index:49;background:#1c1d24;color:#f08a24;
  border:1px solid #f08a24;border-radius:3px;font:12px ui-monospace,Consolas,monospace;padding:4px 8px;cursor:pointer}
`;

/**
 * Painel do modo desenvolvedor (F1): todos os números do campeão, das habilidades, dos inimigos e
 * do ritmo da rua, ajustáveis com o jogo rodando. Um só painel para a página toda; cada rua que
 * abre se liga a ele com `ligar`.
 */
export class PainelDev {
  readonly interruptores: InterruptoresDev = lerInterruptores();
  private raiz: HTMLDivElement;
  private corpo: HTMLDivElement;
  private nav: HTMLElement;
  private aba: Aba = 'Testar';
  /** Escolhas da aba Testar (ficam entre as aberturas do painel). */
  private escolha = {
    ...escolhaDaUrl(window.location.search),
    especie: 'pestinha_lencol',
    quantos: 3,
  };
  private alvo: AlvoDoPainel | null = null;
  private busca = '';
  private especie = 'pestinha_lencol';
  private botaoPausa!: HTMLButtonElement;
  private estado!: HTMLDivElement;

  private static instancia: PainelDev | null = null;

  static obter(): PainelDev {
    PainelDev.instancia ??= new PainelDev();
    return PainelDev.instancia;
  }

  private constructor() {
    const estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    this.raiz = document.createElement('div');
    this.raiz.id = 'painel-dev';
    this.raiz.hidden = true;
    // As teclas digitadas no painel não chegam ao jogo (o Phaser escuta a janela).
    for (const tipo of ['keydown', 'keyup', 'keypress'] as const)
      this.raiz.addEventListener(tipo, (ev) => {
        if ((ev as KeyboardEvent).key !== 'F1') ev.stopPropagation();
      });
    // Rolar a lista não dá zoom na câmera.
    this.raiz.addEventListener('wheel', (ev) => ev.stopPropagation());

    const cabeca = document.createElement('header');
    cabeca.innerHTML = '<b>MODO DESENVOLVEDOR</b>';
    this.botaoPausa = this.botao('Pausar', () => this.alternarPausa());
    cabeca.append(
      this.botaoPausa,
      this.botao('Fechar (F1)', () => this.alternar(false)),
    );

    this.nav = document.createElement('nav');
    for (const a of ABAS) {
      const b = this.botao(a, () => {
        this.aba = a;
        this.desenhar();
      });
      b.dataset['aba'] = a;
      this.nav.appendChild(b);
    }

    this.corpo = document.createElement('div');
    this.corpo.className = 'corpo';

    const pe = document.createElement('footer');
    this.estado = document.createElement('div');
    this.estado.className = 'estado';
    this.estado.textContent = import.meta.env.DEV
      ? 'Cada mudança é gravada no content/*.json (vai para o jogo final).'
      : 'Jogo publicado: os ajustes ficam só neste navegador.';
    pe.append(
      this.estado,
      this.botao('Copiar ajustes', () => this.copiar()),
      this.botao('Desfazer tudo', () => this.restaurar()),
    );

    this.raiz.append(cabeca, this.nav, this.corpo, pe);
    document.body.appendChild(this.raiz);

    const abrir = document.createElement('button');
    abrir.id = 'botao-dev';
    abrir.textContent = 'DEV (F1)';
    abrir.addEventListener('click', () => this.alternar());
    document.body.appendChild(abrir);

    window.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key !== 'F1') return;
        ev.preventDefault();
        ev.stopPropagation();
        this.alternar();
      },
      true,
    );
  }

  get aberto(): boolean {
    return !this.raiz.hidden;
  }

  /** A rua que abriu passa a ser a do painel (as abas mostram o campeão dela). */
  ligar(alvo: AlvoDoPainel): void {
    this.alvo = alvo;
    if (this.aberto) this.desenhar();
  }

  desligar(alvo: AlvoDoPainel): void {
    if (this.alvo === alvo) this.alvo = null;
  }

  alternar(abrir = !this.aberto): void {
    this.raiz.hidden = !abrir;
    if (abrir) this.desenhar();
  }

  /** Chamado pela rua a cada quadro: imortal e sem recarga valem enquanto ligados. */
  aplicarInterruptores(): void {
    const j = this.alvo?.heroi();
    const c = j?.combate;
    if (!j || !c) return;
    if (this.interruptores.imortal) c.coragem = c.attr.coragemMax;
    if (this.interruptores.semRecarga) {
      c.energia = c.attr.energiaMax;
      for (const s of Object.values(j.lancador?.slots ?? {})) s.recarga = 0;
      if (j.ataque) j.ataque.recarga = 0;
    }
  }

  private alternarPausa(): void {
    this.interruptores.pausado = !this.interruptores.pausado;
    this.botaoPausa.textContent = this.interruptores.pausado ? 'Continuar' : 'Pausar';
    this.botaoPausa.classList.toggle('ativo', this.interruptores.pausado);
  }

  private botao(texto: string, acao: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', acao);
    return b;
  }

  private grupos(): Grupo[] {
    const id = this.alvo?.campeaoId() ?? 'bruxinha';
    const c = campeoes[id];
    switch (this.aba) {
      case 'Campeão':
        return [{ titulo: c?.nome ?? id, raiz: 'campeoes', caminho: [id] }];
      case 'Habilidades':
        return Object.entries(c?.habilidades ?? {}).map(([slot, h]) => ({
          titulo: `${rotuloDaTecla(slot)} · ${nomeDaHabilidade(h)}`,
          raiz: 'habilidades',
          caminho: [h],
        }));
      case 'Golpe':
        return [
          { titulo: 'Ataque básico (do campeão)', raiz: 'campeoes', caminho: [id, 'autoAtaque'] },
          { titulo: 'Golpe manual e combo', raiz: 'combate', caminho: ['ataqueManual'] },
          { titulo: 'Jogador: andar e rolamento', raiz: 'jogador', caminho: [] },
          { titulo: 'Luz da lanterna', raiz: 'combate', caminho: ['luz'] },
        ];
      case 'Inimigos': {
        const def = inimigos.inimigos[this.especie];
        return [
          {
            titulo: def?.nome ?? this.especie,
            raiz: 'inimigos',
            caminho: ['inimigos', this.especie],
          },
          ...(def?.ataques ?? []).map((a) => ({
            titulo: `Ataque: ${nomeDaHabilidade(a)}`,
            raiz: 'habilidades' as const,
            caminho: [a],
          })),
          { titulo: 'Escala por bairro', raiz: 'inimigos', caminho: ['escalaPorBairro'] },
        ];
      }
      case 'Jogo':
        return [
          { titulo: 'Ondas', raiz: 'ondas', caminho: [] },
          { titulo: 'Susto e Frenesi', raiz: 'susto', caminho: [] },
          { titulo: 'Exploração', raiz: 'exploracao', caminho: [] },
          { titulo: 'Combate (geral)', raiz: 'combate', caminho: [] },
          { titulo: 'Animação (movimento com peso)', raiz: 'visual', caminho: ['animacao'] },
        ];
      case 'Atalhos':
      case 'Testar':
        return [];
    }
  }

  private desenhar(): void {
    for (const b of this.nav.querySelectorAll('button'))
      b.classList.toggle('ativo', b.dataset['aba'] === this.aba);
    this.corpo.replaceChildren();
    if (this.aba === 'Atalhos') return this.desenharAtalhos();
    if (this.aba === 'Testar') return this.desenharTestar();

    if (this.aba === 'Inimigos') {
      const sel = document.createElement('select');
      for (const [id, d] of Object.entries(inimigos.inimigos)) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = d.nome;
        o.selected = id === this.especie;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        this.especie = sel.value;
        this.desenhar();
      });
      this.corpo.appendChild(sel);
    }

    const busca = document.createElement('input');
    busca.className = 'busca';
    busca.placeholder = 'Filtrar (ex.: recarga, dano, coragem)';
    busca.value = this.busca;
    busca.addEventListener('input', () => {
      this.busca = busca.value;
      this.filtrar();
    });
    this.corpo.appendChild(busca);

    const nota = document.createElement('div');
    nota.className = 'nota';
    nota.textContent =
      'Enter aplica na hora. Listas (recarga e dano por posto) separadas por espaço ou ";".';
    this.corpo.appendChild(nota);

    for (const g of this.grupos()) {
      const campos = camposDe(g.raiz, g.caminho);
      if (campos.length === 0) continue;
      const h = document.createElement('h4');
      h.textContent = g.titulo;
      this.corpo.appendChild(h);
      for (const c of campos) this.corpo.appendChild(this.linha(c, g.caminho.length));
    }
    this.filtrar();
  }

  private filtrar(): void {
    const t = this.busca.trim().toLowerCase();
    for (const el of this.corpo.querySelectorAll<HTMLElement>('.campo'))
      el.hidden = t !== '' && !(el.dataset['busca'] ?? '').includes(t);
  }

  private linha(c: Campo, prefixo: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'campo';
    const relativo = c.caminho.slice(prefixo);
    const ultimo = relativo[relativo.length - 1] ?? '';
    const rotulo = document.createElement('span');
    const nome = NOMES[ultimo];
    rotulo.textContent = nome && relativo.length === 1 ? nome : relativo.join(' › ');
    rotulo.title = c.caminho.join('.');
    el.dataset['busca'] = `${relativo.join(' ')} ${nome ?? ''}`.toLowerCase();

    const input = document.createElement('input');
    input.value = textoDoValor(c.valor);
    const voltar = this.botao('↺', () => {
      const o = original(c.raiz, c.caminho);
      if (o === undefined) return;
      this.mudar(c, Array.isArray(o) ? [...o] : o);
      input.value = textoDoValor(o);
      marcar();
    });
    voltar.className = 'voltar';
    voltar.title = 'Voltar ao valor do JSON';

    const marcar = (): void => {
      const o = original(c.raiz, c.caminho);
      el.classList.toggle('mudou', o !== undefined && textoDoValor(o) !== input.value);
      if (o !== undefined) rotulo.title = `${c.caminho.join('.')} (JSON: ${textoDoValor(o)})`;
    };
    const aplicar = (): void => {
      const v = lerTexto(input.value, c.valor);
      el.classList.toggle('erro', v === null);
      if (v === null) return;
      this.mudar(c, v);
      input.value = textoDoValor(v);
      marcar();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') aplicar();
    });
    input.addEventListener('change', aplicar);
    el.append(rotulo, input, voltar);
    marcar();
    return el;
  }

  /** Troca o número, corrige quem já nasceu e guarda no navegador. */
  private mudar(c: Campo, valor: number | number[]): void {
    const alvo = this.alvo;
    const id = alvo?.campeaoId() ?? '';
    const antes = baseDoCampeao(id);
    const inimigosAntes = fotoDosInimigos();
    if (!ajustar(c.raiz, c.caminho, valor)) return;
    if (alvo) aplicarNasVivas(alvo.mundo(), alvo.heroi(), id, antes, inimigosAntes);
    this.gravar({ [chaveDe(c.raiz, c.caminho)]: valor });
  }

  /** No `npm run dev`, grava no content/*.json; no jogo publicado, guarda no navegador. */
  private gravar(ajustes: Ajustes): void {
    if (!import.meta.env.DEV) {
      salvarAjustes(armazenamento(), ajustesAtuais());
      return;
    }
    this.mostrarEstado('Gravando...', false);
    void gravarNoContent(ajustes).then((r) => {
      this.mostrarEstado(r.texto, !r.ok);
      // Se o servidor falhar, o ajuste não se perde: fica no navegador até a próxima gravação.
      salvarAjustes(armazenamento(), r.ok ? {} : ajustesAtuais());
    });
  }

  private mostrarEstado(texto: string, erro: boolean): void {
    this.estado.textContent = texto;
    this.estado.classList.toggle('erro', erro);
  }

  /** Liga e desliga um interruptor; Imortal e Sem recarga ficam guardados entre as recargas. */
  private interruptor(texto: string, chave: 'imortal' | 'semRecarga'): HTMLButtonElement {
    const b = this.botao(texto, () => {
      this.interruptores[chave] = !this.interruptores[chave];
      guardarInterruptores(this.interruptores);
      b.classList.toggle('ativo', this.interruptores[chave]);
    });
    b.classList.toggle('ativo', this.interruptores[chave]);
    return b;
  }

  private desenharAtalhos(): void {
    const grade = document.createElement('div');
    grade.className = 'grade';
    const interruptor = (texto: string, chave: 'imortal' | 'semRecarga') =>
      this.interruptor(texto, chave);
    grade.append(
      interruptor('Imortal', 'imortal'),
      interruptor('Sem recarga e Energia cheia', 'semRecarga'),
    );
    const nomes: Record<string, string> = {
      curar: 'Curar tudo',
      matarInimigos: 'Derrotar inimigos (12 tiles)',
      derrubarPostes: 'Derrubar Postes (abre o portão)',
      irAoPortao: 'Ir ao portão de saída',
      ferirChefe: 'Chefe com 50% da vida',
      doces: '+500 doces',
      subirNivel: 'Subir 1 nível',
    };
    for (const [k, f] of Object.entries(this.alvo?.atalhos ?? {}))
      grade.appendChild(this.botao(nomes[k] ?? k, f));
    this.corpo.appendChild(grade);
    const nota = document.createElement('div');
    nota.className = 'nota';
    nota.textContent =
      '"Desfazer tudo" volta os números que você mudou desde que abriu o jogo. As evoluções ' +
      'de habilidade (escolhidas no posto 3) só pegam os números novos ao recarregar a página.';
    this.corpo.appendChild(nota);
  }

  private titulo(texto: string): void {
    const h = document.createElement('h4');
    h.textContent = texto;
    this.corpo.appendChild(h);
  }

  private seletor(
    opcoes: readonly { id: string; nome: string }[],
    atual: string,
    aoMudar: (id: string) => void,
  ): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const o of opcoes) {
      const op = document.createElement('option');
      op.value = o.id;
      op.textContent = o.nome;
      op.selected = o.id === atual;
      sel.appendChild(op);
    }
    sel.addEventListener('change', () => aoMudar(sel.value));
    return sel;
  }

  private nota(texto: string): void {
    const n = document.createElement('div');
    n.className = 'nota';
    n.textContent = texto;
    this.corpo.appendChild(n);
  }

  /** Aba Testar: ir a qualquer fase, criar inimigos, minijogos e Casas Desconfiadas. */
  private desenharTestar(): void {
    const e = this.escolha;
    const gt = document.createElement('div');
    gt.className = 'grade';
    gt.append(
      this.interruptor('Imortal', 'imortal'),
      this.interruptor('Sem recarga e Energia cheia', 'semRecarga'),
    );
    this.corpo.appendChild(gt);
    this.titulo('Ir para');
    this.corpo.append(
      this.seletor(
        Object.entries(campeoes).map(([id, c]) => ({ id, nome: `Fantasia: ${c.nome}` })),
        e.campeao,
        (v) => (e.campeao = v),
      ),
      this.seletor(
        configRun.nomesDosBairros.map((n, i) => ({ id: String(i), nome: `Bairro ${i + 1}: ${n}` })),
        String(e.bairro),
        (v) => (e.bairro = Number(v)),
      ),
      this.seletor(FASES, e.fase, (v) => (e.fase = v)),
    );
    const semente = document.createElement('input');
    semente.className = 'busca';
    semente.placeholder = 'Semente (vazio = padrão)';
    semente.value = e.semente;
    semente.addEventListener('input', () => (e.semente = semente.value));
    this.corpo.appendChild(semente);
    const grade = document.createElement('div');
    grade.className = 'grade';
    grade.appendChild(
      this.botao('Ir', () => {
        window.location.search = urlDaFase(
          e.fase,
          e.bairro,
          e.campeao,
          e.semente,
          !import.meta.env.DEV,
        );
      }),
    );
    this.corpo.appendChild(grade);
    this.nota(
      'Recarrega a página (Imortal e Sem recarga continuam ligados). Toda fantasia vale aqui; ' +
        'nada disso grava no save.',
    );

    const t = this.alvo?.teste;
    if (!t) {
      this.nota('Entre numa rua para criar inimigos, abrir minijogos e testar as casas.');
      return;
    }

    this.titulo('Inimigos');
    const especies = Object.entries(inimigos.inimigos)
      // O chefe tem a praça dele (fase Chefe) e a Casa Desperta sai de uma Casa Desconfiada.
      .filter(([id, d]) => !d.chefe && id !== 'casa_desperta')
      .map(([id, d]) => ({ id, nome: d.elite ? `${d.nome} (elite)` : d.nome }));
    this.corpo.appendChild(this.seletor(especies, e.especie, (v) => (e.especie = v)));
    const qtd = document.createElement('input');
    qtd.className = 'busca';
    qtd.type = 'number';
    qtd.min = '1';
    qtd.max = '30';
    qtd.value = String(e.quantos);
    qtd.addEventListener(
      'input',
      () => (e.quantos = Math.max(1, Math.min(30, Number(qtd.value) || 1))),
    );
    this.corpo.appendChild(qtd);
    const gi = document.createElement('div');
    gi.className = 'grade';
    gi.append(
      this.botao('Criar perto', () => t.criarInimigos(e.especie, e.quantos)),
      this.botao('Tirar os de perto', () => t.afastarInimigos()),
    );
    this.corpo.appendChild(gi);

    this.titulo('Minijogo avulso (sem casa)');
    const gm = document.createElement('div');
    gm.className = 'grade';
    for (const tipo of TIPOS_DE_MINIJOGO)
      gm.appendChild(
        this.botao(NOMES_DOS_MINIJOGOS[tipo], () => {
          this.alternar(false);
          t.minijogoAvulso(tipo);
        }),
      );
    this.corpo.appendChild(gm);

    this.titulo('Casas Desconfiadas desta rua');
    const casas = t.casas();
    if (casas.length === 0) this.nota('Esta rua não tem Casa Desconfiada.');
    const gc = document.createElement('div');
    gc.className = 'grade';
    casas.forEach((c, i) => {
      const estado = t.acordada(i)
        ? 'acordou'
        : c.resultado
          ? c.resultado
          : c.batida
            ? 'batida'
            : NOMES_DOS_MINIJOGOS[c.minijogo];
      gc.appendChild(
        this.botao(`Ir à casa ${i + 1} (${estado})`, () => {
          t.irACasa(i);
          this.alternar(false);
        }),
      );
    });
    this.corpo.appendChild(gc);
    if (casas.length > 0) {
      this.corpo.appendChild(
        this.seletor(
          [
            { id: '', nome: 'Minijogo das casas: sorteado' },
            ...TIPOS_DE_MINIJOGO.map((tp) => ({
              id: tp,
              nome: `Minijogo das casas: ${NOMES_DOS_MINIJOGOS[tp]}`,
            })),
          ],
          t.minijogoForcado() ?? '',
          (v) => {
            t.forcarMinijogo(v === '' ? null : (v as TipoMinijogo));
            this.desenhar();
          },
        ),
      );
      const gp = document.createElement('div');
      gp.className = 'grade';
      gp.append(
        this.botao('Rearmar casas', () => {
          t.rearmarCasas();
          this.desenhar();
        }),
        this.botao(
          t.perdaoGasto() ? 'Perdão: gasto (devolver)' : 'Perdão: disponível (gastar)',
          () => {
            t.alternarPerdao();
            this.desenhar();
          },
        ),
      );
      this.corpo.appendChild(gp);
      this.nota(
        'Ir à casa leva você à porta e tira os inimigos de perto: aperte F para bater. Com o ' +
          'perdão disponível, o primeiro erro não acorda a casa. Use Imortal (Atalhos) para ' +
          'enfrentar a Casa Desperta com calma.',
      );
    }
  }

  private copiar(): void {
    const texto = textoParaCopiar(ajustesAtuais());
    void navigator.clipboard?.writeText(texto).catch(() => undefined);
    this.aba = 'Atalhos';
    this.desenhar();
    const area = document.createElement('textarea');
    area.readOnly = true;
    area.value = texto;
    const h = document.createElement('h4');
    h.textContent = 'Ajustes (copiados para a área de transferência)';
    this.corpo.prepend(h, area);
  }

  private restaurar(): void {
    const alvo = this.alvo;
    const id = alvo?.campeaoId() ?? '';
    const antes = baseDoCampeao(id);
    const inimigosAntes = fotoDosInimigos();
    const mudados = Object.keys(ajustesAtuais());
    restaurarTudo();
    if (alvo) aplicarNasVivas(alvo.mundo(), alvo.heroi(), id, antes, inimigosAntes);
    if (import.meta.env.DEV) {
      // Desfaz no content/*.json o que esta sessão mudou.
      const volta: Ajustes = {};
      for (const k of mudados) {
        const s = separarChave(k);
        const v = s ? original(s.raiz, s.caminho) : undefined;
        if (v !== undefined) volta[k] = v;
      }
      this.gravar(volta);
    } else salvarAjustes(armazenamento(), {});
    this.desenhar();
  }
}
