import dynamoDB from "../components/SignIn/awsConfig";

/**
 * Supports BOTH:
 *  - createSession(userID, event, sessionName)
 *  - createSession(userID, event, sessionID, sessionName, opts)
 *
 * opts:
 *  - sessionType: "RELAY"
 *  - relayLegs: string[]
 */
export const createSession = async (userID, event, a3, a4, opts = {}) => {
  const normalizedEvent = String(event).toUpperCase();

  let sessionID;
  let sessionName;

  // old style: (userID, event, sessionName)
  if (typeof a4 === "undefined") {
    sessionName = a3;
    sessionID = String(sessionName).toLowerCase().replace(/\s+/g, "-");
  } else {
    // new style: (userID, event, sessionID, sessionName, opts)
    sessionID = a3;
    sessionName = a4;
  }

  const item = {
    PK: `USER#${userID}`,
    SK: `SESSION#${normalizedEvent}#${sessionID}`,
    Event: normalizedEvent,
    SessionID: sessionID,
    SessionName: sessionName,
    CreatedAt: new Date().toISOString(),
  };

  // Relay session metadata (sparse attributes)
  if (opts?.sessionType === "RELAY") {
    item.SessionType = "RELAY";
    item.RelayLegs = Array.isArray(opts.relayLegs) ? opts.relayLegs : [];
  }

  try {
    await dynamoDB.put({ TableName: "PTS", Item: item }).promise();
    console.log(` Created session "${sessionName}" for ${normalizedEvent}`);
    return item;
  } catch (err) {
    console.error(" Error creating session:", err);
    throw err;
  }
};
