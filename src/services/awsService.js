import dynamoDB from "../components/SignIn/awsConfig";

// Function to get user data with optional limit
export const getUserData = async (userID, limit = null) => {
  const params = {
    TableName: "PTSDev",
    Key: { UserID: userID },
  };
  try {
    const result = await dynamoDB.get(params).promise();
    if (result.Item) {
      const sessions = result.Item.Sessions || {};
      if (limit) {
        for (const key in sessions) {
          sessions[key] = sessions[key].slice(-limit);
        }
      }
      return { ...result.Item, Sessions: sessions };
    }
    return null;
  } catch (error) {
    console.error("Error fetching user data:", error);
    throw error;
  }
};

// Function to add a solve
export const addSolveToDynamoDB = async (userID, event, newSolve) => {
  const params = {
    TableName: "PTSDev",
    Key: { UserID: userID },
    UpdateExpression: `SET Sessions.#event = list_append(if_not_exists(Sessions.#event, :empty_list), :newSolve)`,
    ExpressionAttributeNames: {
      "#event": event,
    },
    ExpressionAttributeValues: {
      ":newSolve": [newSolve],
      ":empty_list": [],
    },
    ReturnValues: "ALL_NEW",
  };
  try {
    await dynamoDB.update(params).promise();
  } catch (error) {
    console.error("Error adding solve:", error);
    throw error;
  }
};

// Function to delete a solve
export const deleteSolveFromDynamoDB = async (userID, event, index) => {
  const params = {
    TableName: "PTSDev",
    Key: { UserID: userID },
    UpdateExpression: `REMOVE Sessions.#event[${index}]`,
    ExpressionAttributeNames: {
      "#event": event,
    },
    ReturnValues: "ALL_NEW",
  };
  try {
    await dynamoDB.update(params).promise();
  } catch (error) {
    console.error("Error deleting solve:", error);
    throw error;
  }
};


// Function to add a post
export const addPostToDynamoDB = async (userID, newPost) => {
  const params = {
    TableName: "PTSDev",
    Key: { UserID: userID },
    UpdateExpression: "SET Posts = list_append(if_not_exists(Posts, :empty_list), :newPost)",
    ExpressionAttributeValues: {
      ":newPost": [newPost],
      ":empty_list": []
    },
    ReturnValues: "ALL_NEW",
  };
  try {
    await dynamoDB.update(params).promise();
  } catch (error) {
    console.error("Error adding post:", error);
    throw error;
  }
};

// Function to delete a post
export const deletePostFromDynamoDB = async (userID, postIndex) => {
  const params = {
    TableName: "PTSDev",
    Key: { UserID: userID },
    UpdateExpression: `REMOVE Posts[${postIndex}]`,
    ReturnValues: "ALL_NEW",
  };
  try {
    await dynamoDB.update(params).promise();
  } catch (error) {
    console.error("Error deleting post:", error);
    throw error;
  }
};


