import dynamoDB from "../components/SignIn/awsConfig";

export const updateSolvePenalty = async (userID, solveTimestamp, originalTime, penalty) => {
  let updatedTime = originalTime;
  if (penalty === '+2') updatedTime += 2000;
  if (penalty === 'DNF') updatedTime = Number.MAX_SAFE_INTEGER;

  const params = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${solveTimestamp}`,
    },
    UpdateExpression: `
      SET Penalty = :penalty,
          Time = :updatedTime,
          OriginalTime = if_not_exists(OriginalTime, :originalTime)
    `,
    ExpressionAttributeValues: {
      ":penalty": penalty,
      ":updatedTime": updatedTime,
      ":originalTime": originalTime,
    },
  };

  try {
    await dynamoDB.update(params).promise();
    console.log("✅ Solve penalty updated:", { userID, solveTimestamp, penalty });
  } catch (err) {
    console.error("❌ Error updating penalty:", err);
    throw err;
  }
};
