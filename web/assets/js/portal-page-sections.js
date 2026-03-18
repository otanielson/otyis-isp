"use strict";
(function () {
  function host() {
    return document.getElementById("portal-page-host") || document.body;
  }

  function addSection(id, title, bodyHtml, extraClass) {
    if (document.getElementById(id)) return;
    const section = document.createElement("section");
    section.id = id;
    section.className = "portal-page-section d-none " + (extraClass || "");
    section.setAttribute("data-page-section", "true");
    section.innerHTML =
      '<div class="admin-panel mb-3">' +
        '<div class="admin-panel__head d-flex justify-content-between align-items-center flex-wrap gap-2">' +
          '<span class="fw-semibold">' + title + '</span>' +
          '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="safeHideModal(\'' + id + '\')">Voltar</button>' +
        '</div>' +
        '<div class="admin-panel__body">' + bodyHtml + '</div>' +
      '</div>';
    host().appendChild(section);
  }

  function buildLeadPage() {
    addSection(
      "modalLead",
      "Detalhe do pedido",
      '<input type="hidden" id="leadId" />' +
        '<div class="d-flex justify-content-between align-items-center mb-2"><div><strong>Pedido</strong> <span id="modalLeadId"></span></div>' +
        '<div class="btn-group btn-group-sm"><button type="button" class="btn btn-primary" id="btnSaveLeadStatus">Salvar status</button></div></div>' +
        '<div id="modalLeadBody" class="border rounded p-3 mb-3 bg-light"></div>' +
        '<div class="row g-3"><div class="col-md-4"><label class="form-label small">Status</label><select class="form-select form-select-sm" id="leadStatusSelect"><option value="NEW">Novo</option><option value="CONTACTED">Contatado</option><option value="SCHEDULED">Agendado</option><option value="INSTALLED">Instalado</option><option value="CANCELLED">Cancelado</option></select></div></div>'
    );
  }

  function buildServiceOrderPage() {
    addSection(
      "modalServiceOrderDetail",
      "Ordem de Serviço",
      '<input type="hidden" id="osDetailOsId" />' +
        '<div class="d-flex justify-content-between align-items-center mb-2"><div><strong>OS</strong> <span id="osDetailId"></span></div>' +
        '<div class="btn-group btn-group-sm"><button type="button" class="btn btn-primary" id="btnSaveServiceOrderDetail">Salvar alterações</button></div></div>' +
        '<dl id="osDetailFields" class="row small mb-3"></dl>' +
        '<div class="row g-3">' +
          '<div class="col-md-4"><label class="form-label small">Status</label><select class="form-select form-select-sm" id="osDetailStatus"><option value="OPEN">Aberto</option><option value="IN_PROGRESS">Em andamento</option><option value="PENDING">Pendente</option><option value="COMPLETED">Concluído</option><option value="CANCELLED">Cancelado</option></select></div>' +
          '<div class="col-12"><label class="form-label small">Resolução / observação</label><textarea class="form-control form-control-sm" id="osDetailResolution" rows="4"></textarea></div>' +
        '</div>'
    );

    addSection(
      "modalNewServiceOrder",
      "Nova Ordem de Serviço",
      '<div class="mb-2"><label class="form-label small">Cliente</label><input type="hidden" id="newOsCustomerId" /><input type="text" class="form-control form-control-sm" id="newOsCustomerSearch" placeholder="Buscar cliente"></div>' +
        '<div id="newOsCustomerSearchResults" class="list-group d-none mb-2"></div>' +
        '<div class="mb-2"><small class="text-muted">Selecionado: <span id="newOsCustomerDisplay">Opcional — deixe vazio para OS sem vínculo</span></small></div>' +
        '<div class="row g-2 mb-2"><div class="col-md-4"><label class="form-label small">Tipo</label><select class="form-select form-select-sm" id="newOsType"><option value="INSTALLATION">Instalação</option><option value="MAINTENANCE">Manutenção</option><option value="SUPPORT">Suporte</option><option value="UPGRADE">Upgrade</option><option value="OTHER">Outro</option></select></div>' +
        '<div class="col-md-4"><label class="form-label small">Data prevista</label><input type="date" class="form-control form-control-sm" id="newOsDueDate"></div></div>' +
        '<div class="mb-2"><label class="form-label small">Descrição</label><textarea class="form-control form-control-sm" id="newOsDescription" rows="4"></textarea></div>' +
        '<div class="d-flex gap-2"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalNewServiceOrder\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnSaveNewServiceOrder">Criar OS</button></div>'
    );

    addSection(
      "modalTicket",
      "Atendimento de chamado",
      '<input type="hidden" id="ticketId" /><div class="mb-2"><strong>ID:</strong> <span id="ticketModalId">—</span><div class="small text-muted" id="ticketModalCustomerInfo"></div></div>' +
        '<div class="row g-3"><div class="col-lg-6"><div class="mb-2"><label class="form-label small">Buscar cliente</label><input type="text" class="form-control form-control-sm" id="ticketCustomerSearch"><div id="ticketCustomerSearchResults" class="list-group d-none position-relative"></div></div>' +
        '<div class="row g-2"><div class="col-md-3"><label class="form-label small">ID</label><input type="text" class="form-control form-control-sm" id="ticketCustomerId" readonly></div><div class="col-md-5"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="ticketCustomerName" readonly></div><div class="col-md-4"><label class="form-label small">WhatsApp</label><input type="text" class="form-control form-control-sm" id="ticketCustomerWhatsapp" readonly></div></div>' +
        '<div class="small text-muted mt-1">Selecionado: <span id="ticketCustomerIdDisplay">—</span> <span id="ticketCustomerNameDisplay"></span> <span id="ticketCustomerWhatsappDisplay"></span></div></div>' +
        '<div class="col-lg-6"><label class="form-label small">Assunto</label><input type="text" class="form-control form-control-sm" id="ticketSubject"><div class="row g-2 mt-2"><div class="col-md-6"><label class="form-label small">Prioridade</label><select class="form-select form-select-sm" id="ticketPriority"><option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option></select></div><div class="col-md-6"><label class="form-label small">Status</label><select class="form-select form-select-sm" id="ticketStatus"><option value="OPEN">Aberto</option><option value="IN_PROGRESS">Em andamento</option><option value="PENDING">Pendente</option><option value="RESOLVED">Resolvido</option><option value="CLOSED">Fechado</option></select></div></div></div></div>' +
        '<div class="row g-3 mt-1"><div class="col-12"><label class="form-label small">Defeito constatado</label><textarea class="form-control form-control-sm" id="ticketDefectText" rows="4"></textarea></div><div class="col-12"><label class="form-label small">Solução do problema</label><textarea class="form-control form-control-sm" id="ticketSolutionText" rows="4"></textarea></div></div>' +
        '<div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" id="btnTicketClearCustomer">Limpar cliente</button><button type="button" class="btn btn-outline-secondary btn-sm" id="btnPrintTicket">Imprimir</button><button type="button" class="btn btn-primary btn-sm" id="btnSaveTicket">Salvar</button><button type="button" class="btn btn-success btn-sm" id="btnFinalizeTicket">Finalizar chamado</button></div>'
    );
  }

  function buildContractPages() {
    addSection(
      "modalContractModel",
      "Modelo de contrato",
      '<h6 id="contractModelModalTitle" class="mb-3">Novo modelo de contrato</h6><input type="hidden" id="contractModelId" />' +
        '<div class="row g-3"><div class="col-md-8"><label class="form-label small">Nome do modelo</label><input type="text" class="form-control form-control-sm" id="contractModelName"></div><div class="col-md-4"><label class="form-label small">Padrão</label><div class="form-check mt-2"><input type="checkbox" class="form-check-input" id="contractModelIsDefault"><label class="form-check-label" for="contractModelIsDefault">Usar como padrão</label></div></div></div>' +
        '<div class="mt-2"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="contractModelDescription"></div>' +
        '<div class="mt-2"><label class="form-label small">Texto do contrato</label><div id="contractModelEditor" style="min-height:240px;background:#fff;border:1px solid #ddd;border-radius:.375rem"></div></div>' +
        '<div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnSaveContractModel">Salvar modelo</button></div>'
    );

    addSection(
      "modalCadContratoEditarValor",
      "Preço personalizado",
      '<div class="row g-3"><div class="col-md-4"><label class="form-label small">Valor (R$)</label><input type="number" step="0.01" class="form-control form-control-sm" id="cadContratoValorCustom"></div><div class="col-md-8"><label class="form-label small">Motivo (opcional)</label><input type="text" class="form-control form-control-sm" id="cadContratoValorMotivo"></div></div>' +
        '<div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalCadContratoEditarValor\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnCadContratoConfirmarValor">Aplicar</button></div>'
    );

    addSection(
      "modalCadastrarContrato",
      "Novo contrato",
      '<input type="hidden" id="cadContratoCustomerId" />' +
        '<div class="mb-2"><strong>Cliente:</strong> <span id="cadContratoClienteNome">—</span></div>' +
        '<div id="cadContratoClienteCard" class="alert alert-light py-2 mb-3">Contrato do cliente selecionado</div>' +
        '<div id="cadContratoErro" class="alert alert-danger d-none py-2 small"></div>' +
        '<div class="cad-contrato-wizard mb-3">' +
          '<button type="button" class="btn btn-outline-primary btn-sm cad-contrato-wizard-step active" data-cad-step="1">1 Plano</button>' +
          '<button type="button" class="btn btn-outline-primary btn-sm cad-contrato-wizard-step" data-cad-step="2">2 Acesso</button>' +
          '<button type="button" class="btn btn-outline-primary btn-sm cad-contrato-wizard-step" data-cad-step="3">3 Documento</button>' +
          '<button type="button" class="btn btn-outline-primary btn-sm cad-contrato-wizard-step" data-cad-step="4">4 Revisão</button>' +
        '</div>' +
        '<div id="cadContratoPane1" class="cad-contrato-pane">' +
          '<div class="row g-3"><div class="col-md-6"><label class="form-label small">Plano</label><select class="form-select form-select-sm" id="cadContratoPlano"></select></div><div class="col-md-3"><label class="form-label small">Valor mensal</label><input type="number" step="0.01" class="form-control form-control-sm" id="cadContratoValor"></div><div class="col-md-3"><label class="form-label small">Vencimento</label><input type="number" min="1" max="28" class="form-control form-control-sm" id="cadContratoVencimento" value="10"></div></div>' +
          '<div class="row g-3 mt-1"><div class="col-md-3"><label class="form-label small">Gerar fatura</label><select class="form-select form-select-sm" id="cadContratoGerarFatura"><option value="1">Sim</option><option value="0">Não</option></select></div><div class="col-md-3"><label class="form-label small">Desconto recorrente</label><input type="text" class="form-control form-control-sm" id="cadContratoDescontoRecorrente"></div><div class="col-md-3"><label class="form-label small">Desconto até venc.</label><input type="number" step="0.01" class="form-control form-control-sm" id="cadContratoDescontoAteVenc"></div><div class="col-md-3"><label class="form-label small">Acréscimo</label><input type="number" step="0.01" class="form-control form-control-sm" id="cadContratoAcrescimo"></div></div>' +
          '<div class="row g-3 mt-1"><div class="col-md-6"><label class="form-label small">Isentar até</label><input type="date" class="form-control form-control-sm" id="cadContratoIsentarAte"></div><div class="col-md-6"><label class="form-label small">Liberar até</label><input type="date" class="form-control form-control-sm" id="cadContratoLiberarAte"></div></div>' +
          '<div class="mt-2"><label class="form-label small">Observações</label><textarea class="form-control form-control-sm" id="cadContratoObs" rows="2"></textarea></div>' +
          '<div class="mt-2 d-flex gap-2 align-items-center"><span class="small text-muted">Total calculado:</span><strong id="cadContratoTotalCalculado">R$ 0,00</strong></div>' +
        '</div>' +
        '<div id="cadContratoPane2" class="cad-contrato-pane d-none">' +
          '<div class="row g-3"><div class="col-md-4"><label class="form-label small">Já está instalado?</label><div class="d-flex gap-3 mt-2"><div class="form-check"><input type="radio" class="form-check-input" name="cadContratoJaInstalado" id="cadContratoJaInstaladoNao" checked><label class="form-check-label" for="cadContratoJaInstaladoNao">Não</label></div><div class="form-check"><input type="radio" class="form-check-input" name="cadContratoJaInstalado" id="cadContratoJaInstaladoSim"><label class="form-check-label" for="cadContratoJaInstaladoSim">Sim</label></div></div></div><div class="col-md-4"><label class="form-label small">Criar acesso agora</label><input type="checkbox" class="form-check-input d-block mt-2" id="cadContratoCriarAcesso" checked></div><div class="col-md-4"><label class="form-label small">Sugerir login</label><button type="button" class="btn btn-outline-primary btn-sm d-block mt-2" id="btnCadContratoSugerirLogin">Sugerir</button></div></div>' +
          '<div id="cadContratoBlocoNaoInstalado" class="mt-3"><div class="row g-3"><div class="col-md-6"><label class="form-label small">Usuário PPPoE</label><input type="text" class="form-control form-control-sm" id="cadContratoLogin"></div><div class="col-md-6"><label class="form-label small">Senha PPPoE</label><input type="text" class="form-control form-control-sm" id="cadContratoSenha"></div><div class="col-md-3"><button type="button" class="btn btn-outline-secondary btn-sm mt-2" id="btnCadContratoGerarSenha">Gerar senha</button></div><div class="col-md-3"><button type="button" class="btn btn-outline-secondary btn-sm mt-2" id="btnCadContratoCopiarSenha">Copiar senha</button></div></div></div>' +
          '<div id="cadContratoBlocoJaInstalado" class="mt-3 d-none"><div class="row g-3"><div class="col-md-6"><label class="form-label small">Usuário</label><input type="text" class="form-control form-control-sm" id="cadContratoLoginInstalado"></div><div class="col-md-6"><label class="form-label small">Senha</label><input type="text" class="form-control form-control-sm" id="cadContratoSenhaInstalado"></div></div></div>' +
        '</div>' +
        '<div id="cadContratoPane3" class="cad-contrato-pane d-none">' +
          '<div class="row g-3"><div class="col-md-8"><label class="form-label small">Modelo do contrato</label><select class="form-select form-select-sm" id="cadContratoModeloDocumento"></select></div><div class="col-md-4"><label class="form-label small">Modo de geração</label><div class="d-flex gap-2 mt-2"><div class="form-check"><input type="radio" class="form-check-input" name="cadContratoModo" id="cadContratoModoA" checked><label class="form-check-label" for="cadContratoModoA">Automático</label></div><div class="form-check"><input type="radio" class="form-check-input" name="cadContratoModo" id="cadContratoModoB"><label class="form-check-label" for="cadContratoModoB">Assinatura antes</label></div><div class="form-check"><input type="radio" class="form-check-input" name="cadContratoModo" id="cadContratoModoC"><label class="form-check-label" for="cadContratoModoC">Gerar depois</label></div></div></div></div>' +
          '<div class="mt-2"><label class="form-label small">Aceite dos termos</label><input type="checkbox" class="form-check-input ms-2" id="cadContratoAceite"></div>' +
          '<div class="mt-2 text-muted" id="cadContratoPreviewPlaceholder">Pré-visualização</div><iframe id="cadContratoPreviewIframe" style="display:none;width:100%;min-height:220px;border:1px solid #ddd"></iframe>' +
        '</div>' +
        '<div id="cadContratoPane4" class="cad-contrato-pane d-none">' +
          '<dl class="row small mb-3">' +
            '<dt class="col-sm-3">Plano</dt><dd class="col-sm-9" id="cadContratoResumoPlano">—</dd>' +
            '<dt class="col-sm-3">Valor</dt><dd class="col-sm-9" id="cadContratoResumoValor">—</dd>' +
            '<dt class="col-sm-3">Vencimento</dt><dd class="col-sm-9" id="cadContratoResumoVencimento">—</dd>' +
            '<dt class="col-sm-3">Primeira cobrança</dt><dd class="col-sm-9" id="cadContratoResumoPrimeiraCobranca">—</dd>' +
            '<dt class="col-sm-3">Gerar fatura</dt><dd class="col-sm-9" id="cadContratoResumoGerarFatura">—</dd>' +
            '<dt class="col-sm-3">Acesso</dt><dd class="col-sm-9" id="cadContratoResumoAcesso">—</dd>' +
            '<dt class="col-sm-3">Contrato</dt><dd class="col-sm-9" id="cadContratoResumoDocumento">—</dd>' +
          '</dl>' +
        '</div>' +
        '<div class="mt-2"><label class="form-label small">Equipamentos / comodato</label><div id="cadContratoEquipamentosList"></div><template id="cadContratoEquipamentoRowTpl"><div class="cad-contrato-equipamento-row row g-2 align-items-end mb-2"><div class="col-md-2"><select class="form-select form-select-sm cad-eq-tipo"><option value="COMODATO">Comodato</option><option value="VENDA">Venda</option></select></div><div class="col-md-3"><input type="text" class="form-control form-control-sm cad-eq-item" placeholder="Item/Modelo"></div><div class="col-md-2"><input type="text" class="form-control form-control-sm cad-eq-serial" placeholder="Serial / MAC"></div><div class="col-md-2 cad-eq-valor-wrap"><input type="number" step="0.01" class="form-control form-control-sm cad-eq-valor" placeholder="Valor"></div><div class="col-md-2 cad-eq-multa-wrap"><input type="number" step="0.01" class="form-control form-control-sm cad-eq-multa" placeholder="Multa"></div><div class="col-md-1"><input type="number" class="form-control form-control-sm cad-eq-os" placeholder="OS"></div><div class="col-md-1"><button type="button" class="btn btn-sm btn-outline-danger cad-eq-remove">x</button></div></div></template><button type="button" class="btn btn-outline-primary btn-sm mt-2" id="btnCadContratoAddEquipamento">Adicionar item</button></div>' +
        '<div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" id="btnCadContratoAnterior">Anterior</button><button type="button" class="btn btn-primary btn-sm" id="btnCadContratoProximo"><span class="btn-text">Próximo</span></button><button type="button" class="btn btn-success btn-sm d-none" id="btnSalvarCadastroContrato">Finalizar</button><button type="button" class="btn btn-outline-secondary btn-sm" id="btnCadContratoAtualizarPreview">Atualizar pré-visualização</button></div>'
    );

    addSection(
      "modalServicoDados",
      "Dados do serviço",
      '<div id="modalServicoDadosBody"></div>'
    );
  }

  function buildFinancePages() {
    addSection(
      "modalGatewayList",
      "Gateway de Pagamento",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3"><select class="form-select form-select-sm" id="gatewayFilterActive" style="max-width:150px"><option value="">Todos</option><option value="1">Ativos</option><option value="0">Inativos</option></select><input type="text" class="form-control form-control-sm" id="gatewayFilterSearch" placeholder="Buscar..." style="max-width:220px"><button type="button" class="btn btn-sm btn-outline-primary" id="btnGatewayBuscar">Buscar</button><button type="button" class="btn btn-sm btn-primary" id="btnGatewayCadastrar">Cadastrar gateway</button></div><div id="outGatewayList">Carregando...</div>'
    );
    addSection(
      "modalGatewayForm",
      "Cadastrar gateway",
      '<h6 id="modalGatewayFormTitle" class="mb-3">Cadastrar gateway</h6><input type="hidden" id="gatewayFormId"><div class="row g-3"><div class="col-md-6"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="gatewayFormDescription"></div><div class="col-md-3"><label class="form-label small">Gateway</label><select class="form-select form-select-sm" id="gatewayFormType"><option value="gerencianet">GerenciaNet</option><option value="gerencianet_pix">GerenciaNet PIX</option><option value="cora_api">Cora API</option><option value="cora_api_v2">Cora API V2</option><option value="boleto_facil">Boleto Fácil</option><option value="widepay">WidePay</option><option value="pagar_me">Pagar.me</option><option value="asaas">Asaas</option><option value="outro">Outro</option></select></div><div class="col-md-3"><label class="form-label small">Portadores</label><input type="text" class="form-control form-control-sm" id="gatewayFormPortadores"></div></div><div class="row g-3 mt-1"><div class="col-md-3"><div class="form-check"><input type="checkbox" class="form-check-input" id="gatewayFormPix"><label class="form-check-label">Pix</label></div></div><div class="col-md-3"><div class="form-check"><input type="checkbox" class="form-check-input" id="gatewayFormCard"><label class="form-check-label">Cartão</label></div></div><div class="col-md-3"><div class="form-check"><input type="checkbox" class="form-check-input" id="gatewayFormBoleto"><label class="form-check-label">Boleto</label></div></div><div class="col-md-3"><div class="form-check"><input type="checkbox" class="form-check-input" id="gatewayFormRetorno"><label class="form-check-label">Retorno</label></div></div></div><div id="gatewayFormEfiWrap" class="mt-3"><div class="row g-3"><div class="col-md-6"><label class="form-label small">Client ID</label><input type="text" class="form-control form-control-sm" id="gatewayFormClientId"></div><div class="col-md-6"><label class="form-label small">Client Secret</label><input type="text" class="form-control form-control-sm" id="gatewayFormClientSecret"></div><div class="col-md-3"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="gatewayFormSandbox"><label class="form-check-label">Sandbox</label></div></div><div class="col-md-3"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="gatewayFormActive" checked><label class="form-check-label">Ativo</label></div></div></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnGatewayFormSave">Salvar</button></div>'
    );

    addSection(
      "modalSupplierList",
      "Fornecedores",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3"><select class="form-select form-select-sm" id="supplierFilterAtivo" style="max-width:150px"><option value="">Todos</option><option value="1">Ativos</option><option value="0">Inativos</option></select><input type="text" class="form-control form-control-sm" id="supplierFilterSearch" placeholder="Buscar..." style="max-width:220px"><button type="button" class="btn btn-sm btn-outline-primary" id="btnSupplierBuscar">Buscar</button><button type="button" class="btn btn-sm btn-primary" id="btnSupplierCadastrar">Cadastrar</button></div><div id="outSupplierList">Carregando...</div>'
    );
    addSection(
      "modalSupplierForm",
      "Cadastrar fornecedor",
      '<h6 id="modalSupplierFormTitle" class="mb-3">Cadastrar fornecedor</h6><input type="hidden" id="supplierFormId"><div class="row g-3"><div class="col-md-4"><label class="form-label small">Tipo pessoa</label><select class="form-select form-select-sm" id="supplierFormTipoPessoa"><option value="JURIDICA">Pessoa jurídica</option><option value="FISICA">Pessoa física</option></select></div><div class="col-md-4"><label class="form-label small">Situação fiscal</label><input type="text" class="form-control form-control-sm" id="supplierFormSituacaoFiscal"></div><div class="col-md-4"><label class="form-label small">Ativo</label><div class="form-check mt-2"><input type="checkbox" class="form-check-input" id="supplierFormAtivo" checked><label class="form-check-label">Ativo</label></div></div></div><div class="row g-3 mt-1"><div class="col-md-6"><label class="form-label small">Nome / Razão social</label><input type="text" class="form-control form-control-sm" id="supplierFormNomeRazao"></div><div class="col-md-6"><label class="form-label small">Nome fantasia</label><input type="text" class="form-control form-control-sm" id="supplierFormNomeFantasia"></div><div class="col-md-4"><label class="form-label small">CPF/CNPJ</label><input type="text" class="form-control form-control-sm" id="supplierFormCpfCnpj"></div><div class="col-md-4"><label class="form-label small">IE</label><input type="text" class="form-control form-control-sm" id="supplierFormIe"></div><div class="col-md-4"><label class="form-label small">IM</label><input type="text" class="form-control form-control-sm" id="supplierFormIm"></div><div class="col-md-6"><label class="form-label small">Endereço</label><input type="text" class="form-control form-control-sm" id="supplierFormEndereco"></div><div class="col-md-2"><label class="form-label small">Número</label><input type="text" class="form-control form-control-sm" id="supplierFormNumero"></div><div class="col-md-4"><label class="form-label small">Bairro</label><input type="text" class="form-control form-control-sm" id="supplierFormBairro"></div><div class="col-md-2"><label class="form-label small">CEP</label><input type="text" class="form-control form-control-sm" id="supplierFormCep"></div><div class="col-md-5"><label class="form-label small">Cidade</label><input type="text" class="form-control form-control-sm" id="supplierFormCidade"></div><div class="col-md-1"><label class="form-label small">UF</label><input type="text" class="form-control form-control-sm" id="supplierFormUf"></div><div class="col-md-6"><label class="form-label small">Email</label><input type="email" class="form-control form-control-sm" id="supplierFormEmail"></div><div class="col-md-6"><label class="form-label small">Telefones</label><input type="text" class="form-control form-control-sm" id="supplierFormTelefones"></div><div class="col-md-6"><label class="form-label small">Celulares</label><input type="text" class="form-control form-control-sm" id="supplierFormCelulares"></div><div class="col-12"><label class="form-label small">Observação</label><textarea class="form-control form-control-sm" id="supplierFormObservacao" rows="3"></textarea></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnSupplierFormSave">Salvar</button></div>'
    );
  }

  function buildIAMPages() {
    addSection(
      "modalGrupoPermissoes",
      "Permissões do grupo",
      '<h6 class="mb-2">Permissões do grupo: <span id="modalGrupoPermNome">—</span></h6><div id="outGrupoPermissoes">Carregando...</div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnSaveGrupoPermissoes">Salvar permissões</button></div>'
    );
    addSection(
      "modalGrupo",
      "Novo grupo",
      '<h6 id="modalGrupoTitle" class="mb-3">Novo grupo</h6><input type="hidden" id="grupoId"><div class="mb-2"><label class="form-label small">Nome do grupo</label><input type="text" class="form-control form-control-sm" id="grupoName"></div><div id="grupoFormError" class="alert alert-danger py-2 d-none"></div><div class="d-flex gap-2"><button type="button" class="btn btn-primary btn-sm" id="btnSaveGrupo">Salvar</button></div>'
    );
    addSection(
      "modalUsuarioGrupos",
      "Grupos do usuário",
      '<h6 class="mb-2">Usuário: <span id="modalUsuarioGruposNome">—</span></h6><div id="outUsuarioGrupos">Carregando...</div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnSaveUsuarioGrupos">Salvar grupos</button></div>'
    );
    addSection(
      "modalUsuario",
      "Novo usuário",
      '<h6 id="modalUsuarioTitle" class="mb-3">Novo usuário</h6><input type="hidden" id="usuarioId"><div class="row g-3"><div class="col-md-4"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="usuarioName"></div><div class="col-md-4"><label class="form-label small">Email</label><input type="email" class="form-control form-control-sm" id="usuarioEmail"></div><div class="col-md-4" id="usuarioPasswordWrap"><label class="form-label small">Senha</label><input type="password" class="form-control form-control-sm" id="usuarioPassword"></div><div class="col-md-2"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="usuarioActive" checked><label class="form-check-label">Ativo</label></div></div></div><div id="usuarioFormError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnSaveUsuario">Salvar</button></div>'
    );
  }

  function buildStockPages() {
    addSection(
      "modalEstoqueMovDetail",
      "Detalhe da movimentação",
      '<input type="hidden" id="estoqueMovDetailId"><div id="modalEstoqueMovDetailBody" class="mov-detail-page"></div>'
    );
    addSection(
      "modalEstoqueMovForm",
      "Nova movimentação",
      '<div id="modalEstoqueMovFormBody"></div><div id="modalEstoqueMovFormError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalEstoqueMovForm\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnEstoqueMovFormSave">Registrar</button></div>'
    );
    addSection(
      "modalEstoqueViagemForm",
      "Registro de viagem",
      '<div id="modalEstoqueViagemFormBody"></div><div id="modalEstoqueViagemFormError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalEstoqueViagemForm\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnEstoqueViagemSave">Registrar</button></div>'
    );
    addSection(
      "modalEstoqueForm",
      "Cadastro de estoque",
      '<div class="mb-2"><input type="hidden" id="estoqueFormId"><div id="modalEstoqueFormBody"></div></div><div id="modalEstoqueFormError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalEstoqueForm\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnEstoqueFormSave">Salvar</button></div>'
    );
  }

  function buildEstoqueDashboardPage() {
    addSection(
      "tab-estoque",
      "Estoque",
      '<div class="estoque-panel">' +
        '<div class="estoque-panel__head">' +
          '<div class="estoque-panel__head-copy">' +
            '<div class="estoque-panel__eyebrow"><i class="bi bi-boxes me-1"></i>Operação centralizada</div>' +
            '<div class="estoque-panel__title"><i class="bi bi-boxes me-2"></i>Controle de Estoque</div>' +
            '<p class="estoque-panel__subtitle">Cadastros, consultas e movimentações em um só lugar.</p>' +
          '</div>' +
          '<div class="estoque-panel__head-meta">' +
            '<span class="estoque-pill estoque-pill--light"><i class="bi bi-shield-check me-1"></i>Fluxo estável</span>' +
            '<span class="estoque-pill estoque-pill--light"><i class="bi bi-lightning-charge me-1"></i>Acesso rápido</span>' +
          '</div>' +
        '</div>' +
      '<nav class="estoque-menu-wrap">' +
        '<div class="estoque-menu" id="estoqueMenuTop">' +
          '<button type="button" class="btn btn-outline-light btn-sm estoque-menu-btn active" data-estoque-pane="cadastros"><i class="bi bi-folder2-open me-1"></i>Cadastros</button>' +
          '<button type="button" class="btn btn-outline-light btn-sm estoque-menu-btn" data-estoque-pane="consultas"><i class="bi bi-search me-1"></i>Consultas</button>' +
          '<button type="button" class="btn btn-outline-light btn-sm estoque-menu-btn" data-estoque-pane="movimentacoes"><i class="bi bi-arrow-left-right me-1"></i>Movimentações</button>' +
          '<button type="button" class="btn btn-outline-light btn-sm estoque-menu-btn" data-estoque-pane="veiculo"><i class="bi bi-truck me-1"></i>Veículo Lançamento</button>' +
        '</div>' +
      '</nav>' +
      '<div class="estoque-body">' +
        '<div class="estoque-sidebar">' +
          '<div class="estoque-pane active" id="estoque-pane-cadastros">' +
            '<h6 class="estoque-pane__title"><i class="bi bi-folder2-open me-1"></i>Cadastros</h6>' +
            '<div class="estoque-subgrid">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="categoria"><i class="bi bi-tag estoque-sub-item__icon"></i><span>Categorias</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="fabricante"><i class="bi bi-building estoque-sub-item__icon"></i><span>Fabricantes</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="produto"><i class="bi bi-box-seam estoque-sub-item__icon"></i><span>Produtos</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="produtofornecedor"><i class="bi bi-link-45deg estoque-sub-item__icon"></i><span>Produtos × Fornecedores</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="kitinstalacao"><i class="bi bi-boxes estoque-sub-item__icon"></i><span>Kit de Instalação</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="local"><i class="bi bi-geo-alt estoque-sub-item__icon"></i><span>Locais de Estoque</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="fornecedores"><i class="bi bi-truck estoque-sub-item__icon"></i><span>Fornecedores</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="ncm"><i class="bi bi-upc estoque-sub-item__icon"></i><span>NCM</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="veiculo"><i class="bi bi-truck-flatbed estoque-sub-item__icon"></i><span>Veículos</span></a>' +
            '</div>' +
          '</div>' +
          '<div class="estoque-pane" id="estoque-pane-consultas">' +
            '<h6 class="estoque-pane__title"><i class="bi bi-search me-1"></i>Consultas</h6>' +
            '<div class="estoque-subgrid">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="saldo"><i class="bi bi-bar-chart-line estoque-sub-item__icon"></i><span>Saldo por Local</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="lancamentos"><i class="bi bi-journal-text estoque-sub-item__icon"></i><span>Lançamentos</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="quantitativo"><i class="bi bi-pie-chart estoque-sub-item__icon"></i><span>Quantitativo por Produto</span></a>' +
            '</div>' +
          '</div>' +
          '<div class="estoque-pane" id="estoque-pane-movimentacoes">' +
            '<h6 class="estoque-pane__title"><i class="bi bi-arrow-left-right me-1"></i>Movimentações</h6>' +
            '<div class="mb-3"><div class="estoque-submenu-title">Compra</div><div class="estoque-subgrid estoque-subgrid--compact">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="compra-add"><i class="bi bi-plus-circle estoque-sub-item__icon"></i><span>Nova</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="compra-nfe"><i class="bi bi-file-earmark-text estoque-sub-item__icon"></i><span>NFe</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="compra-list"><i class="bi bi-list-ul estoque-sub-item__icon"></i><span>Listar</span></a>' +
            '</div></div>' +
            '<div class="mb-3"><div class="estoque-submenu-title">Venda</div><div class="estoque-subgrid estoque-subgrid--compact">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="venda-add"><i class="bi bi-plus-circle estoque-sub-item__icon"></i><span>Nova</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="venda-list"><i class="bi bi-list-ul estoque-sub-item__icon"></i><span>Listar</span></a>' +
            '</div></div>' +
            '<div class="mb-3"><div class="estoque-submenu-title">Comodato</div><div class="estoque-subgrid estoque-subgrid--compact">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="comodato-add"><i class="bi bi-plus-circle estoque-sub-item__icon"></i><span>Cadastrar</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="comodato-list"><i class="bi bi-list-ul estoque-sub-item__icon"></i><span>Listar</span></a>' +
            '</div></div>' +
            '<div class="mb-3"><div class="estoque-submenu-title">Correção</div><div class="estoque-subgrid estoque-subgrid--compact">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="correcao-add"><i class="bi bi-tools estoque-sub-item__icon"></i><span>Cadastrar</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="correcao-list"><i class="bi bi-list-ul estoque-sub-item__icon"></i><span>Listar</span></a>' +
            '</div></div>' +
            '<div class="mb-3"><div class="estoque-submenu-title">Transferência</div><div class="estoque-subgrid estoque-subgrid--compact">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="transferencia-add"><i class="bi bi-arrow-left-right estoque-sub-item__icon"></i><span>Cadastrar</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="transferencia-lote"><i class="bi bi-collection estoque-sub-item__icon"></i><span>Lote</span></a>' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="transferencia-list"><i class="bi bi-list-ul estoque-sub-item__icon"></i><span>Listar</span></a>' +
            '</div></div>' +
          '</div>' +
          '<div class="estoque-pane" id="estoque-pane-veiculo">' +
            '<h6 class="estoque-pane__title"><i class="bi bi-truck me-1"></i>Veículo</h6>' +
            '<div class="estoque-subgrid">' +
              '<a href="#" class="list-group-item list-group-item-action estoque-sub-item" data-estoque-action="veiculo-viagem"><i class="bi bi-signpost-2 estoque-sub-item__icon"></i><span>Registro de Viagem</span></a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="estoque-main">' +
          '<div id="estoqueDashboard" class="estoque-dashboard">' +
            '<div class="estoque-dashboard__welcome">' +
              '<div class="estoque-dashboard__eyebrow">' +
                '<span class="estoque-pill estoque-pill--primary"><i class="bi bi-check2-circle me-1"></i>Fluxo pronto para operação</span>' +
                '<span class="estoque-pill"><i class="bi bi-layout-text-window-reverse me-1"></i>Cadastros e consultas</span>' +
              '</div>' +
              '<p class="estoque-dashboard__subtitle">Use o menu ao lado ou escolha um atalho abaixo para entrar direto na área desejada.</p>' +
              '<div class="estoque-dashboard__quick-actions">' +
                '<button type="button" class="estoque-quick-btn" onclick="var el=document.querySelector(\'#estoqueMenuTop [data-estoque-pane=\\\'cadastros\\\']\'); if(el) el.click();"><i class="bi bi-folder2-open"></i><span>Cadastros</span><small>Produtos, locais e fornecedores</small></button>' +
                '<button type="button" class="estoque-quick-btn" onclick="var el=document.querySelector(\'#estoqueMenuTop [data-estoque-pane=\\\'consultas\\\']\'); if(el) el.click();"><i class="bi bi-search"></i><span>Consultas</span><small>Saldo, lançamentos e histórico</small></button>' +
                '<button type="button" class="estoque-quick-btn" onclick="var el=document.querySelector(\'#estoqueMenuTop [data-estoque-pane=\\\'movimentacoes\\\']\'); if(el) el.click();"><i class="bi bi-arrow-left-right"></i><span>Movimentações</span><small>Compra, venda, correção e transferência</small></button>' +
                '<button type="button" class="estoque-quick-btn" onclick="var el=document.querySelector(\'#estoqueMenuTop [data-estoque-pane=\\\'veiculo\\\']\'); if(el) el.click();"><i class="bi bi-truck"></i><span>Veículo</span><small>Registro de viagem e saída</small></button>' +
              '</div>' +
            '</div>' +
            '<div class="estoque-kpi-row" id="estoqueKpiRow">' +
              '<div class="estoque-kpi-card"><div class="estoque-kpi-card__icon"><i class="bi bi-box-seam"></i></div><div class="estoque-kpi-card__value" id="estoqueKpiProdutos">—</div><div class="estoque-kpi-card__label">Produtos</div></div>' +
              '<div class="estoque-kpi-card"><div class="estoque-kpi-card__icon"><i class="bi bi-tag"></i></div><div class="estoque-kpi-card__value" id="estoqueKpiCategorias">—</div><div class="estoque-kpi-card__label">Categorias</div></div>' +
              '<div class="estoque-kpi-card"><div class="estoque-kpi-card__icon"><i class="bi bi-geo-alt"></i></div><div class="estoque-kpi-card__value" id="estoqueKpiLocais">—</div><div class="estoque-kpi-card__label">Locais</div></div>' +
              '<div class="estoque-kpi-card"><div class="estoque-kpi-card__icon"><i class="bi bi-arrow-left-right"></i></div><div class="estoque-kpi-card__value" id="estoqueKpiMov">—</div><div class="estoque-kpi-card__label">Movimentações</div></div>' +
            '</div>' +
            '<div class="estoque-dashboard__section">' +
              '<h6 class="estoque-dashboard__section-title"><i class="bi bi-lightning me-1"></i>Acesso rápido</h6>' +
              '<p class="text-muted small mb-2">Selecione um item no menu à esquerda para abrir cadastros, consultas ou movimentações.</p>' +
            '</div>' +
          '</div>' +
          '<div id="estoqueContentArea" class="estoque-content-area">' +
            '<div class="estoque-toolbar">' +
              '<nav aria-label="breadcrumb" class="estoque-breadcrumb">' +
                '<ol class="breadcrumb mb-0" id="estoqueBreadcrumb">' +
                  '<li class="breadcrumb-item"><a href="#" id="estoqueBreadcrumbRoot">Estoque</a></li>' +
                  '<li class="breadcrumb-item active" id="estoqueBreadcrumbCurrent" aria-current="page">—</li>' +
                '</ol>' +
              '</nav>' +
              '<div class="d-flex align-items-center flex-wrap gap-2 ms-auto">' +
                '<h6 class="estoque-toolbar__title mb-0" id="estoqueContentTitle">—</h6>' +
                '<span class="estoque-toolbar__meta" id="estoqueContentMeta"></span>' +
              '</div>' +
              '<div class="d-flex gap-2 flex-wrap">' +
                '<button type="button" class="btn btn-outline-secondary btn-sm" id="estoqueBtnBack"><i class="bi bi-arrow-left me-1"></i>Voltar</button>' +
                '<button type="button" class="btn btn-primary btn-sm" id="estoqueBtnNew" style="display:none;"><i class="bi bi-plus-lg me-1"></i>Novo</button>' +
                '<button type="button" class="btn btn-outline-primary btn-sm" id="estoqueBtnRefresh" style="display:none;"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar</button>' +
              '</div>' +
            '</div>' +
            '<div id="estoqueFilterBar" class="estoque-filter-bar" style="display:none;"></div>' +
            '<div id="estoqueContentBody"><p class="text-muted mb-0">Carregando...</p></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function buildSupportDashboardPage() {
    addSection(
      "tab-tickets",
      "Suporte",
      '<div class="admin-panel os-panel">' +
        '<div class="support-header">' +
          '<div class="support-header__title"><i class="bi bi-headset"></i>Suporte - Chamados e Ordens de Serviço</div>' +
          '<div class="support-header__tools">' +
            '<div class="support-header__group">' +
              '<span class="support-header__group-label">Filtros</span>' +
              '<select class="form-select" id="supportFilterType">' +
                '<option value="">Todos os tipos</option>' +
                '<option value="TICKET">Chamado</option>' +
                '<option value="INSTALLATION">Instalação</option>' +
                '<option value="MAINTENANCE">Manutenção</option>' +
                '<option value="SUPPORT">Suporte (OS)</option>' +
                '<option value="UPGRADE">Upgrade</option>' +
                '<option value="OTHER">Outro</option>' +
              '</select>' +
              '<select class="form-select" id="supportFilterStatus">' +
                '<option value="">Todos os status</option>' +
                '<optgroup label="Em aberto"><option value="OPEN">Aberto</option></optgroup>' +
                '<optgroup label="Em andamento"><option value="IN_PROGRESS">Em andamento</option><option value="PENDING">Pendente</option></optgroup>' +
                '<optgroup label="Encerrados"><option value="_DONE_">Resolvido / Concluído / Fechado</option><option value="RESOLVED">Resolvido (chamado)</option><option value="CLOSED">Fechado (chamado)</option><option value="COMPLETED">Concluído (OS)</option></optgroup>' +
                '<optgroup label="Cancelado"><option value="CANCELLED">Cancelado</option></optgroup>' +
              '</select>' +
            '</div>' +
            '<div class="support-header__group">' +
              '<span class="support-header__group-label">Ações</span>' +
              '<button type="button" class="support-header__btn support-header__btn--refresh" id="btnLoadSupport" title="Recarregar lista"><i class="bi bi-arrow-clockwise"></i><span>Atualizar</span></button>' +
              '<button type="button" class="support-header__btn support-header__btn--ticket" id="btnNewTicket" title="Abrir novo chamado"><i class="bi bi-chat-left-text"></i><span>Novo chamado</span></button>' +
              '<button type="button" class="support-header__btn support-header__btn--os" id="btnNewServiceOrder" title="Criar ordem de serviço"><i class="bi bi-tools"></i><span>Nova OS</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="admin-panel__body">' +
          '<div class="os-kpis">' +
            '<div class="os-kpi os-kpi--total"><div class="os-kpi__icon"><i class="bi bi-list-ul"></i></div><div class="os-kpi__value" id="supportKpiTotal">0</div><div class="os-kpi__label">Total</div></div>' +
            '<div class="os-kpi os-kpi--open"><div class="os-kpi__icon"><i class="bi bi-circle"></i></div><div class="os-kpi__value" id="supportKpiOpen">0</div><div class="os-kpi__label">Abertos</div></div>' +
            '<div class="os-kpi os-kpi--progress"><div class="os-kpi__icon"><i class="bi bi-gear"></i></div><div class="os-kpi__value" id="supportKpiProgress">0</div><div class="os-kpi__label">Em andamento</div></div>' +
            '<div class="os-kpi os-kpi--completed"><div class="os-kpi__icon"><i class="bi bi-check2-circle"></i></div><div class="os-kpi__value" id="supportKpiCompleted">0</div><div class="os-kpi__label">Resolvidos / Concluídos</div></div>' +
          '</div>' +
          '<div class="os-toolbar"><span class="text-muted small" id="supportFilterInfo">Chamados e ordens de serviço em um só lugar.</span></div>' +
          '<div class="os-table-wrap"><div id="outTickets">Clique em <strong>Atualizar</strong> para carregar.</div></div>' +
        '</div>' +
      '</div>'
    );
  }

  function buildAccountingPages() {
    addSection(
      "modalEditInvoice",
      "Alterar fatura",
      '<input type="hidden" id="editInvoiceId"><div class="row g-3"><div class="col-md-4"><label class="form-label small">Vencimento</label><input type="date" class="form-control form-control-sm" id="editInvoiceDueDate"></div><div class="col-md-4"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="editInvoiceAmount"></div><div class="col-md-4"><label class="form-label small">Plano</label><input type="text" class="form-control form-control-sm" id="editInvoicePlanCode"></div><div class="col-12"><label class="form-label small">Observação</label><input type="text" class="form-control form-control-sm" id="editInvoiceNotes"></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalEditInvoice\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnEditInvoiceSave">Salvar</button></div>'
    );
    addSection(
      "modalCaixaNovo",
      "Novo lançamento",
      '<div class="row g-3"><div class="col-md-3"><label class="form-label small">Tipo</label><select class="form-select form-select-sm" id="caixaNovoTipo"><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option></select></div><div class="col-md-3"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="caixaNovoAmount"></div><div class="col-md-6"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="caixaNovoDescription"></div><div class="col-md-4"><label class="form-label small">Data</label><input type="date" class="form-control form-control-sm" id="caixaNovoDate"></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalCaixaNovo\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnCaixaNovoSave">Salvar</button></div>'
    );
  }

  function buildFinancialSubpages() {
    addSection(
      "modalChartList",
      "Plano de Contas",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3"><select class="form-select form-select-sm" id="chartFilterTipo" style="max-width:150px"><option value="">Todos os tipos</option><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option></select><select class="form-select form-select-sm" id="chartFilterAtivo" style="max-width:150px"><option value="">Todos</option><option value="1">Ativos</option><option value="0">Inativos</option></select><button type="button" class="btn btn-sm btn-outline-primary" id="btnChartBuscar">Buscar</button><button type="button" class="btn btn-sm btn-primary" id="btnChartCadastrar">Cadastrar</button></div><div id="outChartList">Carregando...</div>'
    );
    addSection(
      "modalChartForm",
      "Cadastrar plano de contas",
      '<h6 id="modalChartFormTitle" class="mb-3">Cadastrar plano de contas</h6><input type="hidden" id="chartFormId"><div class="row g-3"><div class="col-md-3"><label class="form-label small">Tipo</label><select class="form-select form-select-sm" id="chartFormTipo"><option value="RECEITA">Receita</option><option value="DESPESA">Despesa</option></select></div><div class="col-md-3"><label class="form-label small">Código</label><input type="text" class="form-control form-control-sm" id="chartFormCodigo"></div><div class="col-md-6"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="chartFormDescricao"></div><div class="col-md-4"><label class="form-label small">Conta plano</label><select class="form-select form-select-sm" id="chartFormContaPlano"><option value="NORMAL">Normal</option><option value="MENSALIDADE">Mensalidade</option><option value="ADESAO">Adesão</option></select></div><div class="col-md-4"><label class="form-label small">DRE</label><input type="text" class="form-control form-control-sm" id="chartFormDre"></div><div class="col-md-4"><label class="form-label small">DRE tipo</label><input type="text" class="form-control form-control-sm" id="chartFormDreTipo"></div><div class="col-md-4"><label class="form-label small">SICI conta</label><input type="text" class="form-control form-control-sm" id="chartFormSiciConta"></div><div class="col-md-4"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="chartFormVisivel" checked><label class="form-check-label">Visível</label></div></div><div class="col-md-4"><div class="form-check mt-4"><input type="checkbox" class="form-check-input" id="chartFormAtivo" checked><label class="form-check-label">Ativo</label></div></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnChartFormSave">Salvar</button></div>'
    );
    addSection(
      "modalPayableList",
      "Contas a pagar",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3"><select class="form-select form-select-sm" id="payableFilterStatus" style="max-width:150px"><option value="">Todos</option><option value="ABERTO">Aberto</option><option value="PAGO">Pago</option><option value="CANCELADO">Cancelado</option></select><input type="date" class="form-control form-control-sm" id="payableFilterFrom" style="max-width:150px"><input type="date" class="form-control form-control-sm" id="payableFilterTo" style="max-width:150px"><button type="button" class="btn btn-sm btn-outline-primary" id="btnPayableBuscar">Buscar</button><button type="button" class="btn btn-sm btn-primary" id="btnPayableCadastrar">Cadastrar</button></div><div id="outPayableList">Carregando...</div>'
    );
    addSection(
      "modalPayableForm",
      "Cadastrar conta a pagar",
      '<h6 id="modalPayableFormTitle" class="mb-3">Cadastrar conta a pagar</h6><input type="hidden" id="payableFormId"><div class="row g-3"><div class="col-md-4"><label class="form-label small">Fornecedor</label><select class="form-select form-select-sm" id="payableFormFornecedorId"></select></div><div class="col-md-4"><label class="form-label small">Plano de contas</label><select class="form-select form-select-sm" id="payableFormPlanoContasId"></select></div><div class="col-md-4"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="payableFormDescricao"></div><div class="col-md-3"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="payableFormValor"></div><div class="col-md-3"><label class="form-label small">Vencimento</label><input type="date" class="form-control form-control-sm" id="payableFormVencimento"></div><div class="col-md-3"><label class="form-label small">Empresa</label><input type="text" class="form-control form-control-sm" id="payableFormEmpresa"></div><div class="col-md-3"><label class="form-label small">Forma pagamento</label><input type="text" class="form-control form-control-sm" id="payableFormFormaPagamento"></div><div class="col-md-3"><label class="form-label small">Nota fiscal</label><input type="text" class="form-control form-control-sm" id="payableFormNotaFiscal"></div><div class="col-md-3"><label class="form-label small">Emissão</label><input type="date" class="form-control form-control-sm" id="payableFormEmissao"></div><div class="col-md-3"><label class="form-label small">Competência</label><input type="month" class="form-control form-control-sm" id="payableFormCompetencia"></div><div class="col-md-3"><label class="form-label small">Status</label><select class="form-select form-select-sm" id="payableFormStatus"><option value="ABERTO">ABERTO</option><option value="PAGO">PAGO</option><option value="CANCELADO">CANCELADO</option></select></div><div class="col-12"><label class="form-label small">Observação</label><textarea class="form-control form-control-sm" id="payableFormObservacao" rows="3"></textarea></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnPayableFormSave">Salvar</button></div>'
    );
    addSection(
      "modalCarneParcelado",
      "Gerar carnê parcelado",
      '<div class="row g-3"><div class="col-md-4"><label class="form-label small">Contrato</label><select class="form-select form-select-sm" id="carneParceladoContratoSelect"></select></div><div class="col-md-4"><label class="form-label small">Plano</label><input type="text" class="form-control form-control-sm" id="carneParceladoPlano"></div><div class="col-md-4"><label class="form-label small">Plano de contas</label><input type="text" class="form-control form-control-sm" id="carneParceladoPlanoConta"></div><div class="col-md-3"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="carneParceladoValor"></div><div class="col-md-3"><label class="form-label small">Dia venc.</label><input type="number" min="1" max="28" class="form-control form-control-sm" id="carneParceladoVencimento"></div><div class="col-md-3"><label class="form-label small">Parcelas</label><input type="number" min="1" class="form-control form-control-sm" id="carneParceladoParcelas"></div><div class="col-md-3"><label class="form-label small">Competência inicial</label><input type="month" class="form-control form-control-sm" id="carneParceladoRefMonth"></div><div class="col-12"><label class="form-label small">Observação</label><textarea class="form-control form-control-sm" id="carneParceladoObs" rows="2"></textarea></div></div><input type="hidden" id="carneParceladoCustomerId"><div id="carneParceladoErro" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCarneParceladoGerar">Gerar carnê</button></div>'
    );
    addSection(
      "modalCarneGerar",
      "Gerar lote de carnês",
      '<div class="row g-3"><div class="col-md-4"><label class="form-label small">Competência</label><input type="month" class="form-control form-control-sm" id="carneGerarRefMonth"></div><div class="col-md-8"><label class="form-label small">Nome do lote (opcional)</label><input type="text" class="form-control form-control-sm" id="carneGerarName"></div></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCarneGerarSubmit">Gerar lote</button></div>'
    );
    addSection(
      "modalCarneImprimir",
      "Imprimir lotes de carnês",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3"><input type="month" class="form-control form-control-sm" id="carneImprimirFilterMonth" style="max-width:180px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCarneImprimirLoad">Atualizar</button></div><div id="outCarneImprimirList">Carregando lotes...</div>'
    );
    addSection(
      "modalCarneEntrega",
      "Confirmação de entrega",
      '<div class="row g-3 mb-3"><div class="col-md-8"><label class="form-label small">Lote</label><select class="form-select form-select-sm" id="carneEntregaLotSelect"></select></div><div class="col-md-4 d-flex align-items-end gap-2"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCarneEntregaLoadLot">Carregar</button><button type="button" class="btn btn-success btn-sm" id="btnCarneEntregaConfirmAll">Confirmar todos como entregues</button></div></div><div id="carneEntregaLotInfo" class="small text-muted mb-2" style="display:none;"></div><div id="carneEntregaActions" style="display:none"></div><div id="outCarneEntregaItems">Selecione um lote e clique em Carregar.</div>'
    );
  }

  function buildFinanceLandingPages() {
    function linkCard(label, description, targetId) {
      return '<div class="col-md-6 col-xl-4">' +
        '<button type="button" class="btn btn-outline-primary w-100 text-start h-100 p-3" onclick="safeShowModal(\'' + targetId + '\')">' +
          '<div class="fw-semibold">' + label + '</div>' +
          '<div class="small text-muted">' + description + '</div>' +
        '</button>' +
      '</div>';
    }

    function linkGrid(items) {
      return '<div class="row g-3">' + items.map(function (item) {
        return linkCard(item.label, item.description, item.target);
      }).join('') + '</div>';
    }

    addSection(
      "finance-page-titulos",
      "Títulos",
      '<div class="d-flex gap-2 flex-wrap align-items-center mb-3">' +
        '<input type="month" class="form-control form-control-sm" id="financeMonthFilter" style="max-width: 150px;" title="Competência" />' +
        '<select class="form-select form-select-sm" id="financeStatusFilter" style="max-width: 150px;">' +
          '<option value="">Todos os status</option>' +
          '<option value="PENDING">Pendentes</option>' +
          '<option value="PAID">Pagas</option>' +
          '<option value="OVERDUE">Vencidas</option>' +
        '</select>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" id="btnLoadFinance"><i class="bi bi-arrow-clockwise"></i> Atualizar</button>' +
        '<button type="button" class="btn btn-sm btn-success" id="btnGenerateInvoices"><i class="bi bi-plus-circle-dotted me-1"></i> Gerar faturas</button>' +
      '</div>' +
      '<div class="finance-kpis">' +
        '<div class="finance-kpi finance-kpi--receber">' +
          '<div class="finance-kpi__icon"><i class="bi bi-clock-history"></i></div>' +
          '<div class="finance-kpi__value" id="financePendingAmount">R$ 0,00</div>' +
          '<div class="finance-kpi__label">A receber</div>' +
          '<div class="finance-kpi__sub" id="financePending">0 faturas</div>' +
        '</div>' +
        '<div class="finance-kpi finance-kpi--recebido">' +
          '<div class="finance-kpi__icon"><i class="bi bi-check2-circle"></i></div>' +
          '<div class="finance-kpi__value" id="financePaidAmount">R$ 0,00</div>' +
          '<div class="finance-kpi__label">Recebido</div>' +
          '<div class="finance-kpi__sub" id="financePaid">0 faturas</div>' +
        '</div>' +
        '<div class="finance-kpi finance-kpi--vencido">' +
          '<div class="finance-kpi__icon"><i class="bi bi-exclamation-triangle"></i></div>' +
          '<div class="finance-kpi__value" id="financeOverdueAmount">R$ 0,00</div>' +
          '<div class="finance-kpi__label">Vencido</div>' +
          '<div class="finance-kpi__sub" id="financeOverdue">0 faturas</div>' +
        '</div>' +
        '<div class="finance-kpi finance-kpi--total">' +
          '<div class="finance-kpi__icon"><i class="bi bi-graph-up-arrow"></i></div>' +
          '<div class="finance-kpi__value" id="financeTotalMonth">—</div>' +
          '<div class="finance-kpi__label">Total na competência</div>' +
          '<div class="finance-kpi__sub" id="financeCountMonth">—</div>' +
        '</div>' +
      '</div>' +
      '<div class="finance-toolbar"><span class="finance-toolbar__info text-muted small" id="financeFilterInfo">Faturas da competência selecionada</span></div>' +
      '<div class="finance-table-wrap"><div id="outFinance">Clique em <strong>Atualizar</strong> para carregar as faturas.</div></div>'
    );

    addSection(
      "finance-page-caixas",
      "Caixas",
      '<div class="d-flex flex-wrap gap-2 align-items-center mb-3">' +
        '<label class="small mb-0">De</label>' +
        '<input type="date" class="form-control form-control-sm" id="caixaDateFrom" style="max-width: 140px;" />' +
        '<label class="small mb-0">Até</label>' +
        '<input type="date" class="form-control form-control-sm" id="caixaDateTo" style="max-width: 140px;" />' +
        '<select class="form-select form-select-sm" id="caixaTipoFilter" style="max-width: 120px;">' +
          '<option value="">Todos</option>' +
          '<option value="RECEITA">Receita</option>' +
          '<option value="DESPESA">Despesa</option>' +
        '</select>' +
        '<button type="button" class="btn btn-sm btn-outline-primary" id="btnCaixaLoad"><i class="bi bi-arrow-clockwise me-1"></i>Atualizar</button>' +
        '<button type="button" class="btn btn-sm btn-success" id="btnCaixaNovo"><i class="bi bi-plus-lg me-1"></i>Novo lançamento</button>' +
      '</div>' +
      '<div class="finance-kpis mb-3" style="grid-template-columns: repeat(3, 1fr);">' +
        '<div class="finance-kpi finance-kpi--recebido"><div class="finance-kpi__label">Total receita</div><div class="finance-kpi__value" id="caixaTotalReceita">R$ 0,00</div></div>' +
        '<div class="finance-kpi finance-kpi--vencido"><div class="finance-kpi__label">Total despesa</div><div class="finance-kpi__value" id="caixaTotalDespesa">R$ 0,00</div></div>' +
        '<div class="finance-kpi finance-kpi--total"><div class="finance-kpi__label">Saldo</div><div class="finance-kpi__value" id="caixaSaldo">R$ 0,00</div></div>' +
      '</div>' +
      '<div class="finance-table-wrap"><div id="outCaixaMovements">Clique em <strong>Atualizar</strong> para carregar o movimento.</div></div>' +
      '<p class="small text-muted mt-2 mb-0">Repasses e OFX: em breve.</p>'
    );

    addSection(
      "finance-page-cadastros",
      "Cadastros",
      '<p class="text-muted small mb-3">Abra um cadastro abaixo para entrar na tela completa, igual nos outros módulos.</p>' +
      linkGrid([
        { label: 'Gateway de Pagamento', description: 'Listar e cadastrar gateways', target: 'modalGatewayList' },
        { label: 'Fornecedores', description: 'Cadastro de fornecedores', target: 'modalSupplierList' },
        { label: 'Plano de Contas', description: 'Receitas, despesas e classificações', target: 'modalChartList' },
        { label: 'OFX Filtros', description: 'Importação e tratamento de OFX', target: 'finance-page-ofxfiltro' },
        { label: 'Pontos de Recebimento', description: 'Locais de baixa e conciliação', target: 'finance-page-pontorecebimento' },
        { label: 'Empresas', description: 'Dados das empresas do grupo', target: 'finance-page-empresas' },
        { label: 'Funcionários', description: 'Responsáveis e operadores', target: 'finance-page-funcionarios' },
        { label: 'Portadores', description: 'Carteiras e portadores de cobrança', target: 'finance-page-portador' },
        { label: 'Contador', description: 'Cadastro do contador responsável', target: 'finance-page-contador' },
        { label: 'Vencimentos', description: 'Regras de vencimento', target: 'finance-page-vencimento' },
        { label: 'Feriados', description: 'Calendário financeiro', target: 'finance-page-feriado' },
        { label: 'Contratos Financeiros', description: 'Políticas e cobranças', target: 'finance-page-contrato' },
        { label: 'Conta Digital', description: 'Conta de cobrança e repasse', target: 'finance-page-contadigital' }
      ])
    );

    addSection(
      "finance-page-carnes",
      "Carnês",
      linkGrid([
        { label: 'Gerar Lote', description: 'Criar carnês em lote', target: 'modalCarneGerar' },
        { label: 'Imprimir Lotes', description: 'Listar e imprimir carnês', target: 'modalCarneImprimir' },
        { label: 'Confirmação de Entrega', description: 'Registrar entrega dos carnês', target: 'modalCarneEntrega' }
      ])
    );

    addSection(
      "finance-page-protocolos",
      "Protocolos",
      linkGrid([
        { label: 'Consultar', description: 'Abrir a consulta de protocolos', target: 'finance-page-protocolo-list' },
        { label: 'Gerar', description: 'Criar um novo protocolo', target: 'finance-page-protocolo-add' }
      ])
    );

    addSection(
      "finance-page-pagar",
      "Contas a Pagar",
      linkGrid([
        { label: 'Cadastrar', description: 'Abrir o formulário de contas a pagar', target: 'modalPayableForm' },
        { label: 'Histórico', description: 'Listar contas a pagar', target: 'modalPayableList' },
        { label: 'Cadastrar por NFe', description: 'Lançar a partir de nota fiscal', target: 'finance-page-pagar-nfe' }
      ])
    );

    addSection(
      "finance-page-receber",
      "Contas a Receber",
      linkGrid([
        { label: 'Cadastrar', description: 'Lançamento avulso a receber', target: 'finance-page-receber-add' },
        { label: 'Histórico', description: 'Consulta de recebíveis', target: 'finance-page-receber-list' }
      ])
    );

    addSection(
      "finance-page-declaracoes",
      "Declarações",
      linkGrid([
        { label: 'Quitação', description: 'Gerar declaração de quitação', target: 'finance-page-declaracao-quitacao' }
      ])
    );

    addSection(
      "finance-page-acrescimos",
      "Acréscimos / Descontos",
      linkGrid([
        { label: 'Aplicação em lote', description: 'Ajustar valores em massa', target: 'finance-page-ad-lote' }
      ])
    );

    addSection(
      "finance-page-cobranca",
      "Cobrança",
      linkGrid([
        { label: 'Atraso', description: 'Ações para inadimplentes', target: 'finance-page-cobranca-atraso' },
        { label: 'Lembrador', description: 'Lembretes automáticos', target: 'finance-page-cobranca-lembrador' },
        { label: 'SPC / Serasa', description: 'Rotinas de cobrança externa', target: 'finance-page-cobranca-spc' },
        { label: 'SMS', description: 'Envio de SMS', target: 'finance-page-cobranca-sms' },
        { label: 'Email', description: 'Envio de emails', target: 'finance-page-cobranca-email' },
        { label: 'Cartas', description: 'Gerar cartas de cobrança', target: 'finance-page-cobranca-cartas' },
        { label: 'Recorrente', description: 'Cobrança automatizada', target: 'finance-page-cobranca-recorrente' }
      ])
    );

    addSection(
      "finance-page-pix",
      "Pix",
      linkGrid([
        { label: 'Consulta por ID', description: 'Buscar transação pelo E2E ID', target: 'finance-page-pix-e2id' },
        { label: 'Consulta por QRCode', description: 'Decodificar EMV / QRCode', target: 'finance-page-pix-emv' }
      ])
    );
  }

  function buildFinanceExtraPages() {
    function workspaceCard(title, body) {
      return '<div class="admin-panel mb-3"><div class="admin-panel__head"><span>' + title + '</span></div><div class="admin-panel__body">' + body + '</div></div>';
    }
    function workspacePage(cfg) {
      var listId = cfg.listId;
      var formId = cfg.formId;
      var toolbar = cfg.toolbar || '';
      var listHint = cfg.listHint || 'Nenhum registro.';
      var body =
        '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">' +
          '<div><h6 class="mb-1">' + cfg.subtitle + '</h6><p class="text-muted small mb-0">' + cfg.description + '</p></div>' +
          '<div class="d-flex gap-2 flex-wrap">' +
            '<button type="button" class="btn btn-sm btn-outline-secondary" onclick="safeHideModal(\'' + cfg.id + '\')">Voltar</button>' +
            '<a href="/portal/financeiro" class="btn btn-sm btn-primary">Painel financeiro</a>' +
          '</div>' +
        '</div>' +
        toolbar +
        '<div class="row g-3">' +
          '<div class="col-lg-7">' +
            workspaceCard('Lista / consulta', '<div id="' + listId + '">' + listHint + '</div>') +
          '</div>' +
          '<div class="col-lg-5">' +
            workspaceCard('Formulário', '<div id="' + formId + '">' + cfg.formHtml + '</div>') +
          '</div>' +
        '</div>';
      addSection(cfg.id, cfg.title, body);
    }

    workspacePage({
      id: 'finance-page-ofxfiltro',
      title: 'OFX Filtros',
      subtitle: 'OFX Filtros',
      description: 'Configure a importação, o tratamento e a validação dos arquivos OFX.',
      listId: 'financeOfxList',
      formId: 'financeOfxForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><input type="file" class="form-control form-control-sm" id="ofxFile" accept=".ofx,.txt" style="max-width:240px"><input type="text" class="form-control form-control-sm" id="ofxBank" placeholder="Banco" style="max-width:160px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnOfxLoad">Carregar</button><button type="button" class="btn btn-primary btn-sm" id="btnOfxSave">Salvar filtro</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Conta / arquivo</label><input type="text" class="form-control form-control-sm" id="ofxAccount"></div><div class="mb-2"><label class="form-label small">Padrão de data</label><input type="text" class="form-control form-control-sm" id="ofxDatePattern" placeholder="dd/mm/yyyy"></div><div class="mb-2"><label class="form-label small">Delimitador</label><input type="text" class="form-control form-control-sm" id="ofxDelimiter" placeholder=";"></div><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="ofxSkipDuplicates" checked><label class="form-check-label" for="ofxSkipDuplicates">Ignorar duplicados</label></div><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="ofxAutoImport"><label class="form-check-label" for="ofxAutoImport">Importação automática</label></div><textarea class="form-control form-control-sm" id="ofxNotes" rows="4" placeholder="Observações"></textarea>'
    });

    workspacePage({
      id: 'finance-page-pontorecebimento',
      title: 'Pontos de Recebimento',
      subtitle: 'Pontos de Recebimento',
      description: 'Cadastre os pontos usados para baixa e conciliação.',
      listId: 'financeReceiptPointList',
      formId: 'financeReceiptPointForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><input type="text" class="form-control form-control-sm" id="receiptPointSearch" placeholder="Buscar ponto" style="max-width:220px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnReceiptPointRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="receiptPointId"><div class="mb-2"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="receiptPointName"></div><div class="mb-2"><label class="form-label small">Código</label><input type="text" class="form-control form-control-sm" id="receiptPointCode"></div><div class="mb-2"><label class="form-label small">Instituição</label><input type="text" class="form-control form-control-sm" id="receiptPointInstitution"></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="receiptPointActive" checked><label class="form-check-label" for="receiptPointActive">Ativo</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-empresas',
      title: 'Empresas',
      subtitle: 'Empresas',
      description: 'Gerencie as empresas do grupo e seus dados principais.',
      listId: 'financeCompanyList',
      formId: 'financeCompanyForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><input type="text" class="form-control form-control-sm" id="companySearch" placeholder="Buscar empresa" style="max-width:220px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCompanyRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="companyId"><div class="mb-2"><label class="form-label small">Razão social</label><input type="text" class="form-control form-control-sm" id="companyName"></div><div class="mb-2"><label class="form-label small">Fantasia</label><input type="text" class="form-control form-control-sm" id="companyTradeName"></div><div class="mb-2"><label class="form-label small">CNPJ</label><input type="text" class="form-control form-control-sm" id="companyCnpj"></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="companyActive" checked><label class="form-check-label" for="companyActive">Ativa</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-funcionarios',
      title: 'Funcionários',
      subtitle: 'Funcionários',
      description: 'Cadastre os responsáveis e colaboradores do financeiro.',
      listId: 'financeEmployeeList',
      formId: 'financeEmployeeForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><input type="text" class="form-control form-control-sm" id="employeeSearch" placeholder="Buscar funcionário" style="max-width:220px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnEmployeeRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="employeeId"><div class="mb-2"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="employeeName"></div><div class="mb-2"><label class="form-label small">Cargo</label><input type="text" class="form-control form-control-sm" id="employeeRole"></div><div class="mb-2"><label class="form-label small">Matrícula</label><input type="text" class="form-control form-control-sm" id="employeeRegistry"></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="employeeActive" checked><label class="form-check-label" for="employeeActive">Ativo</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-portador',
      title: 'Portadores',
      subtitle: 'Portadores',
      description: 'Configure os portadores/carteiras para cobrança.',
      listId: 'financeCarrierList',
      formId: 'financeCarrierForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCarrierRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="carrierId"><div class="mb-2"><label class="form-label small">Descrição</label><input type="text" class="form-control form-control-sm" id="carrierDescription"></div><div class="mb-2"><label class="form-label small">Banco</label><input type="text" class="form-control form-control-sm" id="carrierBank"></div><div class="mb-2"><label class="form-label small">Carteira</label><input type="text" class="form-control form-control-sm" id="carrierWallet"></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="carrierActive" checked><label class="form-check-label" for="carrierActive">Ativo</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-contador',
      title: 'Contador',
      subtitle: 'Contador',
      description: 'Cadastre os dados do contador responsável.',
      listId: 'financeAccountantList',
      formId: 'financeAccountantForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnAccountantRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="accountantId"><div class="mb-2"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="accountantName"></div><div class="mb-2"><label class="form-label small">CRC</label><input type="text" class="form-control form-control-sm" id="accountantCrc"></div><div class="mb-2"><label class="form-label small">Contato</label><input type="text" class="form-control form-control-sm" id="accountantContact"></div><div class="mb-2"><textarea class="form-control form-control-sm" id="accountantNotes" rows="4" placeholder="Observações"></textarea></div>'
    });

    workspacePage({
      id: 'finance-page-vencimento',
      title: 'Vencimentos',
      subtitle: 'Vencimentos',
      description: 'Defina regras de vencimento por plano, contrato ou cobrança.',
      listId: 'financeDueRuleList',
      formId: 'financeDueRuleForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnDueRuleRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="dueRuleId"><div class="mb-2"><label class="form-label small">Regra</label><input type="text" class="form-control form-control-sm" id="dueRuleName"></div><div class="row g-2"><div class="col-6"><label class="form-label small">Dia padrão</label><input type="number" min="1" max="28" class="form-control form-control-sm" id="dueRuleDay"></div><div class="col-6"><label class="form-label small">Tolerância (dias)</label><input type="number" min="0" class="form-control form-control-sm" id="dueRuleTolerance"></div></div><div class="mt-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="dueRuleActive" checked><label class="form-check-label" for="dueRuleActive">Ativa</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-feriado',
      title: 'Feriados',
      subtitle: 'Feriados',
      description: 'Cadastre os feriados do calendário financeiro.',
      listId: 'financeHolidayList',
      formId: 'financeHolidayForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnHolidayRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="holidayId"><div class="mb-2"><label class="form-label small">Data</label><input type="date" class="form-control form-control-sm" id="holidayDate"></div><div class="mb-2"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="holidayName"></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="holidayRecurring"><label class="form-check-label" for="holidayRecurring">Repetir todo ano</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-contrato',
      title: 'Contratos Financeiros',
      subtitle: 'Contratos Financeiros',
      description: 'Gerencie contratos financeiros, cobranças e integrações.',
      listId: 'financeContractPolicyList',
      formId: 'financeContractPolicyForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnContractPolicyRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="contractPolicyId"><div class="mb-2"><label class="form-label small">Nome</label><input type="text" class="form-control form-control-sm" id="contractPolicyName"></div><div class="mb-2"><label class="form-label small">Descrição</label><textarea class="form-control form-control-sm" id="contractPolicyDescription" rows="3"></textarea></div><div class="mb-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="contractPolicyAutoCharge" checked><label class="form-check-label" for="contractPolicyAutoCharge">Cobrança automática</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-contadigital',
      title: 'Conta Digital',
      subtitle: 'Conta Digital',
      description: 'Configure a conta digital para cobranças e repasses.',
      listId: 'financeDigitalAccountList',
      formId: 'financeDigitalAccountForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnDigitalAccountRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="digitalAccountId"><div class="mb-2"><label class="form-label small">Banco / operadora</label><input type="text" class="form-control form-control-sm" id="digitalAccountBank"></div><div class="row g-2"><div class="col-6"><label class="form-label small">Agência</label><input type="text" class="form-control form-control-sm" id="digitalAccountAgency"></div><div class="col-6"><label class="form-label small">Conta</label><input type="text" class="form-control form-control-sm" id="digitalAccountNumber"></div></div><div class="mt-2"><label class="form-label small">Chave Pix</label><input type="text" class="form-control form-control-sm" id="digitalAccountPixKey"></div>'
    });

    workspacePage({
      id: 'finance-page-receber-add',
      title: 'Contas a Receber',
      subtitle: 'Lançar conta a receber',
      description: 'Crie lançamentos avulsos a receber.',
      listId: 'financeReceberList',
      formId: 'financeReceberForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnReceberRefresh">Atualizar</button></div>',
      formHtml: '<input type="hidden" id="receberId"><div class="mb-2"><label class="form-label small">Cliente</label><input type="text" class="form-control form-control-sm" id="receberCustomer"></div><div class="row g-2"><div class="col-6"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="receberAmount"></div><div class="col-6"><label class="form-label small">Vencimento</label><input type="date" class="form-control form-control-sm" id="receberDueDate"></div></div><div class="row g-2 mt-1"><div class="col-6"><label class="form-label small">Competência</label><input type="month" class="form-control form-control-sm" id="receberCompetencia"></div><div class="col-6"><label class="form-label small">Status</label><select class="form-select form-select-sm" id="receberStatus"><option>ABERTO</option><option>PAGO</option><option>CANCELADO</option></select></div></div><div class="mt-2"><textarea class="form-control form-control-sm" id="receberNotes" rows="3" placeholder="Observações"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnReceberSave">Salvar</button></div>'
    });

    workspacePage({
      id: 'finance-page-receber-list',
      title: 'Histórico de Recebíveis',
      subtitle: 'Histórico de recebíveis',
      description: 'Consulte lançamentos avulsos a receber.',
      listId: 'financeReceberHistoryList',
      formId: 'financeReceberHistoryForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><input type="month" class="form-control form-control-sm" id="receberHistoryMonth" style="max-width:180px"><button type="button" class="btn btn-outline-primary btn-sm" id="btnReceberHistoryRefresh">Atualizar</button></div>',
      formHtml: '<div class="alert alert-light mb-0">A consulta é feita pela lista ao lado. Use o filtro de competência acima.</div>'
    });

    workspacePage({
      id: 'finance-page-protocolo-list',
      title: 'Protocolos',
      subtitle: 'Protocolos',
      description: 'Consulte protocolos financeiros gerados.',
      listId: 'financeProtocolList',
      formId: 'financeProtocolForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnProtocolRefresh">Atualizar</button></div>',
      formHtml: '<div class="alert alert-light mb-0">Abra um protocolo para visualizar os dados e imprimir o documento.</div>'
    });

    workspacePage({
      id: 'finance-page-protocolo-add',
      title: 'Novo Protocolo',
      subtitle: 'Novo protocolo',
      description: 'Gere um novo protocolo financeiro.',
      listId: 'financeProtocolCreateList',
      formId: 'financeProtocolCreateForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnProtocolCreateRefresh">Limpar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Cliente</label><input type="text" class="form-control form-control-sm" id="protocolCustomer"></div><div class="mb-2"><label class="form-label small">Assunto</label><input type="text" class="form-control form-control-sm" id="protocolSubject"></div><div class="mb-2"><label class="form-label small">Descrição</label><textarea class="form-control form-control-sm" id="protocolDescription" rows="4"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnProtocolCreateSave">Gerar</button></div>'
    });

    workspacePage({
      id: 'finance-page-declaracao-quitacao',
      title: 'Declaração de Quitação',
      subtitle: 'Declaração de quitação',
      description: 'Gere declarações de quitação de débitos.',
      listId: 'financeQuitacaoList',
      formId: 'financeQuitacaoForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnQuitacaoRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Cliente</label><input type="text" class="form-control form-control-sm" id="quitacaoCustomer"></div><div class="row g-2"><div class="col-6"><label class="form-label small">Competência inicial</label><input type="month" class="form-control form-control-sm" id="quitacaoFrom"></div><div class="col-6"><label class="form-label small">Competência final</label><input type="month" class="form-control form-control-sm" id="quitacaoTo"></div></div><div class="mt-2"><textarea class="form-control form-control-sm" id="quitacaoText" rows="4" placeholder="Texto da declaração"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnQuitacaoSave">Gerar</button></div>'
    });

    workspacePage({
      id: 'finance-page-ad-lote',
      title: 'Acréscimos / Descontos',
      subtitle: 'Acréscimos / descontos em lote',
      description: 'Aplique acréscimos, descontos e ajustes em massa.',
      listId: 'financeAdjustList',
      formId: 'financeAdjustForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnAdjustRefresh">Atualizar</button></div>',
      formHtml: '<div class="row g-2"><div class="col-6"><label class="form-label small">Tipo</label><select class="form-select form-select-sm" id="adjustType"><option value="ACRESCIMO">Acréscimo</option><option value="DESCONTO">Desconto</option></select></div><div class="col-6"><label class="form-label small">Valor / %</label><input type="text" class="form-control form-control-sm" id="adjustValue" placeholder="10 ou 10%"></div></div><div class="mt-2"><label class="form-label small">Observação</label><textarea class="form-control form-control-sm" id="adjustNotes" rows="4"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnAdjustSave">Aplicar</button></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-atraso',
      title: 'Cobrança de Atraso',
      subtitle: 'Cobrança de atraso',
      description: 'Página para ações de cobrança por atraso.',
      listId: 'financeCobrancaAtrasoList',
      formId: 'financeCobrancaAtrasoForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaAtrasoRefresh">Atualizar</button></div>',
      formHtml: '<div class="alert alert-warning">Use os filtros da lista para selecionar os inadimplentes e disparar ações de cobrança.</div><div class="mb-2"><label class="form-label small">Mensagem</label><textarea class="form-control form-control-sm" id="cobrancaAtrasoMsg" rows="4"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCobrancaAtrasoSend">Enviar</button></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-lembrador',
      title: 'Lembrador de Cobrança',
      subtitle: 'Lembrador de cobrança',
      description: 'Configure lembretes automáticos para clientes.',
      listId: 'financeCobrancaLembradorList',
      formId: 'financeCobrancaLembradorForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaLembradorRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Template</label><input type="text" class="form-control form-control-sm" id="cobrancaLembradorTemplate"></div><div class="mb-2"><label class="form-label small">Dias antes do vencimento</label><input type="number" class="form-control form-control-sm" id="cobrancaLembradorDays"></div><div class="form-check"><input class="form-check-input" type="checkbox" id="cobrancaLembradorActive" checked><label class="form-check-label" for="cobrancaLembradorActive">Ativo</label></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-spc',
      title: 'SPC / Serasa',
      subtitle: 'SPC / Serasa',
      description: 'Integrações e rotinas de cobrança externa.',
      listId: 'financeCobrancaSpcList',
      formId: 'financeCobrancaSpcForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaSpcRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Convênio</label><input type="text" class="form-control form-control-sm" id="cobrancaSpcAgreement"></div><div class="mb-2"><label class="form-label small">Observação</label><textarea class="form-control form-control-sm" id="cobrancaSpcNotes" rows="4"></textarea></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-sms',
      title: 'SMS de Cobrança',
      subtitle: 'SMS de cobrança',
      description: 'Envie SMS de cobrança para clientes selecionados.',
      listId: 'financeCobrancaSmsList',
      formId: 'financeCobrancaSmsForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaSmsRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Mensagem</label><textarea class="form-control form-control-sm" id="cobrancaSmsMessage" rows="4"></textarea></div><div class="mb-2"><label class="form-label small">Assinatura</label><input type="text" class="form-control form-control-sm" id="cobrancaSmsSignature"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCobrancaSmsSend">Enviar SMS</button></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-email',
      title: 'Email de Cobrança',
      subtitle: 'Email de cobrança',
      description: 'Envie e-mails de cobrança em massa.',
      listId: 'financeCobrancaEmailList',
      formId: 'financeCobrancaEmailForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaEmailRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Assunto</label><input type="text" class="form-control form-control-sm" id="cobrancaEmailSubject"></div><div class="mb-2"><label class="form-label small">Corpo</label><textarea class="form-control form-control-sm" id="cobrancaEmailBody" rows="5"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCobrancaEmailSend">Enviar email</button></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-cartas',
      title: 'Cartas de Cobrança',
      subtitle: 'Cartas de cobrança',
      description: 'Gere cartas de cobrança para impressão ou envio.',
      listId: 'financeCobrancaCartasList',
      formId: 'financeCobrancaCartasForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaCartasRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Modelo</label><input type="text" class="form-control form-control-sm" id="cobrancaCartasTemplate"></div><div class="mb-2"><textarea class="form-control form-control-sm" id="cobrancaCartasText" rows="5"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnCobrancaCartasGenerate">Gerar cartas</button></div>'
    });

    workspacePage({
      id: 'finance-page-cobranca-recorrente',
      title: 'Cobrança Recorrente',
      subtitle: 'Cobrança recorrente',
      description: 'Configure rotinas automáticas de cobrança.',
      listId: 'financeCobrancaRecorrenteList',
      formId: 'financeCobrancaRecorrenteForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnCobrancaRecorrenteRefresh">Atualizar</button></div>',
      formHtml: '<div class="row g-2"><div class="col-6"><label class="form-label small">Frequência</label><select class="form-select form-select-sm" id="cobrancaRecorrenteFrequency"><option value="DAILY">Diária</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensal</option></select></div><div class="col-6"><label class="form-label small">Horário</label><input type="time" class="form-control form-control-sm" id="cobrancaRecorrenteTime"></div></div><div class="mt-2"><div class="form-check"><input class="form-check-input" type="checkbox" id="cobrancaRecorrenteActive" checked><label class="form-check-label" for="cobrancaRecorrenteActive">Ativa</label></div></div>'
    });

    workspacePage({
      id: 'finance-page-pix-e2id',
      title: 'Pix por ID',
      subtitle: 'Consulta Pix por ID',
      description: 'Consulte transações Pix pelo identificador da transação.',
      listId: 'financePixIdList',
      formId: 'financePixIdForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnPixIdSearch">Consultar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">E2E ID</label><input type="text" class="form-control form-control-sm" id="pixE2eId"></div><div class="mb-2"><label class="form-label small">Resultado</label><textarea class="form-control form-control-sm" id="pixE2eResult" rows="5" readonly></textarea></div>'
    });

    workspacePage({
      id: 'finance-page-pix-emv',
      title: 'Pix por QRCode',
      subtitle: 'Consulta Pix via EMV',
      description: 'Consulte um QRCode / EMV e veja o conteúdo decodificado.',
      listId: 'financePixEmvList',
      formId: 'financePixEmvForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnPixEmvSearch">Decodificar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">EMV / QRCode</label><textarea class="form-control form-control-sm" id="pixEmvInput" rows="5"></textarea></div><div class="mb-2"><label class="form-label small">Resultado</label><textarea class="form-control form-control-sm" id="pixEmvResult" rows="5" readonly></textarea></div>'
    });

    workspacePage({
      id: 'finance-page-pagar-nfe',
      title: 'Contas a Pagar (NFe)',
      subtitle: 'Contas a pagar por NFe',
      description: 'Lance contas a pagar a partir de notas fiscais.',
      listId: 'financePayableNfeList',
      formId: 'financePayableNfeForm',
      toolbar: '<div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-primary btn-sm" id="btnPayableNfeRefresh">Atualizar</button></div>',
      formHtml: '<div class="mb-2"><label class="form-label small">Fornecedor</label><input type="text" class="form-control form-control-sm" id="payableNfeSupplier"></div><div class="row g-2"><div class="col-6"><label class="form-label small">Número da NF</label><input type="text" class="form-control form-control-sm" id="payableNfeNumber"></div><div class="col-6"><label class="form-label small">Valor</label><input type="number" step="0.01" class="form-control form-control-sm" id="payableNfeAmount"></div></div><div class="row g-2 mt-1"><div class="col-6"><label class="form-label small">Vencimento</label><input type="date" class="form-control form-control-sm" id="payableNfeDue"></div><div class="col-6"><label class="form-label small">Competência</label><input type="month" class="form-control form-control-sm" id="payableNfeCompetence"></div></div><div class="mt-2"><textarea class="form-control form-control-sm" id="payableNfeNotes" rows="4" placeholder="Observações"></textarea></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="btnPayableNfeSave">Salvar</button></div>'
    });
  }

  function buildEquipmentPages() {
    addSection(
      "modalComodatoVenda",
      "Cadastrar Comodato / Venda",
      '<div id="modalComodatoVendaBody"></div><div id="modalComodatoVendaError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalComodatoVenda\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnComodatoVendaSave">Salvar</button></div>'
    );
    addSection(
      "modalDevolucaoEquipamento",
      "Devolução de Equipamento",
      '<input type="hidden" id="devolucaoCustomerId"><input type="hidden" id="devolucaoMovId"><div class="mb-2"><strong>Movimento:</strong> <span id="devolucaoEquipamentoInfo">—</span></div><div class="row g-3"><div class="col-md-4"><label class="form-label small">Data da devolução</label><input type="date" class="form-control form-control-sm" id="devolucaoData"></div><div class="col-md-4"><label class="form-label small">Condição</label><select class="form-select form-select-sm" id="devolucaoCondicao"><option value="PERFEITO">Perfeito</option><option value="DANIFICADO">Danificado</option><option value="NAO_DEVOLVIDO">Não devolvido</option></select></div><div class="col-md-4" id="devolucaoMultaWrap"><label class="form-label small">Valor da multa</label><input type="number" step="0.01" class="form-control form-control-sm" id="devolucaoMulta"></div></div><div id="modalDevolucaoError" class="alert alert-danger py-2 d-none mt-2"></div><div class="d-flex gap-2 mt-3"><button type="button" class="btn btn-secondary btn-sm" onclick="safeHideModal(\'modalDevolucaoEquipamento\')">Cancelar</button><button type="button" class="btn btn-primary btn-sm" id="btnDevolucaoSave">Registrar devolução</button></div>'
    );
    addSection(
      "modalHistoricoEquipamento",
      "Histórico do equipamento",
      '<div class="row g-3 mb-2"><div class="col-md-5"><label class="form-label small">MAC</label><input type="text" class="form-control form-control-sm" id="historicoMac"></div><div class="col-md-5"><label class="form-label small">Serial</label><input type="text" class="form-control form-control-sm" id="historicoSerial"></div><div class="col-md-2 d-flex align-items-end"><button type="button" class="btn btn-primary btn-sm w-100" id="btnHistoricoBuscar">Buscar</button></div></div><div class="table-responsive"><table class="table table-sm"><tbody id="historicoEquipamentoBody"><tr><td colspan="7" class="text-center text-muted py-3">Informe MAC ou Serial e clique em Buscar.</td></tr></tbody></table></div>'
    );
  }

  function init() {
    buildLeadPage();
    buildServiceOrderPage();
    buildContractPages();
    buildFinancePages();
    buildFinanceLandingPages();
    buildFinanceExtraPages();
    buildEquipmentPages();
    buildIAMPages();
    buildStockPages();
    buildEstoqueDashboardPage();
    buildSupportDashboardPage();
    buildAccountingPages();
    buildFinancialSubpages();
  }

  window.openEditInvoiceModal = function (invId, dueDate, amount, planCode, notes, onSuccess) {
    var idEl = document.getElementById('editInvoiceId');
    var dueEl = document.getElementById('editInvoiceDueDate');
    var amountEl = document.getElementById('editInvoiceAmount');
    var planEl = document.getElementById('editInvoicePlanCode');
    var notesEl = document.getElementById('editInvoiceNotes');
    if (!idEl || !dueEl || !amountEl || !planEl || !notesEl)
      return;
    idEl.value = String(invId || '');
    dueEl.value = dueDate ? dueDate.slice(0, 10) : '';
    amountEl.value = amount != null ? String(Number(amount)) : '';
    planEl.value = planCode || '';
    notesEl.value = notes || '';
    safeShowModal('modalEditInvoice');
    var saveBtn = document.getElementById('btnEditInvoiceSave');
    if (saveBtn) {
      saveBtn.onclick = function () {
        var id = idEl.value;
        if (!id)
          return;
        var payload = {};
        var due = dueEl.value;
        var amt = amountEl.value;
        var plan = planEl.value;
        var n = notesEl.value;
        if (due)
          payload.due_date = due;
        if (amt !== '')
          payload.amount = Number(amt);
        if (plan !== undefined)
          payload.plan_code = plan;
        if (n !== undefined)
          payload.notes = n || null;
        if (!Object.keys(payload).length) {
          alert('Altere algum campo.');
          return;
        }
        var url = (window.__API_BASE__ != null ? window.__API_BASE__ : '/api/portal') + '/finance/invoices/' + id;
        fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('portal_provedor_token') || '') }, body: JSON.stringify(payload), credentials: 'same-origin' })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (r) {
            if (!r.ok)
              throw new Error((r.data && (r.data.message || r.data.error)) || 'Erro ao salvar.');
            safeHideModal('modalEditInvoice');
            if (typeof onSuccess === 'function')
              onSuccess();
          })
          .catch(function (err) { alert(err.message || 'Erro ao salvar.'); });
      };
    }
  };

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();

