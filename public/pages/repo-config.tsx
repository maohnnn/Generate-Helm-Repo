import React, { useEffect, useMemo, useState } from "react";
import {Label} from '../components/label'
import {Divider} from "@public/components/divider";
import {Header} from "@public/components/header";
import {Row} from "@public/components/row";
/**
 * UI Pages (React + Tailwind)
 * 1) ConfigureRepoPage — ตั้งค่า Owner/Org, ชื่อรีโป (แนะนำเป็น Helm-<AppName>), และเพิ่ม Teams
 * 2) VariablesPage — ดึงตัวแปร ${VAR} จาก template แล้วให้ผู้ใช้กรอกค่าแทนลงใน Chart.yaml/values.yaml พร้อม Preview
 *
 * Note: ใช้ร่วมกับหน้า Connection Center (PAT only) ที่คุณมีอยู่แล้ว
 *
 * 👉 แก้บั๊ก SyntaxError: Unterminated string constant
 *    - เปลี่ยน prompt ของ Import .env ให้ใช้ template literal พร้อม \n
 * 👉 แก้ regex split บรรทัด .env ให้ถูกต้องเป็น /\r?\n/
 * 👉 ปรับ regex ทำความสะอาดชื่อรีโป ให้วางเครื่องหมายขีด '-' ไว้ท้ายคลาส (หลีกเลี่ยงช่วงอักขระ)
 * 👉 เพิ่ม Test cases (รันเฉพาะเมื่อ window.__RUN_TESTS__ = true)
 */

