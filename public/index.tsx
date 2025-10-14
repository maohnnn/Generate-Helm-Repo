import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@public/global.css'
import GithubConnectionCenter from "@public/pages/connect";
function App() {

    return (
        <main>
            <GithubConnectionCenter/>
        </main>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)