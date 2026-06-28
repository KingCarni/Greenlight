import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALERT_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (request) => {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return new Response(JSON.stringify({ error: 'Missing environment.' }), { status: 500 });

    const db = createClient(url, key);
    const payload = await request.json().catch(() => ({}));
    const notificationId = payload.notification_id;
    if (!notificationId) return new Response(JSON.stringify({ error: 'notification_id required.' }), { status: 400 });

    const { data: notification, error: notificationError } = await db
      .from('app_notifications')
      .select('id, user_id, project_id, type, title, body, source_table, source_id, push_sent_at')
      .eq('id', notificationId)
      .single();
    if (notificationError || !notification) {
      return new Response(JSON.stringify({ error: notificationError?.message ?? 'Not found.' }), { status: 404 });
    }

    if (notification.push_sent_at) {
      return new Response(JSON.stringify({ ok: true, skipped: 'already_sent' }), { status: 200 });
    }

    const { data: rows, error: tokenError } = await db
      .from('push_tokens')
      .select('token')
      .eq('user_id', notification.user_id)
      .eq('is_active', true);
    if (tokenError) throw tokenError;

    const messages = (rows ?? []).map((row: { token: string }) => ({
      to: row.token,
      sound: 'default',
      title: notification.title,
      body: notification.body ?? '',
      data: {
        notification_id: notification.id,
        project_id: notification.project_id,
        type: notification.type,
        source_table: notification.source_table,
        source_id: notification.source_id,
      },
    }));

    if (messages.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_tokens' }), { status: 200 });
    }

    const sent = await fetch(ALERT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await sent.json().catch(() => null);
    if (!sent.ok) return new Response(JSON.stringify({ error: 'Delivery failed.', result }), { status: 502 });

    await db
      .from('app_notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .eq('id', notification.id);

    return new Response(JSON.stringify({ ok: true, count: messages.length, result }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500 });
  }
});
