import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";

const Landing = lazy(() => import("./pages/Landing"));
const RefPage = lazy(() => import("./pages/ref/RefPage"));
const PublicRoutes = lazy(() => import("./pages/public/PublicRoutes"));
const TvPage = lazy(() => import("./pages/public/TvPage"));
const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes"));

function Fallback() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/ref/:matchId" element={<RefPage />} />
        <Route path="/t/:slug/tv" element={<TvPage />} />
        <Route path="/t/:slug/*" element={<PublicRoutes />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="*" element={<div className="grid min-h-dvh place-items-center text-center"><div><h1 className="text-3xl font-black">404</h1><p className="text-muted-foreground">Page not found</p><a className="text-lime-accent underline" href="/">Home</a></div></div>} />
      </Routes>
    </Suspense>
  );
}
