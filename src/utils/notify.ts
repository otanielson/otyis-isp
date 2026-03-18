import { getPool } from '../db.js';

export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type NotificationType = 'INVOICE_GENERATED' | 'INVOICE_PAID' | 'TICKET_OPENED';

export interface EnqueueNotificationInput {
  tenantId: number;
  customerId?: number | null;
  channel: NotificationChannel;
  type: NotificationType | string;
  to?: string | null;
  payload?: unknown;
}

export async function enqueueNotification(input: EnqueueNotificationInput): Promise<number> {
  const pool = getPool();
  const payloadJson = input.payload != null ? JSON.stringify(input.payload) : null;
  try {
    const [r] = await pool.query(
      `INSERT INTO message_queue (tenant_id, customer_id, channel, type, to_address, payload_json, status)
       VALUES (:tid, :cid, :channel, :type, :to, CAST(:payload AS jsonb), 'PENDING')
       RETURNING id`,
      {
        tid: input.tenantId,
        cid: input.customerId ?? null,
        channel: input.channel,
        type: input.type,
        to: input.to ?? null,
        payload: payloadJson,
      }
    );
    const insertId = (r as { insertId?: number })?.insertId;
    return insertId ?? 0;
  } catch (e) {
    // Se a tabela ainda não existir em algum tenant antigo, apenas loga e segue.
    console.error('[notify] falha ao enfileirar notificação', e);
    return 0;
  }
}

