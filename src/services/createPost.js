import dynamoDB from "../components/SignIn/awsConfig";
import { v4 as uuidv4 } from "uuid";

export const createPost = async (userID, note, event, solveList, comments) => {
  const timestamp = new Date().toISOString();

  const params = {
    TableName: "PTS",
    Item: {
      PK: `USER#${userID}`,
      SK: `POST#${timestamp}`,
      Note: note,
      Event: event,
      SolveList: solveList,
      Comments: comments,
      DateTime: timestamp
    }
  };

  try {
    await dynamoDB.put(params).promise();
    console.log("Post created.");
  } catch (err) {
    console.error("Error creating post:", err);
    throw err;
  }
};
