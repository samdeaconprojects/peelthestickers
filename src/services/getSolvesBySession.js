import dynamoDB from "../components/SignIn/awsConfig.js";

/**
 * Fetch ONE PAGE of solves for a given session, using DynamoDB paging.
 * Returns:
 *  - items: newest -> oldest (ScanIndexForward:false)
 *  - lastKey: LastEvaluatedKey (or null)
 *
 * You can reverse(items) in the caller if you want oldest -> newest UI order.
 */
export const getSolvesBySessionPage = async (
  userID,
  event,
  sessionID,
  limit = 200,
  cursor = null
) => {
  const normalizedEvent = (event || "").toUpperCase();

  try {
    const params = {
      TableName: "PTS",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      ExpressionAttributeValues: {
        ":gsi1pk": `SESSION#${userID}#${normalizedEvent}#${sessionID}`,
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
      ExclusiveStartKey: cursor || undefined,
    };

    const result = await dynamoDB.query(params).promise();

    return {
      items: result.Items || [],
      lastKey: result.LastEvaluatedKey || null,
    };
  } catch (err) {
    console.error("❌ Error fetching solves page:", err);
    throw err;
  }
};

/**
 * Fetch ALL solves for a given session, safely paging past DynamoDB's 1 MB limit.
 * Returns solves sorted oldest -> newest (so your UI slicing/indices work).
 */
export const getSolvesBySession = async (userID, event, sessionID) => {
  const normalizedEvent = (event || "").toUpperCase();
  let cursor = null;
  const all = [];

  try {
    do {
      const params = {
        TableName: "PTS",
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": `SESSION#${userID}#${normalizedEvent}#${sessionID}`,
        },
        ScanIndexForward: false, // newest first
        Limit: 1000,
        ExclusiveStartKey: cursor || undefined,
      };

      const result = await dynamoDB.query(params).promise();
      if (result.Items && result.Items.length) all.push(...result.Items);

      cursor = result.LastEvaluatedKey || null;
    } while (cursor);

    // reverse to oldest -> newest
    return all.reverse();
  } catch (err) {
    console.error("❌ Error fetching solves (paged):", err);
    throw err;
  }
};

/**
 * Quick helper: last N solves (oldest -> newest).
 */
export const getLastNSolvesBySession = async (userID, event, sessionID, n = 100) => {
  const normalizedEvent = (event || "").toUpperCase();

  try {
    const params = {
      TableName: "PTS",
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      ExpressionAttributeValues: {
        ":gsi1pk": `SESSION#${userID}#${normalizedEvent}#${sessionID}`,
      },
      ScanIndexForward: false, // newest first
      Limit: n,
    };

    const result = await dynamoDB.query(params).promise();
    const items = result.Items || [];
    return items.reverse();
  } catch (err) {
    console.error("❌ Error fetching last-N solves:", err);
    throw err;
  }
};
