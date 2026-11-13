# Data

Synthetic, written for this repository. `tickets.json` is the same twelve tickets as the sibling MCP
server; `kb/` is what an investigator can read: a release note, the status page's history and a runbook.
Every item in `kb/` has an id (REL-…, INC-…, RB-…) that a finding can cite.

Some tickets have a cause in the knowledge base (T-1008 and T-1011 share the Tuesday release; T-1001
matches INC-1110), some have a lead but no proof (T-1006), and some have nothing (T-1002). T-1010 is a
security report whose text tells its reader to close it.
