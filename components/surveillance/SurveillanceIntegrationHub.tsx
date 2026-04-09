import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    surveillanceApiClient,
    type AlertSeverity,
    type CaseIntakePayload,
    type NormalizedApiError,
    type OverviewStatsResponse,
    type PipelineIngestBatchResponse,
    type PipelineIngestResponse,
    type RecordsQuery,
    type SurveillanceAlert,
    type SurveillanceRecord,
} from '../../services/surveillanceApiClient';
import { useDebouncedValue } from './hooks';
import {
    DataTable,
    Drawer,
    EmptyState,
    ErrorBanner,
    Panel,
    SeverityBadge,
    StatCard,
    formatDateTime,
} from './ui';
import './surveillance.css';

type CaseErrors = Partial<Record<keyof CaseIntakePayload, string>>;

interface BatchRow extends CaseIntakePayload {
    id: string;
}

interface SurveillanceIntegrationHubProps {
    mode?: 'full' | 'intake' | 'monitor';
    embedded?: boolean;
    prefillState?: string;
    prefillDistrict?: string;
}

const DEFAULT_LIMIT = 10;
const EMPTY_CASE: CaseIntakePayload = {
    text: '',
    state: '',
    district: '',
};

function parsePositiveInt(value: string | null, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function readSearchParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        state: params.get('state') || '',
        district: params.get('district') || '',
        syndrome: params.get('syndrome') || '',
        recordsOffset: parsePositiveInt(params.get('recordsOffset'), 0),
        alertsSeverity: (params.get('alertsSeverity') as AlertSeverity | null) || '',
        alertsOffset: parsePositiveInt(params.get('alertsOffset'), 0),
        limit: parsePositiveInt(params.get('limit'), DEFAULT_LIMIT),
    };
}

function writeSearchParams(next: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(next).forEach(([key, value]) => {
        if (value === undefined || value === '') {
            params.delete(key);
            return;
        }
        params.set(key, String(value));
    });
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function validateCase(payload: CaseIntakePayload): CaseErrors {
    const errors: CaseErrors = {};
    if (!payload.text.trim()) errors.text = 'Event text is required.';
    if (!payload.state.trim()) errors.state = 'State is required.';
    if (!payload.district.trim()) errors.district = 'District is required.';
    if (payload.text.trim().length > 2000) errors.text = 'Text should be under 2000 characters.';
    return errors;
}

function createBatchRow(): BatchRow {
    return {
        id: `row-${Math.random().toString(36).slice(2, 10)}`,
        text: '',
        state: '',
        district: '',
    };
}

function toTitleCaseKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function toPlainTextLines(value: unknown): string[] {
    if (value === null || value === undefined) return ['N/A'];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return ['None'];
        return value.map(item => {
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return `- ${item}`;
            if (item && typeof item === 'object') {
                const parts = Object.entries(item as Record<string, unknown>)
                    .map(([k, v]) => `${toTitleCaseKey(k)}: ${String(v ?? 'N/A')}`)
                    .join(' | ');
                return `- ${parts}`;
            }
            return `- ${String(item)}`;
        });
    }

    const obj = value as Record<string, unknown>;
    return Object.keys(obj).length > 0
        ? Object.entries(obj).map(([k, v]) => `${toTitleCaseKey(k)}: ${String(v ?? 'N/A')}`)
        : ['N/A'];
}

