import dynamoDB from "../components/SignIn/awsConfig";

export const updateSolve = async (userID, timestamp, updates) => {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  for (const [key, value] of Object.entries(updates)) {
    const attrName = key === "Time" ? "#Time" : `#${key}`;
    const attrValue = key === "Time" ? ":Time" : `:${key}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  }

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`
    },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  try {
    await dynamoDB.update(params).promise();
    console.log("✅ Solve updated in DynamoDB.");
  } catch (err) {
    console.error("❌ Error updating solve:", err);
    throw err;
  }
};
