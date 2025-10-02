import dynamoDB from "../components/SignIn/awsConfig.js";

/**
 * Fetch ALL solves for a given session, safely paging past DynamoDB's 1 MB limit.
 * Returns solves sorted oldest -> newest (so your existing Stats slicing & indices work exactly as before).
 *
 * Usage in App (unchanged from your old "grab everything" approach):
 *   const solves = await getSolvesBySession(userID, currentEvent, currentSessionID);
 *   setSessions(prev => ({ ...prev, [currentEvent]: solves }));
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
        // Newest first to make paging cheaper, then we'll reverse:
        ScanIndexForward: false,
        Limit: 1000,            // tune page size as you like (1000 is fine)
        ExclusiveStartKey: cursor || undefined,
      };

      const result = await dynamoDB.query(params).promise();
      if (result.Items && result.Items.length) {
        all.push(...result.Items);
      }
      cursor = result.LastEvaluatedKey || null;
    } while (cursor);

    // Your UI expects oldest -> newest. We fetched newest-first above, so reverse:
    return all.reverse();
  } catch (err) {
    console.error("❌ Error fetching solves (paged):", err);
    throw err;
  }
};

/**
 * If you later want a "quick" last-N fetch for other screens,
 * you can use this helper. Not required for restoring old Stats behavior.
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
    // Return oldest -> newest for consistency with your UI:
    return items.reverse();
  } catch (err) {
    console.error("❌ Error fetching last-N solves:", err);
    throw err;
  }
};
