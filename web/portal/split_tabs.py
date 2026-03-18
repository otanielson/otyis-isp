#!/usr/bin/env python3
"""Extrai cada aba do dashboard.html para arquivos separados em dashboard/tabs/."""
import re
import os

DASH = '/var/www/otyis-isp/web/portal/dashboard.html'
OUT_DIR = '/var/www/otyis-isp/web/portal/dashboard/tabs'

with open(DASH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Encontrar inícios das abas: <div class="admin-tab" ... id="tab-XXX">
tab_starts = []
for i, line in enumerate(lines):
    m = re.search(r'id="tab-([a-z0-9-]+)"', line)
    if m and 'admin-tab' in line:
        tab_starts.append((i + 1, m.group(1)))  # 1-based line number, tab id

def find_closing(lines, start_idx, max_idx=None):
    """start_idx é 0-based. Retorna índice (0-based) da linha do </div> que fecha o primeiro div.
    max_idx: não procurar além desta linha (ex.: próxima aba)."""
    if max_idx is None:
        max_idx = len(lines) - 1
    depth = 0
    for i in range(start_idx, min(len(lines), max_idx + 1)):
        line = lines[i]
        opens = len(re.findall(r'<div[\s>]', line))
        closes = len(re.findall(r'</div>', line))
        depth += opens - closes
        if depth == 0:
            return i
    return max_idx

os.makedirs(OUT_DIR, exist_ok=True)

for idx, (line_one_based, tab_id) in enumerate(tab_starts):
    start_idx = line_one_based - 1
    # Limitar busca até a próxima aba ou comentário de modais
    max_idx = len(lines) - 1
    for j in range(start_idx + 1, len(lines)):
        if j < len(lines) and ('id="tab-' in lines[j] or '========== Modais' in lines[j]):
            max_idx = j - 1
            break
    end_idx = find_closing(lines, start_idx, max_idx)
    # Conteúdo da aba (incluindo a div raiz)
    chunk = lines[start_idx:end_idx + 1]
    # Para overview, a primeira aba deve ter class "active"
    content = ''.join(chunk)
    out_path = os.path.join(OUT_DIR, tab_id + '.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('{} -> {} (linhas {}-{})'.format(tab_id, out_path, line_one_based, end_idx + 1))

print('Feito. {} abas extraídas.'.format(len(tab_starts)))
