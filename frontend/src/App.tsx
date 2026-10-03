import { Suspense, lazy, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import SiteLayout from "./ui/SiteLayout";
import Home from "./pages/site/Home";
import Services from "./pages/site/Services";
import ServiceDetail from "./pages/site/ServiceDetail";
import Book from "./pages/site/Book";
import Confirmation from "./pages/site/Confirmation";
import Gallery from "./pages/site/Gallery";
import About from "./pages/site/About";
import { StylistProfile, Stylists } from "./pages/site/Stylists";
import Reviews from "./pages/site/Reviews";
import Contact from "./pages/site/Contact";
import { Faq, Policies } from "./pages/site/Info";
import FindMyStyle from "./pages/site/FindMyStyle";
import Inspiration from "./pages/site/Inspiration";
import { NotFound } from "./pages/site/GuestAppointment";

// The owner dashboard is its own chunk: clients never download it
const load = <T, K extends keyof T>(importer: () => Promise<T>, name: K) =>
  lazy(() => importer().then((m) => ({ default: m[name] as ComponentType })));
const StudioLayout = load(() => import("./pages/studio/StudioLayout"), "default");
const StudioLogin = load(() => import("./pages/studio/Login"), "default");
const PendingBookings = load(() => import("./pages/studio/PendingBookings"), "default");

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/book" element={<Book />} />
        <Route path="/book/sent" element={<Confirmation />} />
        <Route path="/book/confirmed/:ref" element={<Navigate to="/book/sent" replace />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/about" element={<About />} />
        <Route path="/stylists" element={<Stylists />} />
        <Route path="/stylists/:id" element={<StylistProfile />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/find-my-style" element={<FindMyStyle />} />
        <Route path="/inspiration" element={<Inspiration />} />
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/appointment/:ref" element={<Navigate to="/" replace />} />
        <Route path="/account/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route
        path="/studio/login"
        element={
          <Suspense fallback={<div className="grid min-h-screen place-items-center bg-ivory font-display text-2xl text-gold">Hair by Chi</div>}>
            <StudioLogin />
          </Suspense>
        }
      />
      <Route
        path="/studio"
        element={
          <Suspense fallback={<div className="grid min-h-screen place-items-center bg-ink font-display text-2xl text-gold">Hair by Chi</div>}>
            <StudioLayout />
          </Suspense>
        }
      >
        <Route index element={<PendingBookings />} />
      </Route>
    </Routes>
  );
}
