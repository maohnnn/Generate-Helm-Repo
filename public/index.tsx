import { useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
    const [count, setCount] = useState(0)
    const increase = () => setCount((c) => c + 1)

    return (
        <main>
            <h2>{count}</h2>
            <button onClick={increase}>
                Increase
            </button>
        </main>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)