export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <header>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
        </header>
    );
}