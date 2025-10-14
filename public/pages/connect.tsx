import React, { useEffect, useMemo, useState } from "react";

/**
 * GitHub Connection Center (PAT only) — React + Tailwind
 * - แยกหน้าการเชื่อมต่อออกจาก flow สร้าง repo (ใช้ซ้ำได้หลายโปรเจกต์)
 * - ใช้เฉพาะ Personal Access Token (Classic/Fine-grained)
 * - มีรายการ Connections ที่บันทึกไว้, ตั้งค่า Default, ใช้งาน, Rotate, Revoke
 * - ไม่แสดง token ที่บันทึกแล้ว (mask) และสนับสนุนการทดสอบ scope ก่อนบันทึก
 *
 * Backend ที่คาดหวัง:
 *  - POST   /api/connections/test        { pat }            -> { ok, user:{login,name,avatar}, scopes:[...], tokenType:"classic|fine" }
 *  - POST   /api/connections             { alias, pat }     -> { id, user, createdAt, default:false }
 *  - GET    /api/connections                                 -> { items:[{id, alias, user, default, createdAt}], count }
 *  - PATCH  /api/connections/:id         { default?:bool, alias?:string }
 *  - PATCH  /api/connections/:id/rotate  { pat }
 *  - DELETE /api/connections/:id
 *
 * Security แนวทาง (ฝั่งเซิร์ฟเวอร์):
 *  - เก็บ PAT ใน vault/KMS เท่านั้น, แคชเฉพาะ metadata (login, scopes, updatedAt)
 *  - แสดง prefix 4 ตัวท้าย (เช่น ghp_****abcd)
 *  - Webhook/health-check ตรวจ token หมดอายุ แจ้งเตือนใน UI
 */

