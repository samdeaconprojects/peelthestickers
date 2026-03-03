// src/components/SignIn/SignIn.js
import React, { useState } from "react";

function SignIn({ onSignIn }) {
  const [userID, setUserID] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    const id = String(userID || "").trim();
    if (!id) {
      setErrorMessage("Enter a UserID");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      // CRA proxy routes this to http://localhost:5000
      const res = await fetch(`/api/user/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });

      if (res.status === 404) {
        setErrorMessage("User not found!");
        return;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }

      const data = await res.json();
      if (data?.user) {
        onSignIn(data.user);
      } else {
        setErrorMessage("User not found!");
      }
    } catch (err) {
      console.error("Error signing in:", err);
      setErrorMessage("An error occurred while signing in.");
    } finally {
      setLoading(false);
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
          setErrorMessage("");
        }}
        placeholder="Enter your UserID"
        disabled={loading}
      />

      <button onClick={handleSignIn} disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </button>

      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
    </div>
  );
}

export default SignIn;