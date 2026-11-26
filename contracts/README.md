# API contracts

`site-structure.d.ts` defines the structure report produced by the center's MySQL connector. The report includes table and column metadata and validation results.

The center API currently exposes:

- `GET /v1/sites`
- `GET /v1/sites/:id`
- `POST /v1/sites`
- `PATCH /v1/sites/:id`
- `POST /v1/sites/:id/reconnect` schedules a new direct connection attempt.

Site management uses native Soybean authentication and site permissions. Creation requires a database password. The center stores it encrypted and returns only its availability.

Structure validation uses mapping `epay-pro-2070-v1`, covering the required fields in `config`, `type`, `channel`, `roll`, `order`, `group`, and `user`. Its `reason` is `MATCHED`, `MISSING_TABLES_OR_COLUMNS`, `AMBIGUOUS_PREFIX`, or `NO_MATCH`. Each check records `table`, `exists`, `requiredColumns`, and `missingColumns`; the report also records candidate prefixes and the selected prefix when unambiguous. The center derives compatibility from this result; a reported connection error sets the structure status to unknown. Older reports without validation remain supported.

After verifying the schema, the center reads a consistent snapshot and publishes it to the central database. The center applies permitted strategy actions and reads back the resulting site values.

P6 collector heartbeats carry the collector version, health, browser state and account status. Account bindings are maintained centrally and account-status strategies may affect only the bound site channel.

`site-data.d.ts` defines allowlisted channel, polling-group/member and order fields. Identifiers and money are strings; timestamps include a timezone. Payment configuration, secrets, buyer details, IPs and callback URLs are excluded.

`site-control.d.ts` defines the internal command and result used by the center's strategy service and MySQL connector.

`collector-agent.d.ts` defines runtime settings, sessions, monitoring tasks and heartbeats for the Windows collector.

Native Soybean JWT plus `site:read` protects these reads:

- `GET /v1/sites/:id/summary`
- `GET /v1/sites/:id/channels`
- `GET /v1/sites/:id/polling-groups`
- `GET /v1/sites/:id/orders`
- `GET /v1/sites/:id/sync-history`

Tables support `current`, `size` (1–100) and keyword search; channel/group status filters use `ENABLED`, `DISABLED` or `UNKNOWN`. Orders additionally support normalized status, `channelCode`, and timezone-qualified `start`/`end` timestamps. History returns run summaries, without staging metadata or batches.

The center stages and publishes snapshot batches internally. Client applications read the active snapshot through the authenticated routes above.

Configuration changes invalidate old revisions. Only the active run's orders are visible; failed staging orders are removed, with at most 20 completed/failed history summaries retained. Reads use a consistent database transaction during concurrent publication.

The connector reads orders created before the snapshot cutoff. Mapping `epay-pro-2070-status-v2` counts positive numeric status as success and zero as failure. Amounts retain decimal precision, and MySQL DATETIME is interpreted in the site's configured timezone.

`GET /v1/auth/getUserInfo` supplies `site:read`, `site:create` and `site:update` button codes from the same live Casbin policies as API guards. The frontend reuses Soybean's native `useAuth`; API authorization remains authoritative after a grant is revoked.
