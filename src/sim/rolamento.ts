import { aplicarEstado, podeAgir, vivo, type ConfigEstados } from './combate';
import type { Jogador } from './content/esquemas';
import { entidade, forcarMovimento, type Sistema } from './mundo';

/**
 * Rolamento do jogador (estilo Minecraft Dungeons): um impulso curto na direção pedida que passa
 * pelos corpos e deixa sem levar dano por um instante. Recarga própria, fora das habilidades.
 */
export function criarSistemaRolamento(cfg: Jogador['rolamento'], estados: ConfigEstados): Sistema {
  return {
    antesDeMover(mundo, acoes) {
      for (const ac of acoes) {
        if (ac.tipo !== 'rolar') continue;
        const e = entidade(mundo, ac.id);
        if (!e || !vivo(e) || !podeAgir(e) || e.forcado) continue;
        if ((e.rolarEm ?? 0) > mundo.tick) continue;
        const n = Math.hypot(ac.x, ac.y);
        const dir = n > 1e-6 ? { x: ac.x / n, y: ac.y / n } : { ...e.olhar };
        // Rolar interrompe o golpe que estava preparando, como um passo.
        if (e.ataque) e.ataque.preparo = null;
        forcarMovimento(e, dir, cfg.distancia, cfg.velocidade, true, false);
        aplicarEstado(e, { tipo: 'imune', restante: cfg.imuneS }, estados);
        e.olhar = { ...dir };
        e.rolarEm = mundo.tick + Math.round(cfg.recargaS / mundo.dt);
        e.rolando = {
          ate: mundo.tick + Math.ceil(cfg.distancia / cfg.velocidade / mundo.dt),
          atingidos: [],
        };
        mundo.eventos.push({ tipo: 'rolou', id: e.id, x: dir.x, y: dir.y });
      }
    },

    /** Quem o rolamento atravessa (só os inimigos pequenos, que recuam) fica tonto. */
    depoisDeMover(mundo) {
      if (cfg.tontoS <= 0) return;
      for (const e of mundo.entidades) {
        const r = e.rolando;
        if (!r) continue;
        if (r.ate < mundo.tick) {
          e.rolando = undefined;
          continue;
        }
        for (const o of mundo.entidades) {
          if (o.tipo !== 'inimigo' || !vivo(o) || !o.combate?.recuo) continue;
          if (r.atingidos.includes(o.id)) continue;
          if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > e.raio + o.raio) continue;
          r.atingidos.push(o.id);
          aplicarEstado(o, { tipo: 'atordoado', restante: cfg.tontoS }, estados);
          if (o.ataque) o.ataque.preparo = null;
          mundo.eventos.push({ tipo: 'tonto', id: o.id, pos: { ...o.pos } });
        }
      }
    },
  };
}