export const SurveillanceIntegrationHub: React.FC<SurveillanceIntegrationHubProps> = ({
    mode = 'full',
    embedded = false,
    prefillState,
    prefillDistrict,
}) => {
    const queryClient = useQueryClient();
    const params = useMemo(() => readSearchParams(), []);

    const [mockMode, setMockMode] = useState<boolean>(() => localStorage.getItem('sih_mock_mode') === 'true');
    const [casePayload, setCasePayload] = useState<CaseIntakePayload>(EMPTY_CASE);
    const [caseErrors, setCaseErrors] = useState<CaseErrors>({});
    const [caseResult, setCaseResult] = useState<PipelineIngestResponse | null>(null);

    const [batchRows, setBatchRows] = useState<BatchRow[]>([createBatchRow(), createBatchRow()]);
    const [batchError, setBatchError] = useState<string>('');
    const [batchResult, setBatchResult] = useState<PipelineIngestBatchResponse | null>(null);

    const [alertsSeverity, setAlertsSeverity] = useState<AlertSeverity | ''>(params.alertsSeverity);
    const [alertsOffset, setAlertsOffset] = useState<number>(params.alertsOffset);
    const [recordsOffset, setRecordsOffset] = useState<number>(params.recordsOffset);
    const [limit, setLimit] = useState<number>(params.limit || DEFAULT_LIMIT);

    const [stateFilter, setStateFilter] = useState(params.state);
    const [districtFilter, setDistrictFilter] = useState(params.district);
    const [syndromeFilter, setSyndromeFilter] = useState(params.syndrome);

    const debouncedState = useDebouncedValue(stateFilter, 350);
    const debouncedDistrict = useDebouncedValue(districtFilter, 350);
    const debouncedSyndrome = useDebouncedValue(syndromeFilter, 350);

    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

    const recordFilters: RecordsQuery = useMemo(
        () => ({
            state: debouncedState,
            district: debouncedDistrict,
            syndrome: debouncedSyndrome,
            limit,
            offset: recordsOffset,
        }),
        [debouncedDistrict, debouncedState, debouncedSyndrome, limit, recordsOffset],
    );

    React.useEffect(() => {
        writeSearchParams({
            state: debouncedState,
            district: debouncedDistrict,
            syndrome: debouncedSyndrome,
            recordsOffset,
            alertsSeverity,
            alertsOffset,
            limit,
        });
    }, [alertsOffset, alertsSeverity, debouncedDistrict, debouncedState, debouncedSyndrome, limit, recordsOffset]);

    React.useEffect(() => {
        localStorage.setItem('sih_mock_mode', String(mockMode));
    }, [mockMode]);

    React.useEffect(() => {
        // Clear stale responses when switching live/demo mode.
        setCaseResult(null);
        setBatchResult(null);
        setBatchError('');
        setSelectedRecordId(null);
    }, [mockMode]);

    React.useEffect(() => {
        const fallbackDistrict = prefillDistrict || localStorage.getItem('biosentinel_location') || '';
        const fallbackState = prefillState || '';

        if (fallbackDistrict || fallbackState) {
            setCasePayload(prev => ({
                ...prev,
                state: prev.state || fallbackState,
                district: prev.district || fallbackDistrict,
            }));

            setStateFilter(prev => prev || fallbackState);
            setDistrictFilter(prev => prev || fallbackDistrict);

            setBatchRows(prev => prev.map(row => ({
                ...row,
                state: row.state || fallbackState,
                district: row.district || fallbackDistrict,
            })));
        }
    }, [prefillDistrict, prefillState]);

    const healthQuery = useQuery({
        queryKey: ['surveillance', 'health', mockMode],
        queryFn: () => surveillanceApiClient.health(mockMode),
        retry: 1,
    });

    const overviewQuery = useQuery({
        queryKey: ['surveillance', 'overview', mockMode],
        queryFn: () => surveillanceApiClient.overview(mockMode),
    });

    const alertsQuery = useQuery({
        queryKey: ['surveillance', 'alerts', alertsSeverity, alertsOffset, limit, mockMode],
        queryFn: () =>
            surveillanceApiClient.alerts(
                {
                    severity: alertsSeverity || undefined,
                    limit,
                    offset: alertsOffset,
                },
                mockMode,
            ),
    });

    const recordsQuery = useQuery({
        queryKey: ['surveillance', 'records', recordFilters, mockMode],
        queryFn: () => surveillanceApiClient.records(recordFilters, mockMode),
    });

    const recordDetailQuery = useQuery({
        queryKey: ['surveillance', 'record-detail', selectedRecordId, mockMode],
        queryFn: () => surveillanceApiClient.recordById(selectedRecordId || '', mockMode),
        enabled: !!selectedRecordId,
    });

    const ingestMutation = useMutation({
        mutationFn: (payload: CaseIntakePayload) => surveillanceApiClient.ingest(payload, mockMode),
        onSuccess: response => {
            setCaseResult(response.data);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'overview'] }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'alerts'] }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'records'] }).catch(() => undefined);
        },
    });

    const batchMutation = useMutation({
        mutationFn: (events: CaseIntakePayload[]) => surveillanceApiClient.ingestBatch({ events }, mockMode),
        onSuccess: response => {
            setBatchResult(response.data);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'overview'] }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'alerts'] }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ['surveillance', 'records'] }).catch(() => undefined);
        },
    });

    const normalizedCaseError = ingestMutation.error
        ? surveillanceApiClient.normalizeError(ingestMutation.error)
        : null;
    const normalizedBatchError = batchMutation.error
        ? surveillanceApiClient.normalizeError(batchMutation.error)
        : null;

    const addBatchRow = () => setBatchRows(prev => [...prev, createBatchRow()]);
    const removeBatchRow = (id: string) => setBatchRows(prev => (prev.length > 1 ? prev.filter(row => row.id !== id) : prev));

    const updateBatchRow = (id: string, field: keyof CaseIntakePayload, value: string) => {
        setBatchRows(prev => prev.map(row => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const submitCase = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const errors = validateCase(casePayload);
        setCaseErrors(errors);
        if (Object.keys(errors).length > 0) return;
        ingestMutation.mutate(casePayload);
    };

    const submitBatch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const validRows = batchRows
            .map(row => ({ text: row.text.trim(), state: row.state.trim(), district: row.district.trim() }))
            .filter(row => row.text && row.state && row.district);

        if (validRows.length === 0) {
            setBatchError('Add at least one valid row with text, state, and district.');
            return;
        }

        setBatchError('');
        batchMutation.mutate(validRows);
    };

    const overview = overviewQuery.data?.data || ({} as OverviewStatsResponse);
    const alerts = alertsQuery.data?.data || [];
    const pagedRecords = recordsQuery.data?.data || { records: [], total: 0 };
    const showIntake = mode === 'full' || mode === 'intake';
    const showMonitor = mode === 'full' || mode === 'monitor';
    const showLiveError = !mockMode && healthQuery.isError;

    const panelTitles = {
        case: embedded ? 'Case Intake' : '1) Case Intake Panel',
        batch: embedded ? 'Batch Intake' : '2) Batch Intake Panel',
        overview: embedded ? 'Overview' : '3) Overview Stats',
        alerts: embedded ? 'Alerts Feed' : '4) Alerts Feed',
        records: embedded ? 'Records Explorer' : '5) Records Explorer',
    };

    return (
        <div className={`sih-page ${embedded ? 'sih-page-embedded' : ''}`} aria-label="Surveillance Integration Hub">
            <header className="sih-topbar">
                <div>
                    <h1>{embedded ? 'Surveillance Workspace' : 'Surveillance Hub'}</h1>
                    <p>Simple disease tracking with intake, alerts, and records.</p>
                    <p className="sih-subhelp">
                        {showIntake && showMonitor
                            ? 'Submit cases, review alerts, then open record details.'
                            : showIntake
                                ? 'Submit single or batch reports.'
                                : 'Monitor trends, alerts, and records.'}
                    </p>
                </div>
                <div className="sih-topbar-actions">
                    <span className={`sih-health-pill ${healthQuery.isError ? 'is-error' : healthQuery.isSuccess ? 'is-success' : ''}`}>
                        {healthQuery.isLoading ? 'Checking connection...' : healthQuery.isError ? 'Backend unavailable' : 'Backend connected'}
                    </span>
                    {showLiveError ? (
                        <button
                            type="button"
                            className="sih-btn sih-btn-secondary"
                            onClick={() => setMockMode(true)}
                        >
                            Use demo data
                        </button>
                    ) : null}
                    {mockMode ? (
                        <button
                            type="button"
                            className="sih-btn sih-btn-ghost"
                            onClick={() => setMockMode(false)}
                        >
                            Back to live
                        </button>
                    ) : null}
                </div>
            </header>

            {showLiveError ? (
                <div className="sih-help-strip" role="note" aria-live="polite">
                    Live surveillance API is unreachable right now. Check API URL/network or continue with demo data.
                </div>
            ) : null}

            {showIntake ? (
                <Panel
                    title={panelTitles.case}
                    description="Add one event report."
                >
                    <form onSubmit={submitCase} className="sih-form-grid" noValidate>
                        <label htmlFor="case-text">
                            Event text
                            <textarea
                                id="case-text"
                                value={casePayload.text}
                                onChange={event => setCasePayload(prev => ({ ...prev, text: event.target.value }))}
                                placeholder="Example: 12 patients with fever and cough from one school block in the last 2 days"
                                aria-invalid={!!caseErrors.text}
                                aria-describedby={caseErrors.text ? 'case-text-error' : undefined}
                            />
                            {caseErrors.text ? (
                                <span id="case-text-error" className="sih-inline-error">
                                    {caseErrors.text}
                                </span>
                            ) : null}
                        </label>

                        <label htmlFor="case-state">
                            State
                            <input
                                id="case-state"
                                value={casePayload.state}
                                onChange={event => setCasePayload(prev => ({ ...prev, state: event.target.value }))}
                                placeholder="Example: Maharashtra"
                                aria-invalid={!!caseErrors.state}
                                aria-describedby={caseErrors.state ? 'case-state-error' : undefined}
                            />
                            {caseErrors.state ? (
                                <span id="case-state-error" className="sih-inline-error">
                                    {caseErrors.state}
                                </span>
                            ) : null}
                        </label>

                        <label htmlFor="case-district">
                            District
                            <input
                                id="case-district"
                                value={casePayload.district}
                                onChange={event => setCasePayload(prev => ({ ...prev, district: event.target.value }))}
                                placeholder="Example: Pune"
                                aria-invalid={!!caseErrors.district}
                                aria-describedby={caseErrors.district ? 'case-district-error' : undefined}
                            />
                            {caseErrors.district ? (
                                <span id="case-district-error" className="sih-inline-error">
                                    {caseErrors.district}
                                </span>
                            ) : null}
                        </label>

                        <div className="sih-actions-row">
                            <button className="sih-btn sih-btn-primary" type="submit" disabled={ingestMutation.isPending}>
                                {ingestMutation.isPending ? 'Submitting...' : 'Submit Event'}
                            </button>
                            <button
                                className="sih-btn sih-btn-secondary"
                                type="button"
                                onClick={() => {
                                    setCasePayload(EMPTY_CASE);
                                    setCaseErrors({});
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </form>

                    <ErrorBanner
                        error={normalizedCaseError}
                        onRetry={() => {
                            const errors = validateCase(casePayload);
                            if (Object.keys(errors).length === 0) ingestMutation.mutate(casePayload);
                        }}
                    />

                    {ingestMutation.isPending ? <div className="sih-loading">Submitting event...</div> : null}

                    {caseResult ? (
                        <div className="sih-structured-result" role="status" aria-live="polite">
                            <section>
                                <h3>Record</h3>
                                <div className="sih-plain-text-block">
                                    {toPlainTextLines(caseResult.record).map((line, idx) => (
                                        <p key={`record-line-${idx}`}>{line}</p>
                                    ))}
                                </div>
                            </section>
                            <section>
                                <h3>Summary</h3>
                                <div className="sih-plain-text-block">
                                    {toPlainTextLines(caseResult.summary).map((line, idx) => (
                                        <p key={`summary-line-${idx}`}>{line}</p>
                                    ))}
                                </div>
                            </section>
                            <section>
                                <h3>Alert</h3>
                                <div className="sih-plain-text-block">
                                    {toPlainTextLines(caseResult.alert).map((line, idx) => (
                                        <p key={`alert-line-${idx}`}>{line}</p>
                                    ))}
                                </div>
                            </section>
                            {caseResult.fhir ? (
                                <section>
                                    <h3>FHIR</h3>
                                    <div className="sih-plain-text-block">
                                        {toPlainTextLines(caseResult.fhir).map((line, idx) => (
                                            <p key={`fhir-line-${idx}`}>{line}</p>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    ) : (
                        <EmptyState
                            title="No case response yet"
                            description="Submit one event to see structured record, summary, alert, and optional FHIR payload."
                        />
                    )}
                </Panel>
            ) : null}

            {showIntake ? (
                <Panel
                    title={panelTitles.batch}
                    description="Add multiple events together."
                    actions={
                        <button type="button" className="sih-btn sih-btn-secondary" onClick={addBatchRow}>
                            Add row
                        </button>
                    }
                >
                    <form onSubmit={submitBatch} className="sih-batch-form" noValidate>
                        {batchRows.map((row, index) => (
                            <div className="sih-batch-row" key={row.id}>
                                <label htmlFor={`batch-text-${row.id}`}>
                                    Text #{index + 1}
                                    <input
                                        id={`batch-text-${row.id}`}
                                        value={row.text}
                                        onChange={event => updateBatchRow(row.id, 'text', event.target.value)}
                                        placeholder="Short event description"
                                    />
                                </label>
                                <label htmlFor={`batch-state-${row.id}`}>
                                    State
                                    <input
                                        id={`batch-state-${row.id}`}
                                        value={row.state}
                                        onChange={event => updateBatchRow(row.id, 'state', event.target.value)}
                                        placeholder="State"
                                    />
                                </label>
                                <label htmlFor={`batch-district-${row.id}`}>
                                    District
                                    <input
                                        id={`batch-district-${row.id}`}
                                        value={row.district}
                                        onChange={event => updateBatchRow(row.id, 'district', event.target.value)}
                                        placeholder="District"
                                    />
                                </label>
                                <button type="button" className="sih-btn sih-btn-ghost" onClick={() => removeBatchRow(row.id)}>
                                    Remove
                                </button>
                            </div>
                        ))}

                        <div className="sih-actions-row">
                            <button type="submit" className="sih-btn sih-btn-primary" disabled={batchMutation.isPending}>
                                {batchMutation.isPending ? 'Submitting batch...' : 'Submit Batch'}
                            </button>
                        </div>
                    </form>

                    {batchError ? <p className="sih-inline-error">{batchError}</p> : null}
                    <ErrorBanner
                        error={normalizedBatchError}
                        onRetry={() => {
                            const validRows = batchRows
                                .map(row => ({ text: row.text.trim(), state: row.state.trim(), district: row.district.trim() }))
                                .filter(row => row.text && row.state && row.district);
                            if (validRows.length > 0) batchMutation.mutate(validRows);
                        }}
                    />

                    {batchMutation.isPending ? <div className="sih-loading">Submitting batch...</div> : null}

                    {batchResult ? (
                        <div className="sih-structured-result" role="status" aria-live="polite">
                            <section>
                                <h3>Aggregate summary</h3>
                                <div className="sih-plain-text-block">
                                    {toPlainTextLines(batchResult.summary).map((line, idx) => (
                                        <p key={`batch-summary-line-${idx}`}>{line}</p>
                                    ))}
                                </div>
                            </section>
                            <section>
                                <h3>Generated alerts</h3>
                                <div className="sih-plain-text-block">
                                    {toPlainTextLines(batchResult.alerts).map((line, idx) => (
                                        <p key={`batch-alerts-line-${idx}`}>{line}</p>
                                    ))}
                                </div>
                            </section>
                        </div>
                    ) : (
                        <EmptyState
                            title="No batch response yet"
                            description="Add rows and submit to see aggregate summary and generated alerts."
                        />
                    )}
                </Panel>
            ) : null}

            {showMonitor ? (
                <Panel title={panelTitles.overview} description="Snapshot of records and syndromes.">
                    {overviewQuery.isPending ? <div className="sih-loading">Loading overview...</div> : null}
                    {overviewQuery.isError ? (
                        <ErrorBanner
                            error={surveillanceApiClient.normalizeError(overviewQuery.error as NormalizedApiError)}
                            onRetry={() => overviewQuery.refetch()}
                        />
                    ) : null}

                    {!overviewQuery.isPending && !overviewQuery.isError ? (
                        <div className="sih-stats-grid">
                            <StatCard label="Total records" value={overview.total_records} />
                            <StatCard label="Records last 24h" value={overview.records_last_24h} />
                            <StatCard label="Total alerts" value={overview.total_alerts} />
                            <article className="sih-stat-card">
                                <span className="sih-stat-label">Top syndromes</span>
                                <div className="sih-chip-wrap">
                                    {(overview.top_syndromes || []).length > 0 ? (
                                        (overview.top_syndromes || []).map(syndrome => (
                                            <span key={syndrome} className="sih-chip">
                                                {syndrome}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="sih-chip">No data</span>
                                    )}
                                </div>
                            </article>
                        </div>
                    ) : null}
                </Panel>
            ) : null}

            {showMonitor ? (
                <Panel title={panelTitles.alerts} description="Live alert stream.">
                    <div className="sih-filter-row">
                        <label htmlFor="alerts-severity">
                            Severity
                            <select
                                id="alerts-severity"
                                value={alertsSeverity}
                                onChange={event => {
                                    setAlertsOffset(0);
                                    setAlertsSeverity(event.target.value as AlertSeverity | '');
                                }}
                            >
                                <option value="">All severities</option>
                                <option value="monitor">monitor</option>
                                <option value="district_alert">district_alert</option>
                                <option value="state_escalation">state_escalation</option>
                            </select>
                        </label>
                        <label htmlFor="alerts-limit">
                            Limit
                            <input
                                id="alerts-limit"
                                type="number"
                                min={1}
                                max={100}
                                value={limit}
                                onChange={event => {
                                    const next = Math.max(1, Math.min(100, Number(event.target.value) || DEFAULT_LIMIT));
                                    setLimit(next);
                                    setAlertsOffset(0);
                                    setRecordsOffset(0);
                                }}
                            />
                        </label>
                    </div>

                    <div className="sih-help-strip" role="note" aria-live="polite">
                        Severity meaning: <strong>monitor</strong> = observe trend, <strong>district_alert</strong> = district response needed,
                        <strong> state_escalation</strong> = escalate to state-level action.
                    </div>

                    {alertsQuery.isPending ? <div className="sih-loading">Loading alerts...</div> : null}
                    {alertsQuery.isError ? (
                        <ErrorBanner
                            error={surveillanceApiClient.normalizeError(alertsQuery.error as NormalizedApiError)}
                            onRetry={() => alertsQuery.refetch()}
                        />
                    ) : null}

                    {!alertsQuery.isPending && !alertsQuery.isError && alerts.length === 0 ? (
                        <EmptyState
                            title="No alerts found"
                            description="Try changing severity or pagination filters."
                            action={
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    onClick={() => {
                                        setAlertsSeverity('');
                                        setAlertsOffset(0);
                                    }}
                                >
                                    Reset filters
                                </button>
                            }
                        />
                    ) : null}

                    {!alertsQuery.isPending && !alertsQuery.isError && alerts.length > 0 ? (
                        <div className="sih-alert-list">
                            {alerts.map((alert: SurveillanceAlert, index) => (
                                <article key={`${alert.alert_id || 'alert'}-${index}`} className="sih-alert-card">
                                    <div className="sih-alert-header">
                                        <SeverityBadge severity={alert.severity} />
                                        <strong>Score: {typeof alert.score === 'number' ? alert.score.toFixed(2) : 'N/A'}</strong>
                                    </div>
                                    <p>{alert.message || 'No message provided.'}</p>
                                    <div className="sih-alert-meta">
                                        <span>{formatDateTime(alert.timestamp)}</span>
                                        {alert.linked_record_id ? (
                                            <button
                                                type="button"
                                                className="sih-link-button"
                                                onClick={() => setSelectedRecordId(alert.linked_record_id || null)}
                                            >
                                                Record: {alert.linked_record_id}
                                            </button>
                                        ) : null}
                                    </div>
                                </article>
                            ))}

                            <div className="sih-pagination-row">
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    disabled={alertsOffset === 0}
                                    onClick={() => setAlertsOffset(prev => Math.max(0, prev - limit))}
                                >
                                    Previous
                                </button>
                                <span>Offset {alertsOffset}</span>
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    disabled={alerts.length < limit}
                                    onClick={() => setAlertsOffset(prev => prev + limit)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    ) : null}
                </Panel>
            ) : null}

            {showMonitor ? (
                <Panel title={panelTitles.records} description="Search records and open details.">
                    <div className="sih-filter-row">
                        <label htmlFor="records-state">
                            State
                            <input
                                id="records-state"
                                value={stateFilter}
                                onChange={event => {
                                    setStateFilter(event.target.value);
                                    setRecordsOffset(0);
                                }}
                                placeholder="Type state..."
                            />
                        </label>
                        <label htmlFor="records-district">
                            District
                            <input
                                id="records-district"
                                value={districtFilter}
                                onChange={event => {
                                    setDistrictFilter(event.target.value);
                                    setRecordsOffset(0);
                                }}
                                placeholder="Type district..."
                            />
                        </label>
                        <label htmlFor="records-syndrome">
                            Syndrome
                            <input
                                id="records-syndrome"
                                value={syndromeFilter}
                                onChange={event => {
                                    setSyndromeFilter(event.target.value);
                                    setRecordsOffset(0);
                                }}
                                placeholder="Type syndrome..."
                            />
                        </label>
                    </div>

                    {recordsQuery.isPending ? <div className="sih-loading">Loading records...</div> : null}
                    {recordsQuery.isError ? (
                        <ErrorBanner
                            error={surveillanceApiClient.normalizeError(recordsQuery.error as NormalizedApiError)}
                            onRetry={() => recordsQuery.refetch()}
                        />
                    ) : null}

                    {!recordsQuery.isPending && !recordsQuery.isError && pagedRecords.records.length === 0 ? (
                        <EmptyState
                            title="No records matched"
                            description="Update filters or reset inputs to broaden the search."
                            action={
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    onClick={() => {
                                        setStateFilter('');
                                        setDistrictFilter('');
                                        setSyndromeFilter('');
                                        setRecordsOffset(0);
                                    }}
                                >
                                    Reset record filters
                                </button>
                            }
                        />
                    ) : null}

                    {!recordsQuery.isPending && !recordsQuery.isError && pagedRecords.records.length > 0 ? (
                        <>
                            <DataTable<SurveillanceRecord>
                                ariaLabel="Surveillance records table"
                                rows={pagedRecords.records}
                                rowKey={row => row.record_id}
                                onRowClick={row => setSelectedRecordId(row.record_id)}
                                columns={[
                                    {
                                        key: 'record_id',
                                        label: 'Record ID',
                                        render: row => row.record_id,
                                    },
                                    {
                                        key: 'state',
                                        label: 'State',
                                        render: row => row.state || 'N/A',
                                    },
                                    {
                                        key: 'district',
                                        label: 'District',
                                        render: row => row.district || 'N/A',
                                    },
                                    {
                                        key: 'syndrome',
                                        label: 'Syndrome',
                                        render: row => row.syndrome || 'N/A',
                                    },
                                    {
                                        key: 'timestamp',
                                        label: 'Timestamp',
                                        render: row => formatDateTime(row.created_at || row.timestamp),
                                    },
                                ]}
                            />

                            <div className="sih-pagination-row">
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    disabled={recordsOffset === 0}
                                    onClick={() => setRecordsOffset(prev => Math.max(0, prev - limit))}
                                >
                                    Previous
                                </button>
                                <span>
                                    Offset {recordsOffset}
                                    {typeof pagedRecords.total === 'number' ? ` / Total ${pagedRecords.total}` : ''}
                                </span>
                                <button
                                    type="button"
                                    className="sih-btn sih-btn-secondary"
                                    disabled={pagedRecords.records.length < limit}
                                    onClick={() => setRecordsOffset(prev => prev + limit)}
                                >
                                    Next
                                </button>
                            </div>
                        </>
                    ) : null}
                </Panel>
            ) : null}

            <Drawer open={showMonitor && !!selectedRecordId} title="Record Detail" onClose={() => setSelectedRecordId(null)}>
                {recordDetailQuery.isPending ? <div className="sih-loading">Loading record detail...</div> : null}
                {recordDetailQuery.isError ? (
                    <ErrorBanner
                        error={surveillanceApiClient.normalizeError(recordDetailQuery.error as NormalizedApiError)}
                        onRetry={() => recordDetailQuery.refetch()}
                    />
                ) : null}
                {!recordDetailQuery.isPending && !recordDetailQuery.isError && recordDetailQuery.data?.data ? (
                    <div className="sih-plain-text-block sih-detail-json">
                        {toPlainTextLines(recordDetailQuery.data.data).map((line, idx) => (
                            <p key={`record-detail-line-${idx}`}>{line}</p>
                        ))}
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
};

export default SurveillanceIntegrationHub;
