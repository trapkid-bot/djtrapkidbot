// TrapKid Analyzer bridge: the DBot UI consumes the Analyzer's live status
// instead of creating a second Analyzer data stream.
//
// Production note: the default URL is localhost because the deployed DBot page
// runs in the user's browser. That browser can reach the user's local Analyzer
// at http://localhost:5003. Set VITE_ANALYZER_URL/NEXT_PUBLIC_ANALYZER_URL only
// when the Analyzer is exposed at another browser-reachable origin.

export type AnalyzerSignal = {
    signalId?: string;
    symbol?: string;
    contractType?: string;
    entryDigit?: number | null;
    entryQuote?: number | null;
    lockedDigit?: number | null;
    prediction?: number | null;
    exitDigit?: number | null;
    hotDigit?: number | null;
    direction?: string;
    lockedQuote?: number | null;
    pipSize?: number | null;
    score?: number | null;
    lockedAt?: number | null;
    expiresAt?: number | null;
    status?: string;
};

export type AnalyzerStatus = {
    ok: boolean;
    symbol: string;
    state: string;
    currentDigit: number | null;
    hotDigit: number | null;
    lockedDigit: number | null;
    remainingSeconds: number | null;
    signal: AnalyzerSignal | null;
    exitDigit: number | null;
    raw: any;
};

const getAnalyzerBaseUrl = () =>
    (
        (typeof process !== 'undefined' &&
            ((process.env as any)?.VITE_ANALYZER_URL || (process.env as any)?.NEXT_PUBLIC_ANALYZER_URL)) ||
        'http://localhost:5003'
    ).replace(/\/$/, '');

const toNumberOrNull = (value: any): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const extractStatus = (data: any): AnalyzerStatus => {
    const signal = data?.signal || data?.data?.signal || null;
    const currentDigit = toNumberOrNull(
        data?.currentDigit ??
            data?.lastDigit ??
            data?.digit ??
            data?.tick?.digit ??
            data?.data?.currentDigit ??
            signal?.currentDigit
    );
    const lockedDigit = toNumberOrNull(
        data?.lockedDigit ?? data?.prediction ?? data?.data?.lockedDigit ?? signal?.lockedDigit ?? signal?.prediction
    );
    const hotDigit = toNumberOrNull(
        data?.hotDigit ?? data?.prediction ?? data?.data?.hotDigit ?? signal?.hotDigit ?? signal?.lockedDigit ?? signal?.prediction
    );

    let remainingSeconds = toNumberOrNull(data?.remainingSeconds ?? data?.data?.remainingSeconds);
    const expiresAt = toNumberOrNull(data?.expiresAt ?? data?.data?.expiresAt ?? signal?.expiresAt);
    if (remainingSeconds === null && expiresAt !== null) {
        remainingSeconds = Math.max(0, (expiresAt - Date.now()) / 1000);
    }

    const exitDigit = toNumberOrNull(
        data?.exitDigit ?? data?.data?.exitDigit ?? signal?.exitDigit ?? data?.exit?.digit
    );

    return {
        ok: data?.ok !== false,
        symbol: data?.symbol || data?.data?.symbol || signal?.symbol || '—',
        state: String(data?.state ?? data?.sync?.state ?? data?.data?.state ?? signal?.status ?? 'UNKNOWN').toUpperCase(),
        currentDigit,
        hotDigit,
        lockedDigit,
        remainingSeconds,
        signal,
        exitDigit,
        raw: data,
    };
};

export class AnalyzerBridgeService {
    static get baseUrl() {
        return getAnalyzerBaseUrl();
    }

    static async getStatus(): Promise<AnalyzerStatus> {
        const response = await fetch(`${getAnalyzerBaseUrl()}/api/status`, {
            method: 'GET',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Analyzer HTTP ${response.status}`);
        }

        return extractStatus(await response.json());
    }

    static isLocked(status: AnalyzerStatus) {
        return Boolean(
            status.signal &&
                (status.lockedDigit !== null || status.hotDigit !== null) &&
                status.remainingSeconds !== null &&
                status.remainingSeconds > 0
        );
    }

    static hasExit(status: AnalyzerStatus) {
        const state = status.state;
        return (
            status.exitDigit !== null ||
            /EXIT|EARLY|APPEAR|CONFIRMED/.test(state) ||
            (status.hotDigit !== null && status.currentDigit === status.hotDigit && /LOCK|WAIT|HOT/.test(state))
        );
    }

    static async waitForSignal(timeoutMs = 35000, pollMs = 250): Promise<AnalyzerStatus> {
        const started = Date.now();
        let lastError: any = null;

        while (Date.now() - started < timeoutMs) {
            try {
                const status = await this.getStatus();
                if (this.isLocked(status)) return status;
                lastError = null;
            } catch (error) {
                lastError = error;
            }
            await new Promise(resolve => setTimeout(resolve, pollMs));
        }

        if (lastError) {
            throw new Error(`TrapKid Analyzer unavailable: ${lastError?.message || lastError}`);
        }
        throw new Error('TrapKid Analyzer did not produce a valid locked signal before timeout.');
    }

    static async waitForExit(timeoutMs = 35000, pollMs = 250): Promise<AnalyzerStatus> {
        const started = Date.now();

        while (Date.now() - started < timeoutMs) {
            const status = await this.getStatus();
            if (this.hasExit(status)) return status;
            await new Promise(resolve => setTimeout(resolve, pollMs));
        }

        throw new Error('TrapKid Analyzer exit signal timed out.');
    }

    static async getHotDigit(): Promise<number> {
        const status = await this.getStatus();
        const digit = status.hotDigit ?? status.lockedDigit ?? status.signal?.prediction;
        if (digit === null || digit === undefined || !Number.isFinite(Number(digit))) {
            throw new Error('TrapKid Analyzer has no locked hot digit.');
        }
        return Number(digit);
    }

    static async getCurrentDigit(): Promise<number> {
        const status = await this.getStatus();
        if (status.currentDigit === null || !Number.isFinite(Number(status.currentDigit))) {
            throw new Error('TrapKid Analyzer has no current digit.');
        }
        return Number(status.currentDigit);
    }

    static async isConnected(): Promise<boolean> {
        try {
            const status = await this.getStatus();
            return status.ok !== false;
        } catch {
            return false;
        }
    }
}
