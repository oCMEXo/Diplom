import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { JoinPage } from "./routes/JoinPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { ProjectPage } from "./routes/ProjectPage";
import { FileEditorPage } from "./routes/FileEditorPage";
import { EmptyProjectView } from "./routes/EmptyProjectView";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Cached answers outlive the tab so projects and files that were opened before
      // can still be listed and edited when the network is gone.
      gcTime: WEEK_MS,
      networkMode: "offlineFirst",
    },
  },
});

export const QUERY_CACHE_KEY = "collab.query-cache";

const persister = createSyncStoragePersister({ storage: window.localStorage, key: QUERY_CACHE_KEY });

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: WEEK_MS }}
    >
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
    </PersistQueryClientProvider>
  );
}
