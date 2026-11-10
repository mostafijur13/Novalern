import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import DailyExam from "./pages/DailyExam";
import ExamRunner from "./pages/ExamRunner";
import Home from "./pages/Home";
import Learn from "./pages/Learn";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import WeeklyRecap from "./pages/WeeklyRecap";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/learn/:lessonId" element={<Learn />} />
        <Route path="/daily" element={<DailyExam />} />
        <Route path="/weekly" element={<WeeklyRecap />} />
        <Route path="/exam/:examId" element={<ExamRunner />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
