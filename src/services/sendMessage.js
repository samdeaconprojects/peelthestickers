import dynamoDB from "../components/SignIn/awsConfig";

export const sendMessage = async (conversationID, senderID, text) => {
  const timestamp = new Date().toISOString();

  const params = {
    TableName: "PTS",
    Item: {
      PK: `CONVO#${conversationID}`,
      SK: `MSG#${timestamp}`,
      SenderID: senderID,
      Text: text,
      DateTime: timestamp
    }
  };

  await dynamoDB.put(params).promise();
};
