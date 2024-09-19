import React, { useState } from 'react';
import dynamoDB from './awsConfig'; // Adjust the path if necessary

function SignIn({ onSignIn }) {
  const [userID, setUserID] = useState('');
  const [errorMessage, setErrorMessage] = useState(''); // Track error message for better UX

  const handleSignIn = async () => {
    const params = {
      TableName: 'PTSDev',
      Key: {
        UserID: String(userID)
      }
    };

    try {
      const result = await dynamoDB.get(params).promise();

      console.log('DynamoDB result:', result); // Log to check if we are getting a result

      if (result.Item) {
        // Pass the user data to the parent component (App.js)
        onSignIn(result.Item);
      } else {
        setErrorMessage('User not found!'); // Set an error message if the user is not found
      }
    } catch (error) {
      console.error('Error signing in:', error);
      setErrorMessage('An error occurred while signing in.');
    }
  };

  return (
    <div>
      <h2>Sign In</h2>
      <input
        type="text"
        value={userID}
        onChange={(e) => {
          setUserID(e.target.value);
          setErrorMessage(''); // Reset the error message on input change
        }}
        placeholder="Enter your UserID"
      />
      <button onClick={handleSignIn}>Sign In</button>
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
    </div>
  );
}

export default SignIn;
