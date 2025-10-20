import React from "react";

export function Label({ children }: { children: React.ReactNode }) {
    return <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{children}</label>;
}