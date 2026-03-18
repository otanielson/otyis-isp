-- Seed: catálogo de permissões do sistema (RBAC)
-- Execute após rbac_tenant_users_roles.sql

INSERT INTO tenant_permissions (code, name, is_active) VALUES
-- IAM (usuários/roles/permissões do painel)
('iam.permissions.read', 'Listar permissões', 1),
('iam.roles.read', 'Listar roles', 1),
('iam.roles.create', 'Criar roles', 1),
('iam.roles.update', 'Alterar roles e permissões', 1),
('iam.users.read', 'Listar usuários', 1),
('iam.users.create', 'Criar usuários', 1),
('iam.users.update', 'Alterar usuários e roles', 1),
-- NAS
('nas.view', 'Ver NAS', 1),
('nas.create', 'Criar NAS', 1),
('nas.edit', 'Editar NAS', 1),
('nas.delete', 'Excluir NAS', 1),
-- Clientes PPPoE
('pppoe.view', 'Ver clientes PPPoE', 1),
('pppoe.create', 'Criar clientes PPPoE', 1),
('pppoe.edit', 'Editar clientes PPPoE', 1),
('pppoe.block_unblock', 'Bloquear/desbloquear PPPoE', 1),
('pppoe.reset_password', 'Redefinir senha PPPoE', 1),
-- Planos/Perfis
('plans.view', 'Ver planos', 1),
('plans.create', 'Criar planos', 1),
('plans.edit', 'Editar planos', 1),
('plans.delete', 'Excluir planos', 1),
-- Sessões / Accounting
('sessions.view', 'Ver sessões', 1),
('sessions.disconnect', 'Desconectar sessão (CoA)', 1),
-- Relatórios
('reports.view', 'Ver relatórios', 1),
('reports.export', 'Exportar relatórios', 1),
-- Usuários do painel (staff)
('users.view', 'Ver usuários do painel', 1),
('users.create', 'Criar usuários', 1),
('users.edit', 'Editar usuários', 1),
('users.disable', 'Desativar usuários', 1),
('users.permissions_manage', 'Gerenciar permissões (Master)', 1),
-- Configurações
('settings.view', 'Ver configurações', 1),
('settings.edit', 'Editar configurações', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);
