import { curar, definirModificadores, temEstado, vivo, type Estado } from './combate';
import type { Mundo, Sistema } from './mundo';

/**
 * As passivas que olham o mundo a cada tick (o Caldeirão vive no executor e o Remontar no caminho
 * do dano):
 * - Sede (Vampirinho): roubo de vida maior na sombra.
 * - Arrepio (Fantasma): depois de um tempo na sombra (ou invisível), o próximo golpe sai crítico e
 *   assusta as pestinhas em volta do alvo.
 */
export function criarSistemaPassivas(): Sistema {
  return {
    antesDeMover(mundo: Mundo) {
      for (const e of mundo.entidades) {
        const p = e.lancador?.passiva;
        const c = e.combate;
        if (!p || !c || !vivo(e)) continue;
        const naLuz = mundo.luz?.iluminado(e.pos) ?? false;
        if (p.tipo === 'sede' || p.tipo === 'luzDoDia') {
          // Luz do Dia: o mesmo roubo de vida na luz e na sombra.
          const roubo = p.tipo === 'luzDoDia' || naLuz ? p.rouboVida : p.rouboVidaNaSombra;
          const atual = c.mods.find((m) => m.origem === 'sede');
          if (atual?.soma !== roubo)
            definirModificadores(c, 'sede', [
              { origem: 'sede', atributo: 'rouboVida', soma: roubo },
            ]);
        } else if (p.tipo === 'arrepio') {
          const l = e.lancador!;
          const pronto = c.estados.some(
            (s): s is Extract<Estado, { tipo: 'preparado' }> =>
              s.tipo === 'preparado' && s.origem === 'arrepio',
          );
          const naSombra = !naLuz || temEstado(c, 'invisivel');
          // `contagemPassiva` guarda os segundos seguidos na sombra.
          l.contagemPassiva = naSombra && !pronto ? l.contagemPassiva + mundo.dt : 0;
          if (!pronto && l.contagemPassiva >= p.sombraS) {
            l.contagemPassiva = 0;
            c.estados.push({
              tipo: 'preparado',
              restante: Number.POSITIVE_INFINITY,
              mult: 0,
              critico: true,
              origem: 'arrepio',
              medo: { duracao: p.medo, raio: p.raio, alvos: p.assusta },
            });
            mundo.eventos.push({ tipo: 'arrepioPronto', id: e.id });
          }
        }
      }
    },
    // Luz do Dia: cada Poste Corrompido derrubado cura.
    depoisDoTick(mundo: Mundo, eventos) {
      if (!eventos.some((ev) => ev.tipo === 'posteCaiu')) return;
      for (const e of mundo.entidades) {
        const p = e.lancador?.passiva;
        if (p?.tipo !== 'luzDoDia' || !e.combate || !vivo(e)) continue;
        for (const ev of eventos)
          if (ev.tipo === 'posteCaiu')
            curar(mundo, e, e.combate.attr.coragemMax * p.curaPoste, 'luzDoDia');
      }
    },
  };
}
