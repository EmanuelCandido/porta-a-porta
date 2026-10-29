import { gerarCidade } from './cidade';
import type { Gerador, Luz, Modelos, ObjetoRua, Piso, Rua } from './content/esquemas';
import {
  escolherPeso,
  luzesDasJanelas,
  type FonteDeLuzRua,
  exploracaoVazia,
  type OpcoesGerador,
  type RuaGerada,
} from './gerador';
import { posicionador, type Rotacao } from './geometria';
import { Rng } from './rng';

const arred = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A praça do chefe do bairro: um quadrado cercado com postes amigos nos cantos (os preços ainda
 * apagam alguns), bancos e árvores, casas em volta olhando para ela, a entrada fechada ao sul e o
 * portão de saída ao norte, que só abre quando o chefe cai. Devolve o mesmo formato de uma rua
 * gerada (sem bueiros nem Postes Corrompidos), para as regras da rua servirem também aqui. Os
 * chefes de `arena.lugarDoChefe` ficam do lado oeste: no lugar da casa de lá entra a casa deles
 * (o mirante da Viúva) ou nada (o Dono do Bairro é a própria casa).
 */
export function gerarArena(
  semente: number,
  cfg: Gerador,
  modelos: Modelos,
  luz: Luz,
  opcoes: OpcoesGerador & { chefe?: string },
): RuaGerada {
  const rng = new Rng(semente);
  const a = cfg.arena;
  const bairro = cfg.bairros[Math.min(opcoes.bairro, cfg.bairros.length - 1)]!;
  const m = cfg.rua.margem;
  const faixa = cfg.faixaDasCasas;
  const px0 = m + faixa;
  const py0 = m + faixa;
  // O pátio próprio do chefe (o condomínio do Síndico) muda o tamanho e põe guarita e canteiros.
  const patio = opcoes.chefe ? a.patio[opcoes.chefe] : undefined;
  const px1 = px0 + (patio?.largura ?? a.largura);
  const py1 = py0 + (patio?.profundidade ?? a.profundidade);
  const largura = Math.ceil(px1 + faixa + m);
  const profundidade = Math.ceil(py1 + m + 1);
  const meio = (px0 + px1) / 2;
  const gx0 = meio - a.larguraPortao / 2;
  const gx1 = meio + a.larguraPortao / 2;

  const objetos: ObjetoRua[] = [];
  const velasDaArena: NonNullable<RuaGerada['velasDaArena']> = [];
  const add = (o: ObjetoRua): number => {
    objetos.push({ ...o, x: arred(o.x), y: arred(o.y) });
    return objetos.length - 1;
  };
  const portas: RuaGerada['portas'] = [];

  // ------------------------------------------------------------ casas em volta, de frente para a praça
  const casa = (x: number, y: number, rot: Rotacao): void => {
    const modelo = escolherPeso(rng, bairro.casas);
    const { largura: w, profundidade: d } = modelos[modelo].pegada;
    const deitado = rot === 90 || rot === 270;
    const W = deitado ? d : w;
    const D = deitado ? w : d;
    const ox = rot === 180 ? x : rot === 0 ? x - W : x - W / 2;
    const oy = rot === 90 ? y - D : y - D / 2;
    add({ modelo, x: ox, y: oy, rot, apagada: !!opcoes.semLuz });
    const p = posicionador(w, d, ox, oy, rot).pegada;
    if (rot === 0) portas.push({ x: p.x1 + 0.6, y: (p.y0 + p.y1) / 2, lado: 'oeste' });
    else if (rot === 180) portas.push({ x: p.x0 - 0.6, y: (p.y0 + p.y1) / 2, lado: 'leste' });
    else portas.push({ x: (p.x0 + p.x1) / 2, y: p.y1 + 0.6, lado: 'oeste' });
  };
  casa(px0 + (gx0 - px0) / 2, py0 - 0.4, 90);
  casa(gx1 + (px1 - gx1) / 2, py0 - 0.4, 90);
  const lugar = opcoes.chefe ? a.lugarDoChefe[opcoes.chefe] : undefined;
  let casaDoChefe: number | null = null;
  if (!lugar) casa(px0 - 0.4, (py0 + py1) / 2, 0);
  else if (lugar.casa) {
    // A fachada (fim da colisão) fica onde ficaria a das outras casas; o resto (a sacada do
    // mirante) passa por cima da cerca.
    const def = modelos[lugar.casa];
    const corpo = Math.max(...def.colisao.map((c) => c.x1));
    const oy = (py0 + py1) / 2 - def.pegada.profundidade / 2;
    casaDoChefe = add({
      modelo: lugar.casa,
      x: px0 - 0.4 - corpo,
      y: oy,
      rot: 0,
      apagada: !!opcoes.semLuz,
    });
    portas.push({ x: px0 - 0.4 + 0.6, y: (py0 + py1) / 2, lado: 'oeste' });
  }
  casa(px1 + 0.4, (py0 + py1) / 2, 180);

  // ------------------------------------------------------------ cerca e portões
  const seg = cfg.cerca.segmento;
  const cercaEmX = (y: number, x0: number, x1: number, abertura?: [number, number]) => {
    for (let x = x0; x < x1 - 1e-6; x += seg) {
      const b = Math.min(x + seg, x1);
      if (abertura && x < abertura[1] - 1e-6 && b > abertura[0] + 1e-6) continue;
      add({ modelo: 'cerca', x: b - seg, y: y - 0.15, rot: 0 });
    }
  };
  const pegadaDaCerca = posicionador(1, 0.3, 0, 0, 90).pegada;
  const espessuraDaCerca = pegadaDaCerca.x1 - pegadaDaCerca.x0;
  const cercaEmY = (x: number, y0: number, y1: number) => {
    const r = pegadaDaCerca;
    for (let y = y0; y < y1 - 1e-6; y += seg) {
      const b = Math.min(y + seg, y1);
      add({ modelo: 'cerca', x: x - (r.x1 - r.x0) / 2, y: b - seg, rot: 90 });
    }
  };
  cercaEmX(py0, px0, px1, [gx0, gx1]);
  cercaEmX(py1, px0, px1, [gx0, gx1]);
  const corpo = lugar?.corpo;
  const cy = (py0 + py1) / 2;
  if (corpo) {
    cercaEmY(px0, py0, cy - corpo.meiaLargura);
    cercaEmY(px0, cy + corpo.meiaLargura, py1);
  } else cercaEmY(px0, py0, py1);
  cercaEmY(px1, py0, py1);
  for (const y of [py0, py1]) {
    add({ modelo: 'pilar', x: gx0 - 0.5, y: y - 0.5, rot: 0 });
    add({ modelo: 'pilar', x: gx1 - 0.5, y: y - 0.5, rot: 0 });
  }
  if (patio?.cancela) {
    // Condomínio: cancelas listradas no lugar das grades (a de saída sobe quando o chefe cai).
    add({ modelo: 'cancela', x: gx0, y: py0 - 0.2, rot: 0, grupo: 'portao' });
    add({ modelo: 'cancela', x: gx0, y: py1 - 0.2, rot: 0 });
  } else {
    for (let x = gx0; x < gx1 - 1e-6; x += 1) {
      add({ modelo: 'grade', x, y: py0 - 0.15, rot: 90, grupo: 'portao' });
      add({ modelo: 'grade', x, y: py1 - 0.15, rot: 90 });
    }
  }
  if (patio) {
    const cy0 = (py0 + py1) / 2;
    if (patio.guarita) {
      const g = modelos.guarita.pegada;
      add({
        modelo: 'guarita',
        x: meio + patio.guarita[0] - g.largura / 2,
        y: cy0 + patio.guarita[1] - g.profundidade / 2,
        rot: 0,
      });
    }
    const c = modelos.canteiro.pegada;
    for (const [dx, dy] of patio.canteiros)
      add({
        modelo: 'canteiro',
        x: meio + dx - c.largura / 2,
        y: cy0 + dy - c.profundidade / 2,
        rot: 0,
      });
    // Velas da Viúva (apagadas: o jogador acende) e espelhos da Moradora (quebráveis).
    for (const [dx, dy] of patio.velas) {
      const pos = { x: meio + dx, y: cy0 + dy };
      const objeto = add({ modelo: 'vela', x: pos.x - 0.5, y: pos.y - 0.5, rot: 0, apagada: true });
      velasDaArena.push({ pos, objeto });
    }
    const e = modelos.espelho.pegada;
    for (const [dx, dy] of patio.espelhos)
      add({
        modelo: 'espelho',
        x: meio + dx - e.largura / 2,
        y: cy0 + dy - e.profundidade / 2,
        rot: dy < 0 ? 90 : 270,
      });
    // O jardim em duas alturas: um patamar de pedra diante da casa do chefe (lado oeste).
    if (patio.patamar) {
      const pt = modelos.patamar.pegada;
      add({ modelo: 'patamar', x: px0 + 0.1, y: cy0 - pt.profundidade / 2, rot: 0 });
    }
  }
  const grade = { x0: gx0 - 0.2, y0: py0 - 0.15, x1: gx1 + 0.2, y1: py0 + 0.15 };

  // ------------------------------------------------------------ postes, bancos e árvores
  const luzes: FonteDeLuzRua[] = [];
  const cantos = [
    { x: px0 + 1.3, y: py0 + 1.3 },
    { x: px1 - 1.3, y: py1 - 1.3 },
    { x: px1 - 1.3, y: py0 + 1.3 },
    { x: px0 + 1.3, y: py1 - 1.3 },
  ];
  const nPostes = opcoes.semLuz ? 0 : Math.min(a.postes, cantos.length);
  const apagados = Math.min(nPostes, opcoes.postesApagados ?? 0);
  for (let k = 0; k < nPostes; k++) {
    const c = cantos[k]!;
    const estado = k < apagados ? 'apagado' : 'amigo';
    const i = add({ modelo: 'poste', estado, x: c.x - 0.5, y: c.y - 0.5, rot: 0 });
    if (estado === 'amigo')
      luzes.push({ tipo: 'poste', x: c.x, y: c.y, raio: luz.poste.raio, objeto: i });
  }
  for (let k = 0; k < a.bancos; k++) {
    const oeste = k % 2 === 0;
    // Diante da casa do chefe não há banco (ficaria embaixo da sacada ou na frente da fachada).
    if (oeste && lugar) continue;
    add({
      modelo: 'banco',
      x: oeste ? px0 + 0.4 : px1 - 1.4,
      y: (py0 + py1) / 2 - 0.7 + (k >= 2 ? 3 : 0),
      rot: oeste ? 0 : 180,
    });
  }
  const lugaresArvore = [
    { x: px0 - 2.5, y: py1 - 1.5 },
    { x: px1 + 1.5, y: py1 - 1.5 },
    { x: px0 - 2.5, y: py0 + 1 },
    { x: px1 + 1.5, y: py0 + 1 },
  ];
  for (let k = 0; k < Math.min(a.arvores, lugaresArvore.length); k++) {
    const p = lugaresArvore[k]!;
    add({ modelo: 'arvore', x: p.x, y: p.y, rot: 0 });
  }

  // ------------------------------------------------------------ janelas
  if (!opcoes.semLuz) objetos.forEach((o, i) => luzes.push(...luzesDasJanelas(o, i, modelos, luz)));

  // ------------------------------------------------------------ chão e cidade em volta
  const piso: Piso[] = [
    { tipo: 'grama', x0: 0, y0: 0, x1: largura, y1: profundidade },
    { tipo: 'calcada', x0: px0 - 0.6, y0: py0 - 0.6, x1: px1 + 0.6, y1: py1 + 0.6 },
    { tipo: 'praca', x0: px0, y0: py0, x1: px1, y1: py1 },
    { tipo: 'asfalto', x0: gx0, y0: 0, x1: gx1, y1: py0 - 0.6 },
    { tipo: 'asfalto', x0: gx0, y0: py1 + 0.6, x1: gx1, y1: profundidade },
  ];
  // Canteiros de grama nos cantos de dentro da praça.
  for (const [cx, cy] of [
    [px0 + 0.4, py0 + 0.4],
    [px1 - 3.4, py0 + 0.4],
    [px0 + 0.4, py1 - 3.4],
    [px1 - 3.4, py1 - 3.4],
  ] as const)
    piso.push({ tipo: 'grama', x0: cx, y0: cy, x1: cx + 3, y1: cy + 3 });
  const cidade = gerarCidade(
    semente * 7919 + 29,
    {
      area: { x0: 0, y0: 0, x1: largura, y1: profundidade },
      continuacoes: [{ eixo: 'y', a0: gx0, a1: gx1, calcada: 1.2 }],
      bairro: opcoes.bairro,
    },
    cfg,
    modelos,
  );

  const rua: Rua = {
    id: `arena_${semente}`,
    nome: opcoes.nome ?? 'Praça',
    largura,
    profundidade,
    entrada: { x: meio, y: py1 - 2 },
    objetos,
    figurantes: [],
    bonecos: [],
    piso: [...cidade.piso, ...piso],
    cenario: cidade.cenario,
    mundo: cidade.mundo,
  };
  return {
    rua,
    ruaX: [px0, px1],
    yEntrada: py1,
    ySaida: py0,
    saida: { x0: gx0, y0: 0, x1: gx1, y1: py0 - 0.4 },
    grade,
    bueiros: [],
    bueirosFlanco: [],
    postesCorrompidos: [],
    quintais: [],
    luzes,
    portas,
    praca: { x: meio, y: (py0 + py1) / 2 },
    zonas: [],
    exploracao: exploracaoVazia(),
    rota: [
      { x: meio, y: py1 },
      { x: meio, y: py0 },
    ],
    // O bloqueio sobe sobre as pontas da cerca (a espessura dela): sem fresta entre a fachada e a
    // cerca, ninguém contorna a casa para o lado de fora da praça.
    bloqueado: corpo
      ? [
          {
            x0: px0 + corpo.x0,
            y0: cy - corpo.meiaLargura - espessuraDaCerca,
            x1: px0 + corpo.x1,
            y1: cy + corpo.meiaLargura + espessuraDaCerca,
          },
        ]
      : [],
    bloqueios: [],
    encontros: [],
    lugarDoChefe: lugar
      ? { pos: { x: px0 + lugar.dx, y: (py0 + py1) / 2 }, casa: casaDoChefe }
      : undefined,
    ...(velasDaArena.length > 0 ? { velasDaArena } : {}),
  };
}
