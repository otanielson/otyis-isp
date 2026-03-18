export function onlyDigits(str: string = ''): string {
  return String(str).replace(/\D+/g, '');
}

export function normalizeWhatsapp(raw: string = ''): string {
  const d = onlyDigits(raw);
  if (d.startsWith('55')) return d;
  if (d.length >= 10) return '55' + d;
  return d;
}

export function requireFields(obj: Record<string, unknown> | null | undefined, fields: string[] = []): string | null {
  if (!obj) return 'Corpo da requisição inválido';
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') return `Campo obrigatório: ${f}`;
  }
  return null;
}

const VENCIMENTOS = [5, 10, 15, 20, 25] as const;

export function allowedVencimento(v: unknown): boolean {
  const n = Number(v);
  return (VENCIMENTOS as readonly number[]).includes(n);
}
