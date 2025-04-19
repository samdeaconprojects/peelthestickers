// services/getPosts.js
import dynamoDB from "../components/SignIn/awsConfig";

export const getPosts = async (userID) => {
  const params = {
    TableName: "PTS",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userID}`,
      ":sk": "POST#"
    }
  };

  try {
    const result = await dynamoDB.query(params).promise();
    return result.Items;
  } catch (err) {
    console.error("Error fetching posts:", err);
    return [];
  }
};
