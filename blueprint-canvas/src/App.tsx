import { useState } from 'react';
import { BlueprintCanvas } from './components/canvas/BlueprintCanvas';
import { Toolbar } from './components/toolbar/Toolbar';

function App() {
  const [blueprintId] = useState('blueprint_001');
  const [userId] = useState(`user_${Math.random().toString(36).slice(2, 8)}`);
  const [userName] = useState('用户' + Math.floor(Math.random() * 1000));

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <BlueprintCanvas blueprintId={blueprintId} userId={userId} userName={userName} />
      <Toolbar />
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
          fontSize: 13,
          color: '#333',
        }}
      >
        图纸评审系统 · {blueprintId}
      </div>
    </div>
  );
}

export default App;
