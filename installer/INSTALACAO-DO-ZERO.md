# Instalação do zero — Novo sistema

Guia para **começar do zero** na VPS: limpar o que existia e instalar um provedor novo com systemd.

---

## 1. Limpar o que existia

Execute na VPS como **root** (ou com `sudo`).

### 1.1 Tirar o app do PM2 (se estiver usando)

```bash
pm2 delete otyis-isp
pm2 save
```

(Otros apps no PM2, como otnchat-api e rh-easy, continuam normalmente.)

### 1.2 Parar e desabilitar o systemd do portal (se existir)

```bash
sudo systemctl stop multi-portal
sudo systemctl disable multi-portal
```

### 1.3 (Opcional) Limpar banco antigo para começar 100% novo

Só faça isso se quiser **apagar o provedor anterior** e criar outro do zero. Substitua `NOME_DO_BANCO_ANTIGO` pelo nome do banco que o instalador criou antes (ex.: `multinet`, `portal_multinet`).

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS NOME_DO_BANCO_ANTIGO;"
sudo -u postgres psql -c "DROP ROLE IF EXISTS USUARIO_ANTIGO;"   # mesmo nome do usuário do banco
```

Se não quiser apagar o banco, pule este passo — o instalador vai pedir **nome do provedor, slug e banco**; use um **nome de banco novo** (ex.: `portal_meunovo`) para não conflitar.

---

## 2. Código do projeto na VPS

- Código já em `/var/www/otyis-isp` (com `installer/`, `sql/`, `src/`, `package.json`, etc.), **ou**
- Clonar: `sudo git clone <url-do-repositorio> /var/www/otyis-isp`

---

## 3. Rodar o instalador

```bash
cd /var/www/otyis-isp
sudo ./installer/install.sh
```

**Não use** `--pm2` — assim o app passa a rodar pelo **systemd** (recomendado para instalação do zero).

O script vai perguntar:

| Pergunta | Exemplo |
|----------|---------|
| Nome do provedor | Minha Net |
| Slug | minhanet |
| Nome do banco PostgreSQL | portal_minhanet |
| Usuário PostgreSQL | portal_minhanet |
| Senha do PostgreSQL | (defina uma senha forte) |
| E-mail do usuário Master | admin@minhanet.com.br |
| Senha do usuário Master | (defina uma senha) |
| Chave RADIUS | (Enter = gerar automático) |

---

## 4. Após a instalação

O instalador mostra um resumo. Anote:

- **ADMIN_KEY** (no `.env`) — para login no Painel do dono
- **Chave RADIUS** — para configurar no MikroTik/NAS

Substitua `IP_DA_VPS` pelo IP da sua VPS (ex.: `191.252.210.31`).

| O quê | URL |
|-------|-----|
| **Site do provedor** | http://IP_DA_VPS:8080/ — a raiz já abre a home do provedor criado |
| **Portal admin** | http://IP_DA_VPS:8080/portal/ |
| **Painel do dono** | http://IP_DA_VPS:8080/admin — login com ADMIN_KEY; em Visão geral use **Editar** para alterar nome, slug e e-mail do Master |

**Importante:** O app roda pelo **systemd**, não pelo PM2. Não adicione este app ao PM2.

**Comandos úteis:**

```bash
sudo systemctl status multi-portal
sudo systemctl status freeradius-standalone
journalctl -u multi-portal -f
```

### FreeRADIUS (freeradius-standalone)

O instalador **para e desabilita** o serviço `freeradius` do pacote (que usa `/etc/freeradius`) para liberar as portas **1812** (auth) e **1813** (accounting). Se o `freeradius-standalone` falhar ao iniciar:

- **Porta em uso:** confira com `ss -ulnp | grep -E '1812|1813'`. Se outro processo estiver usando, pare-o (ex.: `sudo systemctl stop freeradius`) e inicie de novo: `sudo systemctl start freeradius-standalone`.
- **Logs:** `journalctl -u freeradius-standalone -n 50` (o serviço usa `-l stdout`, então erros aparecem no journal).
- **Debug manual:** `sudo /usr/sbin/freeradius -d /var/www/otyis-isp/radius -X` (roda em primeiro plano com debug; Ctrl+C para encerrar).

Se faltar o driver PostgreSQL no FreeRADIUS: `sudo apt install freeradius-postgresql` e reinicie o serviço.

### MikroTik / NAS não chega no RADIUS

Se o concentrador não conseguir falar com o RADIUS:

1. **IP no MikroTik:** O servidor RADIUS no MikroTik deve ser o **IP deste servidor** (VPS ou LAN), **não** 127.0.0.1. No `.env` do projeto, defina `RADIUS_HOST=` com o IP que o MikroTik usa para alcançar a VPS (ex.: IP público ou 192.168.x.x). Reinicie o app e use no MikroTik o mesmo valor que aparece em Portal → Dashboard → Sistema (Chave RADIUS / Host).

2. **Firewall:** Libere UDP **1812** (auth) e **1813** (accounting), por exemplo:
   ```bash
   sudo ufw allow 1812/udp
   sudo ufw allow 1813/udp
   sudo ufw reload
   ```
   (Ou o equivalente no seu firewall.)

3. **Secret:** A chave no MikroTik deve ser **exatamente** a mesma do dashboard (e do `RADIUS_SECRET` no `.env`).

4. **Concentrador no portal:** Em Portal → Dashboard → Sistema, cadastre o NAS (IP do MikroTik, nome, mesma chave). O FreeRADIUS aceita qualquer IP pelo `clients.conf` (0.0.0.0), mas cadastrar ajuda na listagem e no secret por equipamento.

### PPPoE / MS-CHAP (usuário não recebe Access-Accept)

O instalador já deixa o FreeRADIUS com **MS-CHAP** ativo (MikroTik PPPoE usa MS-CHAP2). Os usuários precisam estar em `radcheck` com **Cleartext-Password** e **op = ':='** (não `==`). O portal, ao definir/alterar senha PPPoE, já grava com `op :=`. Se um usuário foi criado antes ou por outro meio com `op ==`, corrija no PostgreSQL:

```sql
UPDATE radcheck SET op = ':=' WHERE username = 'usuario@provedor.com' AND attribute = 'Cleartext-Password';
```

---

## 5. Resumo rápido (checklist)

- [ ] `pm2 delete otyis-isp` e `pm2 save`
- [ ] `systemctl stop multi-portal` e `systemctl disable multi-portal`
- [ ] (Opcional) Dropar banco/usuário antigo no PostgreSQL
- [ ] `cd /var/www/otyis-isp`
- [ ] `sudo ./installer/install.sh`
- [ ] Responder às perguntas (nome, slug, banco, Master, RADIUS)
- [ ] Acessar http://IP_DA_VPS:8080/ (site do provedor) e http://IP_DA_VPS:8080/portal/ (admin)

Pronto: instalação do zero concluída. O instalador já configura permissões no banco para o app encontrar o tenant e exibir a página do provedor em /.
