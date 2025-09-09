import dynamoDB from "../components/SignIn/awsConfig";

export const createSession = async (userID, event, sessionName) => {
  const normalizedEvent = event.toUpperCase();
  const sessionID = sessionName.toLowerCase().replace(/\s+/g, "-");

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SESSION#${normalizedEvent}#${sessionID}`,
      Event: normalizedEvent,
      SessionID: sessionID,
      SessionName: sessionName,
      CreatedAt: new Date().toISOString()
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(` Created session "${sessionName}" for ${normalizedEvent}`);
  } catch (err) {
    console.error(" Error creating session:", err);
    throw err;
  }
};
