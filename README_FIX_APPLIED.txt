Applied stability/session-isolation fixes:
1. Added per-phone startup lock to prevent duplicate sockets for the same number.
2. Added per-phone message queue so one noisy/connecting session does not block other numbers.
3. Added initial history-sync guard after connect to skip replay storms that can freeze the bot after pairing.
4. Wrapped phone message handling in phone-scoped context so per-number runtime file state stays isolated.
5. Cleared per-phone guards during close/purge.
6. Fixed graceful shutdown typo causing warning on SIGTERM.

Verification done:
- node --check index.js
- short startup smoke test with Telegram disabled and no Mongo URI
