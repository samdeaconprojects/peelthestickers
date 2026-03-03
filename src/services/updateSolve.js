// src/services/updateSolve.js
import dynamoDB from "../components/SignIn/awsConfig";

function isUndef(v) {
  return typeof v === "undefined";
}

/**
 * Generic DynamoDB UpdateItem helper for SOLVE items.
 * - updates is a plain object of top-level attributes to SET.
 * - skips undefined values
 */
export const updateSolve = async (userID, timestamp, updates) => {
  if (!userID) throw new Error("updateSolve: userID is required");
  if (!timestamp) throw new Error("updateSolve: timestamp is required");
  if (!updates || typeof updates !== "object") {
    throw new Error("updateSolve: updates object is required");
  }

  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  for (const [key, value] of Object.entries(updates)) {
    if (isUndef(value)) continue; // ✅ don't send undefined to Dynamo

    // Always alias attribute names
    const attrName = `#${key}`;
    const attrValue = `:${key}`;

    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  }

  if (updateExpressions.length === 0) {
    return { ok: true, skipped: true };
  }

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`,
    },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  try {
    await dynamoDB.update(params).promise();
    console.log(" Solve updated in DynamoDB.");
    return { ok: true };
  } catch (err) {
    console.error(" Error updating solve:", err);
    throw err;
  }
};