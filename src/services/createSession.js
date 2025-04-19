import dynamoDB from "../components/SignIn/awsConfig";

export const createSession = async (userID, event, sessionID = "main", sessionName = "Main Session") => {
  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SESSION#${event}#${sessionID}`,
      Event: event,
      SessionID: sessionID,
      SessionName: sessionName,
      CreatedAt: new Date().toISOString()
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`Created session for ${event}`);
  } catch (err) {
    console.error("Error creating session:", err);
    throw err;
  }
};
