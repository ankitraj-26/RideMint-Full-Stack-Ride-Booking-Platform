import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import BookRide from './pages/BookRide';
import MyRides from './pages/MyRides';
import RiderDashboard from './pages/RiderDashboard';
import RiderProfile from './pages/RiderProfile';
import DriverProfile from './pages/DriverProfile';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import NotificationsPage from './pages/NotificationsPage';
import NotFound from './pages/NotFound';

const App = () => {
  return (
    <div className="app-shell">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/rider-dashboard"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <RiderDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/book-ride"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <BookRide />
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-rides"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <MyRides />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <RiderProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/driver-profile"
            element={
              <ProtectedRoute allowedRoles={['driver']}>
                <DriverProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/driver-dashboard"
            element={
              <ProtectedRoute allowedRoles={['driver']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/driver/notifications"
            element={
              <ProtectedRoute allowedRoles={['driver']}>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/notifications"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default App;
