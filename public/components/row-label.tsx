import React from "react";

export function RowLabel({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-6">
            <div className="text-slate-500">{label}</div>
            <div className="truncate text-right">{value}</div>
        </div>
    );
}