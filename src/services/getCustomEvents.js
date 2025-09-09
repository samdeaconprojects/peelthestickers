import dynamoDB from "../components/SignIn/awsConfig";

export const getCustomEvents = async (userID) => {
  const params = {
    TableName: "PTS",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userID}`,
      ":prefix": "CUSTOMEVENT#"
    }
  };

  try {
    const result = await dynamoDB.query(params).promise();
    return result.Items.map(item => ({ id: item.EventID, name: item.EventName }));
  } catch (err) {
    console.error("Error fetching custom events:", err);
    throw err;
  }
};
