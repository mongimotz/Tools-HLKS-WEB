// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRoot } from 'react-dom/client';

function App() {
  return <main style={{ fontFamily: 'system-ui', padding: 24 }}>Prinzipschema</main>;
}

createRoot(document.getElementById('root')!).render(<App />);
