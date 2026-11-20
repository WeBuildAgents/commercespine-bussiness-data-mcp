# Reporting security issues

Report suspected vulnerabilities privately to your SellerPlex contact. Do not put tokens, session files, customer data or authentication traces in public issues.

Use reviewed release assets and compare their hashes with SHA256SUMS.txt. Checksums detect corrupted or mismatched downloads; they are not an independent publisher signature. Browser login binds a loopback address, origin, nonce and explicit consent. Credentials are saved in a per-client private state directory, protected with CurrentUser DPAPI on Windows and user-only file permissions on Unix. Programs running as the same user may still access the connection.

Installation grants no server-side permissions. Account scope and organization roles are enforced by Commerce Spine. Approvals and provider execution are excluded from the MCP tool surface. Disconnect/revoke connections in Commerce Spine when access is no longer needed.
