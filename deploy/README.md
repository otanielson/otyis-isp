# Deploy — Multi-Portal

**Regra:** Alterações são feitas sempre no **projeto de instalação** (este repositório/código-fonte). Depois, a **instalação existente** (VPS já rodando) é atualizada com os passos abaixo.

## Instalação (uma VPS por provedor)

A única forma oficial de instalar é o **instalador**:

```bash
cd /var/www/otyis-isp
sudo ./installer/install.sh
```

Ou na pasta atual: `sudo ./installer/install.sh --here`

Guia completo: **[installer/README.md](../installer/README.md)** e **[installer/PASSO-A-PASSO.md](../installer/PASSO-A-PASSO.md)**.

---

## Atualizar instalação existente

Depois de alterar o código **no projeto de instalação** (git pull ou cópia do código atualizado para a VPS):

```bash
cd /var/www/otyis-isp
git pull   # se usar git
npm ci
npm run build
npm run build:portal-spa   # gera portal SPA (login+dashboard em uma página)
./deploy.sh   # ou: sudo systemctl restart multi-portal
```

O script `./deploy.sh` já inclui `build:portal-spa`. Ele faz pull, build, gera o portal SPA, copia `web/` para `dist/web` e reinicia systemd ou PM2. Assim a **instalação existente** fica igual ao projeto de instalação. O painel `/admin` e o portal `/portal` passam a ter as mesmas funcionalidades do código atualizado.
