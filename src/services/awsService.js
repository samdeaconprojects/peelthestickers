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

// Function to sign up a new user
export const signUpUser = async (username, password) => {
  const params = {
    TableName: "PTSDev",
    Item: {
      UserID: username,
      Password: password, // Store securely (hashed and salted) in production
      Sessions: {},
      Posts: [],
      Friends: [],
    },
  };
  try {
    await dynamoDB.put(params).promise();
    return { message: "User created successfully!" };
  } catch (error) {
    console.error("Error signing up user:", error);
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
/*
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
*/
export const deleteSolveFromDynamoDB = async (userID, event, index) => {
  try {
    // Fetch the current user data
    const userData = await getUserData(userID);
    if (!userData || !userData.Sessions || !userData.Sessions[event]) {
      throw new Error("Event session not found.");
    }

    // Get the current solves array
    let solves = userData.Sessions[event];

    // Check if the index is valid
    if (index < 0 || index >= solves.length) {
      throw new Error("Invalid index for deletion.");
    }

    // Remove the selected solve
    solves.splice(index, 1);

    // Update DynamoDB with the modified array
    const params = {
      TableName: "PTSDev",
      Key: { UserID: userID },
      UpdateExpression: "SET Sessions.#event = :updatedSolves",
      ExpressionAttributeNames: { "#event": event },
      ExpressionAttributeValues: { ":updatedSolves": solves },
      ReturnValues: "ALL_NEW",
    };

    await dynamoDB.update(params).promise();
    console.log(`Successfully deleted solve at index ${index} for event ${event}`);
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
