#!/bin/sh
set -eu

# Executar somente no contêiner de QA; a instalação não alcança o sistema do autor.
dpkg -i /trabalho/entregas/porta-a-porta-linux-amd64.deb
test "$(stat -c '%u:%g:%a' /opt/porta-a-porta/chrome-sandbox)" = '0:0:4755'
desktop-file-validate /usr/share/applications/porta-a-porta.desktop
ldd /opt/porta-a-porta/porta-a-porta > /tmp/porta-a-porta-dependencias.txt
if grep -q 'not found' /tmp/porta-a-porta-dependencias.txt; then
  cat /tmp/porta-a-porta-dependencias.txt
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import re

versoes = set()
for arquivo in Path('/opt/porta-a-porta').iterdir():
    if not arquivo.is_file():
        continue
    dados = arquivo.read_bytes()
    if dados[:4] != b'\x7fELF':
        continue
    versoes.update(tuple(map(int, v.split(b'.'))) for v in re.findall(rb'GLIBC_(\d+\.\d+)', dados))
print('Maior versão GLIBC referenciada pelos binários:', '.'.join(map(str, max(versoes))))
PY

# Usuário comum, tela virtual e gerenciador de janelas para testar F11 de verdade.
exec runuser -u node -- env PORTA_A_PORTA_TESTE_CONTAINER=1 \
  xvfb-run -a -s '-screen 0 1600x1000x24' \
  sh -c 'openbox >/tmp/porta-a-porta-openbox.log 2>&1 & node scripts/verificar-aplicativo.mjs'
