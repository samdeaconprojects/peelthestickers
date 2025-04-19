import dynamoDB from "../components/SignIn/awsConfig";
import { v4 as uuidv4 } from "uuid";

export const addSolve = async (userID, sessionID, event, time, scramble, penalty, note, tags) => {
    
  const timestamp = new Date().toISOString();

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `SOLVE#${timestamp}`,
      SessionID: sessionID,
      Event: event,
      Time: time,
      Scramble: scramble,
      Penalty: penalty,
      Note: note,
      Tags: tags,
      DateTime: timestamp,
      GSI1PK: `SESSION#${userID}#${event}#${sessionID}`,
      GSI1SK: timestamp
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log("USER ID");
    console.log(userID)
    console.log("Solve added.");
  } catch (err) {
    console.error("Error adding solve:", err);
    throw err;
  }
};
