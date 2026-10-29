// A aba Testar do modo dev: cada fase vira os parâmetros de URL que a sessão já entende.

/** Fases para onde a aba Testar leva (recarrega a página com os parâmetros da URL). */
export const FASES = [
  { id: 'rua1', nome: 'Rua 1' },
  { id: 'rua2', nome: 'Rua 2' },
  { id: 'rua3', nome: 'Rua 3' },
  { id: 'porta', nome: 'Porta a Porta (depois da rua 1)' },
  { id: 'chefe', nome: 'Chefe do bairro' },
  { id: 'moradora', nome: 'A Moradora do 13 (duelo final)' },
  { id: 'treino', nome: 'Rua de treino' },
] as const;

/** A fase da URL atual (o painel abre nela depois de recarregar). */
export function escolhaDaUrl(busca: string): {
  fase: string;
  bairro: number;
  campeao: string;
  semente: string;
} {
  const p = new URLSearchParams(busca);
  const [b, r] = (p.get('posicao') ?? '').split('-').map(Number);
  const bairro = Math.max(0, (b || Number(p.get('bairro')) || 1) - 1);
  const fase =
    p.get('modo') === 'treino'
      ? 'treino'
      : p.get('moradora') === '1'
        ? 'moradora'
        : p.get('chefe') === '1'
          ? 'chefe'
          : p.get('porta') === '1'
            ? 'porta'
            : `rua${r && r >= 1 && r <= 3 ? r : 1}`;
  return { fase, bairro, campeao: p.get('campeao') ?? 'bruxinha', semente: p.get('semente') ?? '' };
}

/** Monta a URL da fase escolhida (no jogo publicado, `dev=1` mantém o painel). */
export function urlDaFase(
  fase: string,
  bairro: number,
  campeao: string,
  semente: string,
  publicado: boolean,
): string {
  const p = new URLSearchParams();
  const b = bairro + 1;
  if (fase.startsWith('rua')) p.set('posicao', `${b}-${fase.slice(3)}`);
  else if (fase === 'porta') {
    p.set('posicao', `${b}-1`);
    p.set('porta', '1');
  } else if (fase === 'chefe') {
    p.set('bairro', String(b));
    p.set('chefe', '1');
  } else if (fase === 'moradora') p.set('moradora', '1');
  else p.set('modo', 'treino');
  p.set('campeao', campeao);
  if (semente.trim() !== '' && Number.isFinite(Number(semente))) p.set('semente', semente.trim());
  if (publicado) p.set('dev', '1');
  return `?${p.toString()}`;
}
