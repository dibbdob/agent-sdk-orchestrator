# Runbook: sign-in and email

- RB-AUTH-1: Password reset emails are sent through the transactional mail provider. When they do not
  arrive, check the provider's suppression list for the address first; a hard bounce suppresses every
  later email to it.
