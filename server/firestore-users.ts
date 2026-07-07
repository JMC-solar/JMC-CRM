/**
 * Firestore-backed queries for the `users` collection. Kept separate from
 * server/firestore.ts (which stays a generic, collection-agnostic CRUD
 * toolkit) so every module that needs a user lookup — server/db.ts,
 * server/localAuth.ts, server/_core/sdk.ts, the users router in
 * server/routers.ts — shares one implementation.
 */
import { fdb, getById, insertOne, updateOne, deleteOne, listAll, docToData } from "./firestore";
import type { User } from "./models";

const USERS = "users";

export async function getUserById(id: number): Promise<User | undefined> {
  return getById<User>(USERS, id);
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const snap = await fdb().collection(USERS).where("openId", "==", openId).limit(1).get();
  if (snap.empty) return undefined;
  return docToData<User>(snap.docs[0]);
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const snap = await fdb().collection(USERS).where("username", "==", username).limit(1).get();
  if (snap.empty) return undefined;
  return docToData<User>(snap.docs[0]);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const snap = await fdb().collection(USERS).where("email", "==", email).limit(1).get();
  if (snap.empty) return undefined;
  return docToData<User>(snap.docs[0]);
}

export async function getUserByResetToken(token: string): Promise<User | undefined> {
  const snap = await fdb().collection(USERS).where("resetToken", "==", token).limit(1).get();
  if (snap.empty) return undefined;
  return docToData<User>(snap.docs[0]);
}

export async function listUsersRaw(): Promise<User[]> {
  return listAll<User>(USERS);
}

export async function createUser(
  data: Partial<Omit<User, "id">> & { openId: string }
): Promise<number> {
  return insertOne(USERS, {
    username: null,
    passwordHash: null,
    resetToken: null,
    resetTokenExpiry: null,
    totpSecret: null,
    totpEnabled: false,
    name: null,
    email: null,
    mobile: null,
    loginMethod: null,
    role: "subadmin",
    status: "active",
    createdBy: null,
    lastSignedIn: new Date(),
    ...data,
  });
}

export async function updateUser(id: number, patch: Partial<User>): Promise<void> {
  await updateOne(USERS, id, patch as Record<string, unknown>);
}

export async function deleteUser(id: number): Promise<void> {
  await deleteOne(USERS, id);
}
