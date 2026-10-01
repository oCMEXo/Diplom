import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { JoinPage } from "./routes/JoinPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { ProjectPage } from "./routes/ProjectPage";
import { FileEditorPage } from "./routes/FileEditorPage";
import { EmptyProjectView } from "./routes/EmptyProjectView";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectPage />}>
                <Route index element={<EmptyProjectView />} />
                <Route path="files/:fileId" element={<FileEditorPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
