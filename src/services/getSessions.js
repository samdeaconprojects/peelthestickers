import dynamoDB from "../components/SignIn/awsConfig";

export const getSessions = async (userID) => {
  const params = {
    TableName: "PTS",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sessionPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userID}`,
      ":sessionPrefix": "SESSION#"
    }
  };

  try {
    const result = await dynamoDB.query(params).promise();
    console.log("Fetched sessions:", result.Items);
    return result.Items;
  } catch (err) {
    console.error("Error fetching sessions:", err);
    throw err;
  }
};
