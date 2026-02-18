// src/services/batchWrite.js
import dynamoDB from "../components/SignIn/awsConfig";

/**
 * DynamoDB BatchWriteItem wrapper
 * - Accepts raw WriteRequests (PutRequest/DeleteRequest)
 * - Auto-chunks to 25
 * - Retries UnprocessedItems with exponential backoff
 */
export async function batchWrite({
  tableName = "PTS",
  requests = [],
  maxRetries = 8,
  baseDelayMs = 80,
}) {
  if (!Array.isArray(requests) || requests.length === 0) return { wrote: 0 };

  const chunks = [];
  for (let i = 0; i < requests.length; i += 25) {
    chunks.push(requests.slice(i, i + 25));
  }

  let wrote = 0;

  for (const chunk of chunks) {
    let unprocessed = chunk;
    let attempt = 0;

    while (unprocessed.length > 0) {
      const params = {
        RequestItems: {
          [tableName]: unprocessed,
        },
      };

      const res = await dynamoDB.batchWrite(params).promise();
      const next = res?.UnprocessedItems?.[tableName] || [];

      wrote += unprocessed.length - next.length;
      unprocessed = next;

      if (unprocessed.length === 0) break;

      attempt += 1;
      if (attempt > maxRetries) {
        const err = new Error(
          `batchWrite: exceeded retries. Unprocessed count=${unprocessed.length}`
        );
        err.unprocessed = unprocessed;
        throw err;
      }

      const delay = Math.round(baseDelayMs * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { wrote };
}
