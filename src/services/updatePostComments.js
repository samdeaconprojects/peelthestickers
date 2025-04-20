// src/services/updatePostComments.js
import dynamoDB from "../components/SignIn/awsConfig";

/**
 * Overwrites the Comments attribute on an existing post item.
 *
 * @param {string} userID      – the user’s ID (without the “USER#” prefix)
 * @param {string} timestamp   – the ISO timestamp string that was used in SK
 * @param {string[]} comments  – the new array of comment strings
 */
export const updatePostComments = async (userID, timestamp, comments) => {
  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `POST#${timestamp}`
    },
    UpdateExpression: `SET Comments = :c`,
    ExpressionAttributeValues: {
      ":c": comments
    }
  };

  try {
    await dynamoDB.update(params).promise();
    console.log("✅ Post comments updated");
  } catch (err) {
    console.error("❌ Failed to update post comments:", err);
    throw err;
  }
};
