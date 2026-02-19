
// Fix: Use namespace import for React to ensure JSX types are correctly resolved
import * as React from 'react';
import { User } from '../types';
import { dataService } from '../services/dataService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        // Registration validation
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        const response = await dataService.register({
          username,
          email,
          password,
          displayName: displayName || username
        });

        if (response.success && response.data) {
          onLogin(response.data.user);
        } else {
          setError(response.error || 'Registration failed');
        }
      } else {
        // Login
        const response = await dataService.login(username, password);

        if (response.success && response.data) {
          onLogin(response.data.user);
        } else {
          setError(response.error || 'Invalid credentials');
        }
      }
    } catch (err) {
      setError('Failed to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    resetForm();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-900 p-8 text-center text-white" style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #2557a7 100%)' }}>
          <div className="mb-3">
            <a href="/landing.html" className="inline-flex items-center gap-1 text-xs text-indigo-200 hover:text-white transition" style={{ textDecoration: 'none' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              Back to Home
            </a>
          </div>
          <div className="flex flex-col items-center justify-center mb-2">
            <div className="bg-white border border-indigo-200 shadow flex items-center justify-center" style={{height:'90px',width:'200px',borderRadius:'6px'}}>
              <img src="/public/image.png" alt="QAA–Insight4Excellence Logo" className="object-contain h-full w-full" style={{borderRadius:'4px'}} />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2">QAA–Insight4Excellence</h1>
          <p className="mt-1 text-indigo-200 text-sm">Faculty Feedback Analytics Portal</p>
          <p className="mt-1 text-indigo-300 text-xs opacity-75">Manav Rachna University</p>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={() => { setIsRegister(false); resetForm(); }}
              className={`px-4 py-2 text-sm font-medium rounded-l-lg transition ${!isRegister
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); resetForm(); }}
              className={`px-4 py-2 text-sm font-medium rounded-r-lg transition ${isRegister
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  placeholder="Enter email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Display Name (optional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                  placeholder="Enter display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={isRegister ? 6 : undefined}
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Confirm Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-200 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {isRegister ? 'Creating Account...' : 'Signing in...'}
              </>
            ) : (
              isRegister ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
          <p className="text-xs text-slate-500">
            {isRegister
              ? 'Already have an account? '
              : "Don't have an account? "}
            <button
              onClick={toggleMode}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {isRegister ? 'Sign in' : 'Register'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
