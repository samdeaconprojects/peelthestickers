import dynamoDB from "../components/SignIn/awsConfig";

export const getMessages = async (conversationID) => {
  const params = {
    TableName: "PTS",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `CONVO#${conversationID}`,
      ":sk": "MSG#"
    },
    ScanIndexForward: true
  };

  const result = await dynamoDB.query(params).promise();

  return (result.Items || []).map(item => ({
    sender: item.SenderID,
    text: item.Text,
    timestamp: item.DateTime
  }));
};
