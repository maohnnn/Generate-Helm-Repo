import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@public/global.css'
import GithubConnectionCenter from "@public/pages/connect";
import RepoConfig from "@public/pages/repo-config";
import {HelmConfig} from "@public/pages/helm-config";
function App() {

    return (
        <main>
            {/*<GithubConnectionCenter/>*/}
            {/*<ConfigureRepoPage/>*/}
            <HelmConfig/>
        </main>
    )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)