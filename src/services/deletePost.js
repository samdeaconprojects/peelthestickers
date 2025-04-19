// services/deletePost.js
import dynamoDB from "../components/SignIn/awsConfig";

export const deletePost = async (userID, timestamp) => {
  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `POST#${timestamp}`
    }
  };

  try {
    await dynamoDB.delete(params).promise();
    console.log("Post deleted.");
  } catch (err) {
    console.error("Error deleting post:", err);
    throw err;
  }
};
