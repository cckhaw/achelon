-- Stop queued mail to reserved test addresses (left behind by end-to-end runs) from ever being sent through the provider.
UPDATE "email_outbox" SET "status" = 'sent', "sent_at" = now(), "error" = 'suppressed: reserved test address', "body_text" = '[suppressed]', "body_html" = NULL
 WHERE "status" = 'pending' AND (lower(split_part("to_email", '@', 2)) ~ '(^|\.)(invalid|test|example|localhost)$' OR lower(split_part("to_email", '@', 2)) ~ '(^|\.)example\.(com|net|org)$');
