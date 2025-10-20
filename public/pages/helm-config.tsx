import React, { useEffect, useMemo, useState } from "react";
import {Divider} from "@public/components/divider";

/**
 * Variables Page — React + Tailwind (Page 3)
 * - ดึงรายการตัวแปร ${VAR} จาก template (เช่น https://github.com/maohnnn/Helm-Template-Normal-App.git)
 * - สร้างฟอร์มอัตโนมัติสำหรับกรอกค่าแทนที่ใน Chart.yaml และ values.yaml
 * - รองรับ import ค่าจาก JSON / .env, และมี Preview (dry-run render) ทางขวา
 * - เมื่อกด Next จะบันทึกค่าลง wizard แล้วไปหน้า Review
 *
 * Backend ที่คาดหวัง:
 *  GET  /api/wizard/config                      -> { connectionId, owner, repoName, appName, template }
 *  GET  /api/template/variables?repo=&connection= -> { vars:[ { key, files:["values.yaml","Chart.yaml"], type?, required? } ] }
 *  POST /api/template/render (dry-run)           -> { ok, previews:{ valuesYaml?:string, chartYaml?:string }, warnings?:string[] }
 *  POST /api/wizard/config                       -> (บันทึก variables)
 */
export function HelmConfig() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [connectionId, setConnectionId] = useState<string>("");
    const [owner, setOwner] = useState<string>("");
    const [repoName, setRepoName] = useState<string>("");
    const [appName, setAppName] = useState<string>("");
    const [template, setTemplate] = useState<string>("https://github.com/maohnnn/Helm-Template-Normal-App.git");

    const [defs, setDefs] = useState<VarDef[]>([]);
    const [values, setValues] = useState<Record<string, any>>({});

    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState<RenderPreview | null>(null);

    // ===== Load wizard config & variables =====
    useEffect(() => {
        (async () => {
            try {
                const conf: any = await fetch("/api/wizard/config").then((r) => r.ok ? r.json() : {});
                setConnectionId(conf.connectionId || "");
                setOwner(conf.owner || "");
                setRepoName(conf.repoName || "");
                setAppName(conf.appName || "");
                setTemplate(conf.template || template);

                const res = await fetch(`/api/template/variables?repo=${encodeURIComponent(conf.template || template)}&connection=${encodeURIComponent(conf.connectionId || "")}`);
                const data = await res.json();
                const incoming: VarDef[] = (data?.vars || []).map((v: any) => normalizeDef(v));
                // Prefill suggestions
                const prefills = buildSuggestions(incoming, {
                    owner: conf.owner,
                    repoName: conf.repoName,
                    appName: conf.appName,
                });
                setDefs(incoming);
                setValues(prefills);
            } catch (e: any) {
                setError(e.message ?? "โหลด variables ไม่สำเร็จ");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ===== Actions =====
    function setValue(key: string, val: any) {
        setValues((prev) => ({ ...prev, [key]: castType(val, defs.find((d) => d.key === key)?.type) }));
    }

    async function handlePreview() {
        setPreviewing(true);
        setError(null);
        try {
            const res = await fetch("/api/template/render", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo: template, connection: connectionId, variables: values, dryRun: true }),
            });
            const data = (await res.json()) as RenderPreview;
            if (!res.ok || data.ok === false) throw new Error((data as any).error || "Preview ล้มเหลว");
            setPreview(data);
        } catch (e: any) {
            setError(e.message ?? "Preview ล้มเหลว");
        } finally {
            setPreviewing(false);
        }
    }

    async function handleImportJson() {
        const raw = prompt("วาง JSON mapping ของ variables", JSON.stringify(values, null, 2));
        if (!raw) return;
        try {
            const j = JSON.parse(raw);
            setValues((prev) => ({ ...prev, ...j }));
        } catch (e) {
            alert("รูปแบบ JSON ไม่ถูกต้อง");
        }
    }

    async function handleImportEnv() {
        const raw = prompt("วางเนื้อหาไฟล์ .env (KEY=VALUE)\nบรรทัดที่ไม่ถูกต้องจะถูกข้าม");
        if (!raw) return;
        const map = parseEnv(raw);
        setValues((prev) => ({ ...prev, ...map }));
    }

    async function handleNext() {
        setSaving(true);
        setError(null);
        try {
            // Basic front validation
            const missing = defs.filter((d) => d.required && (values[d.key] === undefined || values[d.key] === ""));
            if (missing.length) {
                setError(`กรอกค่าที่จำเป็นไม่ครบ: ${missing.map((m) => m.key).join(", ")}`);
                setSaving(false);
                return;
            }
            await fetch("/api/wizard/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ variables: values }),
            });
            window.location.hash = "#/review";
        } catch (e: any) {
            setError(e.message ?? "บันทึกไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
            <div className="mx-auto max-w-6xl px-4 py-10">
                <h1 title="Variables" />
                <span>กรอกค่าที่จะใช้แทน ใน values.yaml และ Chart.yaml</span>

                {loading ? (
                    <div className="mt-8 animate-pulse text-sm text-slate-500">กำลังโหลดตัวแปร…</div>
                ) : (
                    <div className="mt-8 grid gap-6 lg:grid-cols-5">
                        {/* LEFT: Variables Form */}
                        <section className="lg:col-span-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm text-slate-500">Template</div>
                                        <div className="text-sm font-medium break-all">{template}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleImportJson} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Import JSON</button>
                                        <button onClick={handleImportEnv} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Import .env</button>
                                    </div>
                                </div>

                                <Divider />

                                {defs.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                                        ไม่พบตัวแปรรูปแบบ ${"{VAR}"} ในไฟล์ที่รองรับ
                                    </div>
                                ) : (
                                    <ul className="space-y-3">
                                        {defs.map((d) => (
                                            <li key={d.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">{d.key} {d.required && <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">required</span>}</div>
                                                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{d.files?.join(", ")}</div>
                                                    </div>
                                                    <select
                                                        value={d.type}
                                                        onChange={(e) => setDefs((prev) => prev.map((x) => (x.key === d.key ? { ...x, type: e.target.value as VarType } : x)))}
                                                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                                                    >
                                                        <option value="string">string</option>
                                                        <option value="number">number</option>
                                                        <option value="boolean">boolean</option>
                                                    </select>
                                                </div>
                                                <div className="mt-2 grid gap-2 md:grid-cols-5">
                                                    <div className="md:col-span-3">
                                                        {d.type === "boolean" ? (
                                                            <label className="inline-flex items-center gap-2 text-sm">
                                                                <input type="checkbox" checked={!!values[d.key]} onChange={(e) => setValue(d.key, e.target.checked)} />
                                                                <span>เปิดใช้งาน</span>
                                                            </label>
                                                        ) : (
                                                            <input
                                                                value={values[d.key] ?? ""}
                                                                onChange={(e) => setValue(d.key, e.target.value)}
                                                                placeholder={d.placeholder || d.example || suggestPlaceholder(d.key, { owner, repoName, appName })}
                                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <input
                                                            value={d.description || ""}
                                                            onChange={(e) => setDefs((prev) => prev.map((x) => (x.key === d.key ? { ...x, description: e.target.value } : x)))}
                                                            placeholder="คำอธิบาย (optional)"
                                                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                                        />
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {error && (
                                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">{error}</div>
                                )}

                                <div className="mt-6 flex items-center justify-between">
                                    <a href="#/configure" className="text-sm underline decoration-dotted">← ย้อนกลับ: Configure</a>
                                    <div className="flex items-center gap-2">
                                        <button onClick={handlePreview} disabled={previewing} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{previewing ? "กำลัง Preview…" : "Preview"}</button>
                                        <button onClick={handleNext} disabled={saving} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900">{saving ? "กำลังบันทึก…" : "ถัดไป: Review"}</button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* RIGHT: Preview */}
                        <aside className="lg:col-span-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                <h3 className="text-sm font-medium">Preview (dry-run)</h3>
                                {!preview ? (
                                    <p className="mt-3 text-sm text-slate-500">กดปุ่ม Preview เพื่อดูผลลัพธ์หลังแทนค่าลงในไฟล์</p>
                                ) : (
                                    <div className="mt-3 space-y-4">
                                        {preview.previews?.chartYaml && (
                                            <div>
                                                <div className="text-xs font-medium text-slate-500">Chart.yaml</div>
                                                <pre className="mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">{preview.previews.chartYaml}</pre>
                                            </div>
                                        )}
                                        {preview.previews?.valuesYaml && (
                                            <div>
                                                <div className="text-xs font-medium text-slate-500">values.yaml</div>
                                                <pre className="mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">{preview.previews.valuesYaml}</pre>
                                            </div>
                                        )}
                                        {preview.warnings?.length ? (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                                                <div className="font-medium">Warnings</div>
                                                <ul className="mt-1 list-disc pl-5">
                                                    {preview.warnings.map((w, i) => (
                                                        <li key={i}>{w}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            {/* Tips */}
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                <div className="font-medium">ตัวอย่างค่าอัตโนมัติ</div>
                                <ul className="mt-1 list-disc pl-5">
                                    <li><code>APP_NAME</code> → {appName || "(ชื่อแอป)"}</li>
                                    <li><code>IMAGE</code> → ghcr.io/{owner || "owner"}/{appName || "app"}:latest</li>
                                    <li><code>NAMESPACE</code> → {appName || "app"}</li>
                                    <li><code>REPLICAS</code> → 1</li>
                                </ul>
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </div>
    );
}

// ===== Types =====

type VarType = "string" | "number" | "boolean";

type VarDef = {
    key: string;
    files?: string[]; // files ที่พบตัวแปร เช่น ["values.yaml", "Chart.yaml"]
    type?: VarType;
    required?: boolean;
    description?: string;
    placeholder?: string;
    example?: string;
};

type RenderPreview = {
    ok?: boolean;
    previews?: { valuesYaml?: string; chartYaml?: string };
    warnings?: string[];
};

// ===== Utils =====

function normalizeDef(v: any): VarDef {
    const key = String(v.key || "").toUpperCase();
    const def: VarDef = {
        key,
        files: v.files || [],
        type: v.type || guessType(key),
        required: v.required ?? guessRequired(key),
        description: v.description,
        placeholder: v.placeholder,
        example: v.example,
    };
    return def;
}

function guessType(key: string): VarType {
    if (/^(ENABLED|DEBUG|TLS|USE_.*)$/.test(key)) return "boolean";
    if (/^(PORT|REPLICAS|CPU_LIMIT|MEM_LIMIT|TIMEOUT|INTERVAL)$/.test(key)) return "number";
    return "string";
}

function guessRequired(key: string): boolean {
    return /^(APP_NAME|IMAGE|NAMESPACE)$/.test(key);
}

function buildSuggestions(defs: VarDef[], ctx: { owner?: string; repoName?: string; appName?: string }) {
    const map: Record<string, any> = {};
    const app = (ctx.appName || "").toLowerCase();
    const owner = ctx.owner || "";
    for (const d of defs) {
        const k = d.key.toUpperCase();
        if (k === "APP_NAME") map[k] = ctx.appName || "";
        if (k === "IMAGE") map[k] = owner && app ? `ghcr.io/${owner}/${app}:latest` : "";
        if (k === "NAMESPACE") map[k] = app || "default";
        if (k === "REPLICAS") map[k] = 1;
    }
    return map;
}

function castType(val: any, type?: VarType) {
    if (type === "number") return Number(val);
    if (type === "boolean") return Boolean(val);
    return val;
}

function suggestPlaceholder(key: string, ctx: { owner?: string; repoName?: string; appName?: string }) {
    const k = key.toUpperCase();
    if (k === "IMAGE") return `ghcr.io/${ctx.owner || "owner"}/${(ctx.appName || "app").toLowerCase()}:tag`;
    if (k === "NAMESPACE") return (ctx.appName || "app").toLowerCase();
    if (k === "APP_NAME") return ctx.appName || "my-app";
    if (k === "REPLICAS") return "1";
    return "";
}

function parseEnv(raw: string) {
    const map: Record<string, string> = {};
    raw.split(/\r?\n/).forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return;
        const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) return;
        const key = m[1];
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        map[key] = val;
    });
    return map;
}
