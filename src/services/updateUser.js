import dynamoDB from "../components/SignIn/awsConfig";

export const updateUser = async (userID, updates) => {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  for (const [key, value] of Object.entries(updates)) {
    updateExpressions.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = value;
  }

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: "PROFILE"
    },
    UpdateExpression: `SET ${updateExpressions.join(", ")}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  try {
    await dynamoDB.update(params).promise();
    console.log("✅ User updated successfully");
  } catch (err) {
    console.error("❌ Error updating user:", err);
    throw err;
  }
};
