-- Regras de negócio no banco: status encerrado não pode ser alterado
-- Execute após erp_fase1 (tabelas service_orders e tickets devem existir)
-- Ex.: psql -U postgres -d SEU_BANCO -f sql/support_status_lock_triggers.sql

-- ========== Ordem de Serviço: após COMPLETED ou CANCELLED, status é imutável ==========
CREATE OR REPLACE FUNCTION check_service_order_status_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('COMPLETED', 'CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Status não pode ser alterado após concluído ou cancelado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_service_order_status_lock ON service_orders;
CREATE TRIGGER tr_service_order_status_lock
  BEFORE UPDATE ON service_orders
  FOR EACH ROW
  EXECUTE PROCEDURE check_service_order_status_lock();


-- ========== Chamado (ticket): após RESOLVED ou CLOSED, status é imutável ==========
CREATE OR REPLACE FUNCTION check_ticket_status_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('RESOLVED', 'CLOSED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Status não pode ser alterado após resolvido ou fechado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ticket_status_lock ON tickets;
CREATE TRIGGER tr_ticket_status_lock
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE PROCEDURE check_ticket_status_lock();
