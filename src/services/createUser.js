// src/services/createUser.js
import { apiPost } from "./api.js";

export const createUser = async (payload) => {
  const data = await apiPost("/api/user", payload);
  return data?.item;
};