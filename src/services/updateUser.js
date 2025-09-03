import dynamoDB from "../components/SignIn/awsConfig";
import { getUser } from "./getUser";

export const updateUser = async (userID, updates) => {
  // Fetch the current user to avoid overwriting nested fields accidentally
  const currentUser = await getUser(userID);

  // Merge existing user data with the updates
  const mergedData = { ...currentUser, ...updates };

  // Build update expressions dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  for (const [key, value] of Object.entries(mergedData)) {
    // Ignore keys we don't want to update
    if (key === "PK" || key === "SK") continue;

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