// ============================================================================
// Page 2: Configure Repo
// ============================================================================
export default function RepoConfig() {
    // ======= State =======
    const [connections, setConnections] = useState<ConnectionItem[]>([]);
    const [connectionId, setConnectionId] = useState<string>("");

    const [owners, setOwners] = useState<OwnerItem[]>([]);
    const [owner, setOwner] = useState<string>(""); // login ของ owner
    const [ownerType, setOwnerType] = useState<"User" | "Org" | "">("");

    const [appName, setAppName] = useState("");
    const [repoName, setRepoName] = useState("");
    const [useSuggestion, setUseSuggestion] = useState(true);

    const [checking, setChecking] = useState(false);
    const [exists, setExists] = useState<boolean | null>(null);

    const [teams, setTeams] = useState<TeamOption[]>([]); // จาก org
    const [teamQuery, setTeamQuery] = useState("");
    const [selectedTeams, setSelectedTeams] = useState<SelectedTeam[]>([]);

    const suggestedName = useMemo(() => suggestRepoName(appName), [appName]);

    // ======= Init: load connections =======
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/connections");
                const data = (await res.json()) as { items: ConnectionItem[] };
                setConnections(data.items || []);
                const def = data.items?.find((x) => x.default) || data.items?.[0];
                if (def) setConnectionId(def.id);
            } catch {}
        })();
    }, []);

    // ======= Load owners when connection changes =======
    useEffect(() => {
        if (!connectionId) return;
        (async () => {
            try {
                const res = await fetch(`/api/github/orgs?connection=${connectionId}`);
                const data = (await res.json()) as { owners: OwnerItem[] };
                setOwners(data.owners || []);
                // เลือกอันแรกเป็นค่าเริ่มต้น
                if (data.owners?.length) {
                    const first = data.owners[0];
                    setOwner(first.login);
                    setOwnerType(first.type);
                }
            } catch {}
        })();
    }, [connectionId]);

    // ======= Load teams when owner (Org) changes =======
    useEffect(() => {
        if (!connectionId || !owner || ownerType !== "Org") return;
        (async () => {
            try {
                const res = await fetch(`/api/github/orgs/${owner}/teams?connection=${connectionId}`);
                const data = (await res.json()) as { teams: TeamOption[] };
                setTeams(data.teams || []);
            } catch {}
        })();
    }, [connectionId, owner, ownerType]);

    // ======= Suggestion binding =======
    useEffect(() => {
        if (useSuggestion) setRepoName(suggestedName);
    }, [suggestedName, useSuggestion]);

    // ======= Check availability =======
    useEffect(() => {
        if (!owner || !repoName || !connectionId) {
            setExists(null);
            return;
        }
        const handle = setTimeout(async () => {
            setChecking(true);
            try {
                const res = await fetch(`/api/github/repos/check?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(repoName)}&connection=${connectionId}`);
                const data = (await res.json()) as { exists: boolean };
                setExists(data.exists);
            } catch {
                setExists(null);
            } finally {
                setChecking(false);
            }
        }, 450);
        return () => clearTimeout(handle);
    }, [owner, repoName, connectionId]);

    const filteredTeams = useMemo(() => {
        if (!teamQuery) return teams;
        const q = teamQuery.toLowerCase();
        return teams.filter((t) => (t.name + t.slug).toLowerCase().includes(q));
    }, [teams, teamQuery]);

    // ======= Actions =======
    function addTeam(t: TeamOption) {
        if (selectedTeams.some((x) => x.slug === t.slug)) return;
        setSelectedTeams((prev) => [...prev, { slug: t.slug, name: t.name, permission: "maintain" }]);
    }
    function removeTeam(slug: string) {
        setSelectedTeams((prev) => prev.filter((x) => x.slug !== slug));
    }
    function updatePermission(slug: string, p: Permission) {
        setSelectedTeams((prev) => prev.map((x) => (x.slug === slug ? { ...x, permission: p } : x)));
    }

    async function handleNext() {
        // เก็บค่า config ไว้ใน wizard (ฝั่งเซิร์ฟเวอร์/คลายเอนต์ตามสะดวก)
        await fetch("/api/wizard/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId, owner, repoName, appName, teams: selectedTeams }),
        }).catch(() => {});
        // ไปหน้า Variables
        window.location.hash = "#/variables";
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
            <div className="mx-auto max-w-6xl px-4 py-10">
                <Header title="ตั้งค่า Repository" subtitle="กำหนด owner, ชื่อรีโป และทีมที่จะมีสิทธิ์ในรีโป" />

                <div className="mt-8 grid gap-6 lg:grid-cols-5">
                    {/* LEFT: Form */}
                    <section className="lg:col-span-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            {/* Connection */}
                            <div className="grid gap-2">
                                <Label>Connection</Label>
                                <select
                                    value={connectionId}
                                    onChange={(e) => setConnectionId(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                >
                                    {connections.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.alias} — {c.user?.login}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500">
                                    จัดการ/เพิ่ม token ได้ที่หน้า <a href="#/connections" className="underline decoration-dotted">Connections</a>
                                </p>
                            </div>

                            <Divider />

                            {/* Owner */}
                            <div className="grid gap-2">
                                <Label>Owner / Organization</Label>
                                <select
                                    value={owner}
                                    onChange={(e) => {
                                        setOwner(e.target.value);
                                        const o = owners.find((x) => x.login === e.target.value);
                                        setOwnerType((o?.type as any) || "");
                                        setSelectedTeams([]); // reset teams เมื่อเปลี่ยน owner
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                >
                                    {owners.map((o) => (
                                        <option key={o.login} value={o.login}>
                                            {o.name ? `${o.name} (@${o.login})` : o.login} {o.type === "Org" ? "— Org" : "— User"}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <Divider />

                            {/* App & Repo name */}
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <Label>ชื่อแอป (ใช้เพื่อเสนอชื่อรีโป)</Label>
                                    <input
                                        value={appName}
                                        onChange={(e) => setAppName(e.target.value)}
                                        placeholder="เช่น booking-service"
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                    />
                                    <p className="mt-1 text-[11px] text-slate-500">ระบบจะแนะนำชื่อรีโปเป็น <code>Helm-{`{AppName}`}</code> คุณสามารถแก้ไขได้</p>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between">
                                        <Label>ชื่อรีโป (Repo name)</Label>
                                        <label className="flex items-center gap-2 text-xs">
                                            <input type="checkbox" checked={useSuggestion} onChange={(e) => setUseSuggestion(e.target.checked)} />
                                            <span>ใช้ชื่อแนะนำ</span>
                                        </label>
                                    </div>
                                    <input
                                        value={repoName}
                                        onChange={(e) => { setRepoName(e.target.value); setUseSuggestion(false); }}
                                        placeholder="Helm-booking-service"
                                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                    />
                                    <Availability exists={exists} checking={checking} owner={owner} name={repoName} />
                                </div>
                            </div>

                            {/* Teams (Org only) */}
                            {ownerType === "Org" && (
                                <div className="mt-6">
                                    <div className="flex items-center justify-between">
                                        <Label>Teams & Permissions</Label>
                                        <small className="text-slate-500">เฉพาะ Organization</small>
                                    </div>

                                    <div className="mt-2 grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={teamQuery}
                                                onChange={(e) => setTeamQuery(e.target.value)}
                                                placeholder="ค้นหา team ใน org นี้"
                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                            />
                                            <button
                                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                                onClick={() => setTeamQuery("")}
                                            >
                                                เคลียร์
                                            </button>
                                        </div>

                                        <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                            {filteredTeams.length === 0 ? (
                                                <div className="p-3 text-sm text-slate-500">ไม่พบทีม</div>
                                            ) : (
                                                <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                                                    {filteredTeams.map((t) => (
                                                        <li key={t.slug} className="flex items-center justify-between px-3 py-2">
                                                            <div>
                                                                <div className="font-medium">{t.name}</div>
                                                                <div className="text-xs text-slate-500">@{t.slug}</div>
                                                            </div>
                                                            <button
                                                                onClick={() => addTeam(t)}
                                                                disabled={selectedTeams.some((x) => x.slug === t.slug)}
                                                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                                            >
                                                                เพิ่มทีม
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        {selectedTeams.length > 0 && (
                                            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                                                <div className="mb-2 text-sm font-medium">ทีมที่เลือก</div>
                                                <ul className="space-y-2">
                                                    {selectedTeams.map((t) => (
                                                        <li key={t.slug} className="flex items-center justify-between gap-2">
                                                            <div className="truncate">
                                                                <span className="font-medium">{t.name}</span>
                                                                <span className="ml-2 text-xs text-slate-500">@{t.slug}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <select
                                                                    value={t.permission}
                                                                    onChange={(e) => updatePermission(t.slug, e.target.value as Permission)}
                                                                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                                                                >
                                                                    <option value="admin">admin</option>
                                                                    <option value="maintain">maintain</option>
                                                                    <option value="push">push</option>
                                                                    <option value="triage">triage</option>
                                                                    <option value="read">read</option>
                                                                </select>
                                                                <button
                                                                    onClick={() => removeTeam(t.slug)}
                                                                    className="rounded-lg border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                                                                >
                                                                    ลบ
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex items-center justify-between">
                                <a href="#/connections" className="text-sm underline decoration-dotted">← ย้อนกลับ: Connections</a>
                                <button
                                    onClick={handleNext}
                                    disabled={!connectionId || !owner || !repoName || exists === true}
                                    className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
                                >
                                    ถัดไป: Variables
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* RIGHT: Summary */}
                    <aside className="lg:col-span-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="text-sm font-medium">สรุป</h3>
                            <div className="mt-3 space-y-3 text-sm">
                                <Row label="Connection" value={connections.find((x) => x.id === connectionId)?.alias || "–"} />
                                <Row label="Owner" value={owner || "–"} />
                                <Row label="Repo name" value={repoName || suggestedName || "–"} />
                                {ownerType === "Org" && <Row label="Teams" value={selectedTeams.length ? `${selectedTeams.length} team(s)` : "–"} />}
                            </div>
                            {owner && repoName && (
                                <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
                                    <div className="font-medium">ตัวอย่างคำสั่ง (หลังสร้างสำเร็จ)</div>
                                    <pre className="mt-2 whitespace-pre-wrap break-words">{`helm repo add ${repoName.toLowerCase()} https://${owner}.github.io/${repoName}/\nhelm search repo ${repoName.toLowerCase()}`}</pre>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                            แนะนำ: ใช้สิทธิ์ <b>fine-grained</b> PAT และจำกัดเฉพาะ Org/Repo ที่ต้องใช้จริง หากต้องเพิ่มทีม ต้องมีสิทธิ์ <code>admin:org</code>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

// ======= Types (Configure) =======

type ConnectionItem = { id: string; alias: string; default?: boolean; user?: { login: string } };
type OwnerItem = { type: "User" | "Org"; login: string; name?: string; avatar?: string };
type TeamOption = { slug: string; name: string };
type Permission = "admin" | "maintain" | "push" | "triage" | "read";
type SelectedTeam = { slug: string; name: string; permission: Permission };

// ======= UI bits (shared) =======





function Availability({ exists, checking, owner, name }: { exists: boolean | null; checking: boolean; owner?: string; name?: string }) {
    if (!owner || !name) return <p className="mt-1 text-[11px] text-slate-500">ตั้งชื่อรีโปเพื่อทำการตรวจสอบ</p>;
    if (checking) return <p className="mt-1 text-[11px] text-slate-500">กำลังตรวจสอบความซ้ำ…</p>;
    if (exists === true)
        return <p className="mt-1 text-[11px] text-rose-600">ชื่อ <b>{name}</b> มีอยู่แล้วใน <b>{owner}</b> เลือกชื่ออื่น</p>;
    if (exists === false)
        return <p className="mt-1 text-[11px] text-emerald-600">พร้อมใช้งาน ✓</p>;
    return <p className="mt-1 text-[11px] text-slate-500">ไม่สามารถตรวจสอบได้ชั่วคราว</p>;
}

// ======= Utils (shared) =======

function suggestRepoName(app: string) {
    if (!app) return "Helm-";
    // แปลงสเปซเป็นขีด, ตัดอักขระแปลก ๆ ออก (วางเครื่องหมาย '-' ไว้ท้ายคลาส)
    const cleaned = app
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^A-Za-z0-9_-]/g, "");
    return `Helm-${cleaned}`;
}
