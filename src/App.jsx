import { useState } from 'react';
import { supabase } from './lib/supabase';
import './App.css';

function App() {

  const [message, setMessage] = useState('');

  async function testConnection() {

    setMessage('Connecting...');

    const { data, error } = await supabase
      .from('connection_test')
      .select('message')
      .single();

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(data.message);
    }
  }

  return (
    <div className="app">

      <h1>InterTrap</h1>

      <h2>Build Yourself.</h2>

      <p>
        Track your interviews, identify your weaknesses
        and improve your performance with AI.
      </p>

      <button onClick={testConnection}>
        Test Backend Connection
      </button>

      <p>{message}</p>

    </div>
  );
}

export default App;