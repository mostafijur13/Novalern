// Firestore data layer.
//
//   users/{uid}                      profile
//   users/{uid}/lessons/{lessonId}   one "Learn with AI" session (chat history + summary)
//   users/{uid}/exams/{examId}       daily / weekly exams with questions, answers, score

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

// ---------- users ----------

export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || user.email?.split("@")[0] || "Learner",
      email: user.email || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
    });
  }
}

// ---------- lessons ----------

const lessonsCol = (uid) => collection(db, "users", uid, "lessons");

export async function createLesson(uid, data) {
  const ref = await addDoc(lessonsCol(uid), {
    title: "New lesson",
    topic: "General",
    summary: "",
    messages: [],
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateLesson(uid, lessonId, data) {
  await updateDoc(doc(db, "users", uid, "lessons", lessonId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function getLesson(uid, lessonId) {
  const snap = await getDoc(doc(db, "users", uid, "lessons", lessonId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getLessonsByIds(uid, ids) {
  const docs = await Promise.all(ids.map((id) => getLesson(uid, id)));
  return docs.filter(Boolean);
}

export function subscribeLessons(uid, callback, max = 50) {
  const q = query(lessonsCol(uid), orderBy("updatedAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function listLessons(uid, max = 50) {
  const q = query(lessonsCol(uid), orderBy("updatedAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- exams ----------

const examsCol = (uid) => collection(db, "users", uid, "exams");

export async function createExam(uid, data) {
  const ref = await addDoc(examsCol(uid), {
    status: "in_progress",
    answers: {},
    score: null,
    total: null,
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateExam(uid, examId, data) {
  await updateDoc(doc(db, "users", uid, "exams", examId), data);
}

export async function getExam(uid, examId) {
  const snap = await getDoc(doc(db, "users", uid, "exams", examId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function subscribeExams(uid, callback, max = 50) {
  const q = query(examsCol(uid), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ---------- helpers ----------

export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === "function") return ts.toDate();
  return new Date(ts);
}

export function formatDate(ts) {
  const d = toDate(ts);
  if (!d) return "Just now";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(ts) {
  const d = toDate(ts);
  if (!d) return "Just now";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
