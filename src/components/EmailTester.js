// src/components/EmailTester.js
import React, { useEffect } from 'react';

const EmailTester = () => {
  useEffect(() => {
    const getUsernameEmail = async () => {
      try {
        const response = await fetch('/api/users/email/samdeacon');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Email:', data.email);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    getUsernameEmail();
  }, []);

  return (
    <div>
      <p>Check the console for the email.</p>
    </div>
  );
};

export default EmailTester;
