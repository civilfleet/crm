import type { PoolClient } from "pg";

export type PublicationRequest = { teamId: string; revision: string };
export async function reconcilePublication(client: PoolClient) {
  // Includes tombstones already in the queue, so deletions survive cache loss.
  await client.query(`SELECT request_public_data_publication(id) FROM (
    SELECT DISTINCT "teamId" AS id FROM "Event" WHERE "isPublic"
    UNION SELECT "teamId" FROM "PublicDataPublicationState"
  ) teams`);
}
export async function pendingPublication(client: PoolClient, debounce = 30) {
  const result = await client.query<PublicationRequest>(
    `SELECT "teamId", "requestedRevision"::text AS revision FROM "PublicDataPublicationState"
     WHERE "requestedRevision" > "publishedRevision"
       AND "lastChangedAt" <= clock_timestamp() - $1 * interval '1 second'
       AND "nextAttemptAt" <= clock_timestamp() ORDER BY "teamId"`,
    [debounce],
  );
  return result.rows;
}
export async function completePublication(
  client: PoolClient,
  requests: PublicationRequest[],
) {
  for (const request of requests)
    await client.query(
      `UPDATE "PublicDataPublicationState" SET "publishedRevision" = GREATEST("publishedRevision", $2::bigint),
     attempts = 0, "lastError" = NULL, "lastPublishedAt" = clock_timestamp(), "nextAttemptAt" = clock_timestamp()
     WHERE "teamId" = $1`,
      [request.teamId, request.revision],
    );
}
export async function failPublication(
  client: PoolClient,
  requests: PublicationRequest[],
) {
  for (const request of requests)
    await client.query(
      `UPDATE "PublicDataPublicationState" SET attempts = attempts + 1,
      "nextAttemptAt" = clock_timestamp() + least(900, 30 * power(2, least(attempts, 5))) * interval '1 second',
      "lastError" = 'Public data publication failed; inspect publisher logs.' WHERE "teamId" = $1`,
      [request.teamId],
    );
}
