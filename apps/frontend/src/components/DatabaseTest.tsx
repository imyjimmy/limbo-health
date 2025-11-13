import React, { useState } from 'react';

interface DatabaseTestResult {
  status: string;
  message: string;
  data?: {
    userCount: number;
    sampleUsers: any[];
    roles: any[];
    timestamp: string;
  };
  error?: string;
}

export const DatabaseTest: React.FC = () => {
  const [result, setResult] = useState<DatabaseTestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/database-test', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        status: 'error',
        message: 'Failed to connect to server',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Database Connectivity Test</h2>
      
      <button
        onClick={testConnection}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded mb-4"
      >
        {loading ? 'Testing...' : 'Test Database Connection'}
      </button>

      {result && (
        <div className={`p-4 rounded ${result.status === 'success' ? 'bg-green-900 border-green-500' : 'bg-red-900 border-red-500'} border`}>
          <h3 className="font-bold text-white mb-2">
            {result.status === 'success' ? '✅ Success' : '❌ Error'}
          </h3>
          <p className="text-gray-300 mb-4">{result.message}</p>
          
          {result.data && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-white">User Count: {result.data.userCount}</h4>
              </div>
              
              <div>
                <h4 className="font-semibold text-white mb-2">Sample Users:</h4>
                <div className="bg-gray-800 p-3 rounded overflow-x-auto">
                  <pre className="text-sm text-gray-300">
                    {JSON.stringify(result.data.sampleUsers, null, 2)}
                  </pre>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold text-white mb-2">User Roles:</h4>
                <div className="bg-gray-800 p-3 rounded overflow-x-auto">
                  <pre className="text-sm text-gray-300">
                    {JSON.stringify(result.data.roles, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
          
          {result.error && (
            <div className="bg-gray-800 p-3 rounded mt-4">
              <h4 className="font-semibold text-red-400 mb-2">Error Details:</h4>
              <pre className="text-sm text-red-300">{result.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};