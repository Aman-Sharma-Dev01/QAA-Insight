
// Fix: Use namespace import for React to ensure JSX types are correctly resolved in environments without esModuleInterop
import * as React from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { User } from './types';
import { dataService } from './services/dataService';

const App: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Check if there's a saved token and verify it
    const verifySession = async () => {
      const token = localStorage.getItem('eduPulseToken');
      
      if (token) {
        try {
          const response = await dataService.verifyToken();
          if (response.success && response.data?.user) {
            setUser(response.data.user);
            localStorage.setItem('eduPulseUser', JSON.stringify(response.data.user));
          } else {
            // Token is invalid, clear storage
            localStorage.removeItem('eduPulseUser');
            localStorage.removeItem('eduPulseToken');
          }
        } catch (err) {
          // Fallback to saved user if server is unavailable
          const savedUser = localStorage.getItem('eduPulseUser');
          if (savedUser) {
            setUser(JSON.parse(savedUser));
          }
        }
      }
      
      setLoading(false);
    };

    verifySession();
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('eduPulseUser', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('eduPulseUser');
    localStorage.removeItem('eduPulseToken');
    localStorage.removeItem('eduPulse_activeSheet');
    localStorage.removeItem('eduPulse_filterState');
    dataService.logout();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading EduPulse...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {user ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
};

export default App;
