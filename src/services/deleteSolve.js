import dynamoDB from "../components/SignIn/awsConfig";

/**
 * Deletes a solve from the DynamoDB table using its timestamp.
 *
 * @param {string} userID - The ID of the user.
 * @param {string} timestamp - The exact ISO timestamp used in SK.
 */
export const deleteSolve = async (userID, timestamp) => {
  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`
    }
  };

  try {
    await dynamoDB.delete(params).promise();
    console.log("Solve deleted.");
  } catch (err) {
    console.error("Error deleting solve:", err);
    throw err;
  }
};