export default function GithubConnectionCenter() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ConnectionItem[]>([]);
  const [alias, setAlias] = useState("");
  const [pat, setPat] = useState("");
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatePat, setRotatePat] = useState("");

  const requiredScopes = useMemo(
    () => [
      { key: "read:org", label: "อ่านรายชื่อองค์กรและทีม (read:org)" },
      { key: "repo", label: "จัดการรีโป (repo)" },
      { key: "admin:org", label: "ตั้งสิทธิ์ทีม (admin:org)" },
    ],
    [],
  );

  useEffect(() => {
    // โหลด connections ที่บันทึกไว้
    (async () => {
      try {
        const res = await fetch("/api/connections");
        if (!res.ok) throw new Error("โหลดรายการการเชื่อมต่อไม่สำเร็จ");
        const data = (await res.json()) as { items: ConnectionItem[] };
        setItems(data.items || []);
      } catch (e: any) {
        setError(e.message ?? "เกิดข้อผิดพลาดขณะโหลดข้อมูล");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleTest() {
    setTesting(true);
    setError(null);
    setTestRes(null);
    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat }),
      });
      const data = (await res.json()) as TestResult;
      if (!res.ok || !data.ok) throw new Error(data.error || "ทดสอบไม่สำเร็จ");
      setTestRes(data);
    } catch (e: any) {
      setError(e.message ?? "ทดสอบไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: alias.trim(), pat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setItems((prev) => [data, ...prev]);
      setAlias("");
      setPat("");
      setTestRes(null);
    } catch (e: any) {
      setError(e.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id: string) {
    const prev = items;
    setItems((list) => list.map((x) => ({ ...x, default: x.id === id })));
    try {
      const res = await fetch(`/api/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: true }),
      });
      if (!res.ok) throw new Error("ตั้งค่า default ไม่สำเร็จ");
    } catch (e) {
      setItems(prev); // rollback
    }
  }

  async function revoke(id: string) {
    const prev = items;
    setItems((list) => list.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("ลบการเชื่อมต่อไม่สำเร็จ");
    } catch (e) {
      setItems(prev); // rollback
    }
  }

  async function rotate(id: string) {
    if (!rotatePat) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/connections/${id}/rotate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat: rotatePat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rotate ไม่สำเร็จ");
      setItems((list) =>
        list.map((x) =>
          x.id === id ? { ...x, updatedAt: data.updatedAt } : x,
        ),
      );
      setRotatingId(null);
      setRotatePat("");
    } catch (e: any) {
      setError(e.message ?? "Rotate ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold">GitHub Connections</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            จัดการ Personal Access Token เพื่อใช้ซ้ำในการสร้าง Helm repo
            หลายโปรเจกต์
          </p>
        </header>

        {/* Panels */}
        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          {/* LEFT: Create new connection */}
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-start gap-3">
                <GithubMark className="mt-1 h-8 w-8" />
                <div>
                  <h2 className="text-lg font-medium">
                    เพิ่มการเชื่อมต่อใหม่ (PAT เท่านั้น)
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    รองรับทั้ง Classic และ Fine-grained PAT
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <label className="block text-xs">ชื่อเรียก (Alias)</label>
                <input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="เช่น personal-main หรือ admin-token"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                />

                <label className="mt-3 block text-xs">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="เช่น ghp_xxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                />

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleTest}
                    disabled={!pat || testing}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900"
                  >
                    {testing ? "กำลังทดสอบ…" : "ทดสอบ Token"}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!alias.trim() || !testRes || saving}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    {saving ? "กำลังบันทึก…" : "บันทึกการเชื่อมต่อ"}
                  </button>
                </div>

                {testRes && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                    ✓ ทดสอบสำเร็จ — ผู้ใช้: <b>{testRes.user?.login}</b> (
                    {testRes.user?.name})
                    <div className="mt-2 text-xs">
                      ชนิด token: {testRes.tokenType}
                    </div>
                    <div className="mt-1 text-xs">
                      scopes ที่พบ: {testRes.scopes?.join(", ")}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <div className="mt-4">
                  <h3 className="text-xs font-medium">สโคปที่แนะนำ</h3>
                  <ul className="mt-2 space-y-1 text-xs">
                    {requiredScopes.map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                          ✓
                        </span>
                        <span>{s.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Fine-grained แนะนำให้เลือก Resource = Orgs/Repos
                    ที่ต้องใช้จริง เพื่อความปลอดภัย
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT: Saved connections list */}
          <section className="lg:col-span-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">
                  การเชื่อมต่อที่บันทึกไว้
                </h2>
                <a
                  href="#use-in-project"
                  className="text-sm underline decoration-dotted hover:text-slate-700 dark:hover:text-slate-300"
                >
                  วิธีนำไปใช้ในโปรเจกต์ →
                </a>
              </div>

              {loading ? (
                <div className="mt-6 animate-pulse text-sm text-slate-500">
                  กำลังโหลด…
                </div>
              ) : items.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <Th>Default</Th>
                        <Th>Alias</Th>
                        <Th>User</Th>
                        <Th>Updated</Th>
                        <Th className="text-right">Actions</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {items.map((c) => (
                        <tr
                          key={c.id}
                          className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                        >
                          <Td>
                            <button
                              onClick={() => setDefault(c.id)}
                              className={
                                "inline-flex h-7 items-center gap-2 rounded-full border px-3 text-xs " +
                                (c.default
                                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
                                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300")
                              }
                            >
                              {c.default ? "★ Default" : "Set default"}
                            </button>
                          </Td>
                          <Td>
                            <div className="flex flex-col">
                              <span className="font-medium">{c.alias}</span>
                              <span className="text-xs text-slate-500">
                                {maskPrefix(c.tokenPrefix)}
                              </span>
                            </div>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <img
                                src={c.user?.avatar}
                                className="h-6 w-6 rounded-full"
                              />
                              <div className="text-sm">
                                {c.user?.name}{" "}
                                <span className="text-slate-500">
                                  (@{c.user?.login})
                                </span>
                              </div>
                            </div>
                          </Td>
                          <Td>
                            <div className="text-sm">
                              {formatAgo(c.updatedAt || c.createdAt)}
                            </div>
                          </Td>
                          <Td className="text-right">
                            <div className="flex justify-end gap-2">
                              <a
                                href={`#/use?connection=${c.id}`}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                ใช้การเชื่อมต่อ
                              </a>
                              <button
                                onClick={() =>
                                  setRotatingId(
                                    rotatingId === c.id ? null : c.id,
                                  )
                                }
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                              >
                                Rotate
                              </button>
                              <button
                                onClick={() => revoke(c.id)}
                                className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/20"
                              >
                                Revoke
                              </button>
                            </div>
                            {rotatingId === c.id && (
                              <div className="mt-2 rounded-lg border border-slate-200 p-3 text-left dark:border-slate-800">
                                <label className="block text-xs">New PAT</label>
                                <input
                                  type="password"
                                  value={rotatePat}
                                  onChange={(e) => setRotatePat(e.target.value)}
                                  placeholder="เช่น ghp_xxxxxxxxxxxxxxxxxxxxx"
                                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800"
                                />
                                <div className="mt-2 flex gap-2">
                                  <button
                                    onClick={() => rotate(c.id)}
                                    disabled={!rotatePat}
                                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60 dark:bg-slate-200 dark:text-slate-900"
                                  >
                                    ยืนยัน Rotate
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRotatingId(null);
                                      setRotatePat("");
                                    }}
                                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                  >
                                    ยกเลิก
                                  </button>
                                </div>
                              </div>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                id="use-in-project"
                className="mt-6 rounded-xl border border-slate-200 p-4 text-xs dark:border-slate-800"
              >
                <p className="font-medium">การนำไปใช้ในโปรเจกต์</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>ตั้งค่า Default connection ที่ต้องการใช้เป็นประจำ</li>
                  <li>
                    หน้าสร้าง Helm repo จะเลือก Default ให้อัตโนมัติ พร้อมปุ่ม
                    "เปลี่ยนการเชื่อมต่อ" เพื่อสลับไปยังตัวอื่น
                  </li>
                  <li>
                    เมื่อ Token หมดอายุ ระบบจะแจ้งเตือนและขอ Rotate
                    เฉพาะที่ศูนย์รวมนี้ ไม่รบกวน flow การสร้าง repo
                  </li>
                </ol>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ========== Helpers & Components ==========

type ConnectionItem = {
  id: string;
  alias: string;
  default?: boolean;
  user?: { login: string; name?: string; avatar?: string };
  tokenPrefix?: string; // แสดงบางส่วน เช่น ghp_****abcd
  createdAt: string;
  updatedAt?: string;
};

type TestResult = {
  ok: boolean;
  user?: { login: string; name?: string; avatar?: string };
  scopes?: string[];
  tokenType?: "classic" | "fine";
  error?: string;
};

function EmptyState() {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
      ยังไม่มีการเชื่อมต่อที่บันทึกไว้ — เพิ่มการเชื่อมต่อใหม่ทางด้านซ้าย
      แล้วบันทึกเพื่อใช้ซ้ำในหลายโปรเจกต์
    </div>
  );
}

function Th({ children, className = "" }: any) {
  return (
    <th
      className={
        "px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 " +
        className
      }
    >
      {children}
    </th>
  );
}
function Td({ children, className = "" }: any) {
  return <td className={"px-4 py-3 text-sm " + className}>{children}</td>;
}

function GithubMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function maskPrefix(prefix?: string) {
  if (!prefix) return "–";
  if (prefix.length <= 4) return "****" + prefix;
  return "****" + prefix.slice(-4);
}

function formatAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
