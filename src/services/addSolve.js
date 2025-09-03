import dynamoDB from "../components/SignIn/awsConfig";

export const addSolve = async (
  userID,
  sessionID,
  event,
  time,
  scramble,
  penalty,
  note,
  tags
) => {
  const normalizedEvent = event.toUpperCase(); // 🔹 Always uppercase
  const timestamp = new Date().toISOString();

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`,
      SessionID: sessionID,
      Event: normalizedEvent,
      Time: time,
      Scramble: scramble,
      Penalty: penalty,
      Note: note,
      Tags: tags,
      DateTime: timestamp,
      GSI1PK: `SESSION#${userID}#${normalizedEvent}#${sessionID}`,
      GSI1SK: timestamp
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log(`✅ Solve added for ${normalizedEvent} / ${sessionID}`);
  } catch (err) {
    console.error("❌ Error adding solve:", err);
    throw err;
  }
};
