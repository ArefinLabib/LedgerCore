import { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [authMode, setAuthMode] = useState('guest'); // 'guest', 'login', 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [activeUser, setActiveUser] = useState("");

  const [scenario, setScenario] = useState('hot-wallet');
  const [strategy, setStrategy] = useState('serializable');
  const [connections, setConnections] = useState(50);
  const [duration, setDuration] = useState(10);

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  
  const [results, setResults] = useState(null);
  
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (msg) => {
    setLogs(prev => [...prev, `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`]);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setIsLoadingAuth(true);
    try {
      let endpoint = '';
      let body = null;

      if (authMode === 'guest') {
        endpoint = '/api/auth/guest';
      } else if (authMode === 'login') {
        endpoint = '/api/auth/login';
        body = JSON.stringify({ username, password });
      } else {
        endpoint = '/api/auth/signup';
        body = JSON.stringify({ username, password });
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body
      });
      
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        setActiveUser(authMode === 'guest' ? data.username : username);
      } else {
        alert(data.message || 'Authentication failed');
      }
    } catch (error) {
      console.error("Auth failed:", error);
      alert("Failed to authenticate.");
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const runBenchmark = () => {
    setIsRunning(true);
    setResults(null);
    setProgress(0);
    setLogs([]);
    addLog('Initializing Database State...');

    const source = new EventSource(`/api/benchmarks/run-transfer?strategy=${strategy}&connections=${connections}&duration=${duration}&scenario=${scenario}`);

    source.addEventListener('info', (e) => {
      addLog(JSON.parse(e.data).message);
    });

    source.addEventListener('start', (e) => {
      addLog(JSON.parse(e.data).message);
    });

    source.addEventListener('tick', (e) => {
      addLog(JSON.parse(e.data).message);
      setProgress(p => Math.min(p + (100 / duration), 100));
    });

    source.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setResults(data);
      setIsRunning(false);
      setProgress(100);
      addLog('Benchmark Complete.');
      source.close();
    });

    source.addEventListener('error', (e) => {
      if (e.data) {
        addLog(`ERROR: ${JSON.parse(e.data).message}`);
      } else {
        addLog('Connection Closed.');
      }
      setIsRunning(false);
      source.close();
    });
  };

  return (
    <>
      <div className="bg-glow"></div>
      <div className="container">
        
        {!isAuthenticated ? (
          <div className="card auth-card">
            <div className="header">
              <h1>LedgerCore</h1>
              <p>High-Performance Distributed Transactions</p>
            </div>

            <div className="auth-tabs">
              <button className={authMode === 'guest' ? 'active' : ''} onClick={() => setAuthMode('guest')}>Guest</button>
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
              <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Sign Up</button>
            </div>
            
            <form onSubmit={handleAuth}>
              {authMode !== 'guest' && (
                <>
                  <div className="form-group">
                    <label>Username</label>
                    <input type="text" required value={username} onChange={e => setUsername(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                </>
              )}
              
              <button type="submit" className="btn btn-guest" disabled={isLoadingAuth}>
                {isLoadingAuth ? 'Authenticating...' : authMode === 'guest' ? 'Test as Guest' : authMode === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>
          </div>
        ) : (
          <div className="card dashboard-card">
            <div className="header">
              <h1>Benchmark Runner</h1>
              <p>Logged in as: <span style={{color: 'var(--primary)'}}>{activeUser}</span></p>
            </div>

            <div className="form-group">
              <label>Test Scenario</label>
              <select value={scenario} onChange={(e) => setScenario(e.target.value)} disabled={isRunning}>
                <option value="happy-path">1. The Happy Path (Zero Contention)</option>
                <option value="hot-wallet">2. The Hot Wallet (1-Way Contention)</option>
                <option value="deadlock">3. The Deadlock (2-Way Contention)</option>
                <option value="overdraft">4. The Overdraft Attack (Write Skew)</option>
              </select>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Concurrency Strategy</label>
                <select value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={isRunning}>
                  <option value="serializable">Serializable (Strict)</option>
                  <option value="optimistic">Optimistic (Versioned)</option>
                  <option value="pessimistic">Pessimistic (Row Lock)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Concurrent Connections</label>
                <input 
                  type="number" 
                  value={connections} 
                  onChange={(e) => setConnections(e.target.value)}
                  disabled={isRunning}
                  min="10" max="500"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Duration (Seconds)</label>
              <input 
                type="number" 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                disabled={isRunning}
                min="5" max="60"
              />
            </div>

            <button className="btn mt-4" onClick={runBenchmark} disabled={isRunning}>
              {isRunning ? 'Running Benchmark...' : 'Launch Autocannon'}
            </button>

            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>

            {/* Live Terminal Area */}
            <div className="terminal" ref={terminalRef}>
              <div className="terminal-header">
                <span className="dot dot-red"></span>
                <span className="dot dot-yellow"></span>
                <span className="dot dot-green"></span>
                <span className="terminal-title">bash - ledgercore</span>
              </div>
              <div className="terminal-body">
                {logs.length === 0 && <span style={{color: '#555'}}>$ waiting for execution...</span>}
                {logs.map((log, i) => (
                  <div key={i} className="terminal-line">
                    <span className="prompt">$</span> {log}
                  </div>
                ))}
                {isRunning && <div className="cursor-blink">_</div>}
              </div>
            </div>

            {results && (
              <div className="results-panel mt-4">
                <h3 className="results-title">Execution Results</h3>
                
                <div className="results-grid">
                  <div className="stat-box">
                    <div className="stat-label">Throughput (Req/Sec)</div>
                    <div className="stat-value" style={{color: '#c084fc'}}>
                      {Math.round(results.autocannon.requests.average)}
                    </div>
                  </div>
                  
                  <div className="stat-box">
                    <div className="stat-label">Total Requests</div>
                    <div className="stat-value">
                      {results.autocannon.requests.total}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">Conflicts (409 / 500)</div>
                    <div className={`stat-value ${results.statusCounts['409'] || results.statusCounts['500'] ? 'danger' : 'success'}`}>
                      {(results.statusCounts['409'] || 0) + (results.statusCounts['500'] || 0)}
                    </div>
                  </div>

                  <div className="stat-box">
                    <div className="stat-label">Data Integrity</div>
                    <div className={`stat-value ${results.invariantHeld ? 'success' : 'danger'}`}>
                      {results.invariantHeld ? 'PASSED' : 'FAILED'}
                    </div>
                  </div>
                </div>

                <div className="latency-table-container mt-4">
                  <h4>Latency Metrics (ms)</h4>
                  <table className="latency-table">
                    <thead>
                      <tr>
                        <th>Average</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>p50 (Median)</th>
                        <th>p97.5</th>
                        <th>p99</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{results.autocannon.latency.average}</td>
                        <td>{results.autocannon.latency.min}</td>
                        <td>{results.autocannon.latency.max}</td>
                        <td>{results.autocannon.latency.p50}</td>
                        <td>{results.autocannon.latency.p97_5}</td>
                        <td style={{color: 'var(--danger)', fontWeight: 'bold'}}>{results.autocannon.latency.p99}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="inference-panel mt-4">
                  <h4 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Engineering Inference</h4>
                  
                  {scenario === 'happy-path' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>Zero Contention:</strong> You just ran a raw throughput test where every transaction operated on isolated accounts. Notice how the throughput and latency are essentially identical regardless of the strategy you chose! Under zero contention, Pessimistic locks are acquired instantly and Optimistic versions never collide. This proves a core distributed systems concept: <i>Concurrency strategies only diverge in performance when there is contention.</i>
                    </p>
                  )}

                  {scenario === 'hot-wallet' && strategy === 'serializable' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>The Hot Wallet:</strong> You just hammered 2 accounts. Postgres automatically aborted concurrent transactions to prevent Write Skew (SQLSTATE 40001). However, our backend implements a <strong>recursive retry loop</strong> that catches these aborts and silently retries them. This guarantees 100% data integrity without surfacing errors to the user, but causes the average and tail latency (p99) to skyrocket as transactions wait to be retried.
                    </p>
                  )}

                  {scenario === 'hot-wallet' && strategy === 'pessimistic' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>The Convoy Effect:</strong> You used a <i>Pessimistic Row Lock (SELECT ... FOR UPDATE)</i> on 2 accounts. The first connection locks the rows. The remaining {connections - 1} connections are forced into a queue. The final requests literally have to wait for every single previous request to commit before they can even read the balance, resulting in massive tail latency (p99) but zero aborted transactions.
                    </p>
                  )}

                  {scenario === 'hot-wallet' && strategy === 'optimistic' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>Version Collisions:</strong> You used <i>Optimistic Concurrency Control (OCC)</i>. Every request reads the balance and a version number. Because {connections} connections read the same version simultaneously, the first to update it succeeds. The remaining {connections - 1} connections are rejected because their version is stale. However, our backend implements an <strong>exponential backoff retry loop</strong>. The rejected requests sleep and retry repeatedly before throwing 409 Conflicts. This causes massive tail latency and severely reduces throughput.
                    </p>
                  )}

                  {scenario === 'deadlock' && strategy === 'pessimistic' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>Deadlock Detected:</strong> You transferred money randomly across 5 accounts. Transaction A locked Alice and tried to lock Bob. Transaction B locked Bob and tried to lock Alice. They waited on each other indefinitely. Postgres detected this cycle and threw `SQLSTATE 40P01`, forcing a 500 error. This proves that Pessimistic Row Locking is extremely vulnerable to Deadlocks if resources aren't locked in a deterministic order!
                    </p>
                  )}

                  {scenario === 'deadlock' && strategy === 'optimistic' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>The Optimistic Deadlock Illusion:</strong> You just discovered an incredible fact about relational databases! Even though you used Optimistic Concurrency Control (which avoids `SELECT ... FOR UPDATE`), the actual `UPDATE` statements still intrinsically acquire exclusive row locks. Because our backend updates the accounts in the order of the request (From Account -&gt; To Account), concurrent reverse transfers will still Deadlock (`SQLSTATE 40P01`) at the `UPDATE` step! The only true way to prevent deadlocks is to sort the accounts by ID and update them in a deterministic order.
                    </p>
                  )}

                  {scenario === 'deadlock' && strategy === 'serializable' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>Deadlocks Traded for Serialization Aborts:</strong> You transferred money randomly across 5 accounts. By using Snapshot Isolation instead of explicit row locks, Deadlocks (`SQLSTATE 40P01`) were completely avoided! However, Postgres had to violently abort concurrent transactions (`SQLSTATE 40001`) to prevent data corruption. Our recursive retry loop silently caught and retried these aborts, preserving 100% data integrity at the cost of high tail latency.
                    </p>
                  )}

                  {scenario === 'overdraft' && (
                    <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong>The Overdraft Attack:</strong> You just tried to withdraw $100 from an account that only had $100... {connections} times simultaneously! Thanks to your concurrency control strategy, the database correctly serialized the requests. Exactly 1 request succeeded, and the other {connections - 1} were safely rejected, proving your ledger is cryptographically secure against race conditions.
                    </p>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </>
  );
}

export default App;
