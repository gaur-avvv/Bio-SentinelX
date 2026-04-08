import React from 'react';
import type { AlertSeverity, NormalizedApiError } from '../../services/surveillanceApiClient';

export const formatDateTime = (value?: string): string => {
    if (!value) return 'N/A';
    const asDate = new Date(value);
    if (Number.isNaN(asDate.getTime())) return value;
    return asDate.toLocaleString();
};

export const cn = (...classNames: Array<string | false | undefined>): string =>
    classNames.filter(Boolean).join(' ');

interface PanelProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export const Panel: React.FC<PanelProps> = ({ title, description, children, actions, className }) => {
    return (
        <section className={cn('sih-panel', className)} aria-label={title}>
            <header className="sih-panel-header">
                <div>
                    <h2 className="sih-panel-title">{title}</h2>
                    {description ? <p className="sih-panel-description">{description}</p> : null}
                </div>
                {actions ? <div className="sih-panel-actions">{actions}</div> : null}
            </header>
            <div className="sih-panel-content">{children}</div>
        </section>
    );
};

interface StatCardProps {
    label: string;
    value?: number | string;
    fallback?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, fallback = 'N/A' }) => {
    return (
        <article className="sih-stat-card" role="status" aria-live="polite">
            <span className="sih-stat-label">{label}</span>
            <strong className="sih-stat-value">{value ?? fallback}</strong>
        </article>
    );
};

interface ErrorBannerProps {
    error: NormalizedApiError | null;
    onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ error, onRetry }) => {
    if (!error) return null;

    return (
        <div className="sih-error" role="alert" aria-live="assertive">
            <div>
                <p className="sih-error-title">Request failed</p>
                <p className="sih-error-message">{error.message}</p>
                {error.requestId ? <p className="sih-error-meta">Request ID: {error.requestId}</p> : null}
            </div>
            {onRetry ? (
                <button type="button" className="sih-btn sih-btn-secondary" onClick={onRetry}>
                    Retry
                </button>
            ) : null}
        </div>
    );
};

interface EmptyStateProps {
    title: string;
    description: string;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
    return (
        <div className="sih-empty" role="status" aria-live="polite">
            <h3>{title}</h3>
            <p>{description}</p>
            {action ? <div className="sih-empty-action">{action}</div> : null}
        </div>
    );
};

interface SeverityBadgeProps {
    severity?: AlertSeverity;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
    const safeSeverity = severity || 'monitor';
    const colorClass =
        safeSeverity === 'state_escalation'
            ? 'severity-state'
            : safeSeverity === 'district_alert'
                ? 'severity-district'
                : 'severity-monitor';

    return <span className={cn('sih-severity-badge', colorClass)}>{safeSeverity}</span>;
};

interface Column<T> {
    key: string;
    label: string;
    render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
    columns: Array<Column<T>>;
    rows: T[];
    rowKey: (row: T) => string;
    onRowClick?: (row: T) => void;
    ariaLabel: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, ariaLabel }: DataTableProps<T>): React.ReactElement {
    return (
        <div className="sih-table-wrap">
            <table className="sih-table" aria-label={ariaLabel}>
                <thead>
                    <tr>
                        {columns.map(column => (
                            <th key={column.key}>{column.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const key = rowKey(row);
                        const clickable = !!onRowClick;
                        return (
                            <tr
                                key={key}
                                className={clickable ? 'sih-row-clickable' : ''}
                                onClick={() => onRowClick?.(row)}
                                onKeyDown={event => {
                                    if (!clickable) return;
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onRowClick?.(row);
                                    }
                                }}
                                tabIndex={clickable ? 0 : -1}
                            >
                                {columns.map(column => (
                                    <td key={column.key}>{column.render(row)}</td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

interface DrawerProps {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ open, title, onClose, children }) => {
    if (!open) return null;

    return (
        <div className="sih-drawer-overlay" role="presentation" onClick={onClose}>
            <aside
                className="sih-drawer"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={event => event.stopPropagation()}
            >
                <header className="sih-drawer-header">
                    <h3>{title}</h3>
                    <button type="button" onClick={onClose} className="sih-btn sih-btn-ghost" aria-label="Close detail panel">
                        Close
                    </button>
                </header>
                <div className="sih-drawer-content">{children}</div>
            </aside>
        </div>
    );
};
