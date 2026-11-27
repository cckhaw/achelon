-- One-time: cancel the whole email backlog. Everything still waiting to be sent is dropped so nothing queued before the
-- test-mail fix can reach the provider. Rows are kept (status failed, never retried) for the record; their bodies are wiped.
UPDATE "email_outbox" SET "status" = 'failed', "attempts" = 5, "error" = 'cancelled: backlog cleared by operator', "body_text" = '[cancelled]', "body_html" = NULL WHERE "status" = 'pending';
