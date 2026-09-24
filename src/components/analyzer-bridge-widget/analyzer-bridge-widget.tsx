import React, { useEffect, useRef, useState } from 'react';
import { AnalyzerBridgeService, AnalyzerStatus } from '@/services/analyzer-bridge.service';
import './analyzer-bridge-widget.scss';

const initialStatus: AnalyzerStatus = {
    ok: false, symbol: '—', state: 'CONNECTING', currentDigit: null, hotDigit: null,
    lockedDigit: null, remainingSeconds: null, signal: null, exitDigit: null, raw: null,
};

const AnalyzerBridgeWidget = () => {
    const [status, setStatus] = useState<AnalyzerStatus>(initialStatus);
    const [connected, setConnected] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [position, setPosition] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('trapkid_analyzer_widget_position') || 'null');
            return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
                ? saved : { x: Math.max(16, window.innerWidth - 78), y: 96 };
        } catch { return { x: Math.max(16, window.innerWidth - 78), y: 96 }; }
    });
    const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

    const refresh = async () => {
        try {
            const next = await AnalyzerBridgeService.getStatus();
            setStatus(next);
            setConnected(true);
        } catch {
            setConnected(false);
            setStatus(prev => ({ ...prev, state: 'DISCONNECTED' }));
        }
    };

    useEffect(() => {
        refresh();
        const id = window.setInterval(refresh, 500);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        localStorage.setItem('trapkid_analyzer_widget_position', JSON.stringify(position));
    }, [position]);

    const onPointerDown = (event: React.PointerEvent) => {
        if ((event.target as HTMLElement).closest('button')) return;
        drag.current = { startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: React.PointerEvent) => {
        if (!drag.current) return;
        const width = expanded ? 330 : 58;
        const height = expanded ? 260 : 58;
        setPosition({
            x: Math.max(8, Math.min(window.innerWidth - width, drag.current.originX + event.clientX - drag.current.startX)),
            y: Math.max(8, Math.min(window.innerHeight - height, drag.current.originY + event.clientY - drag.current.startY)),
        });
    };

    const ttl = status.remainingSeconds === null ? '—' : `${Math.max(0, status.remainingSeconds).toFixed(1)}s`;
    const signal = status.signal;

    return (
        <div className={`trapkid-analyzer-widget ${expanded ? 'expanded' : 'collapsed'}`} style={{ left: position.x, top: position.y }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }}>
            <button className="trapkid-analyzer-orb" aria-label="TrapKid Analyzer status"
                onClick={() => setExpanded(value => !value)} title="TrapKid Analyzer">
                <span className={`trapkid-analyzer-dot ${connected ? 'connected' : 'disconnected'}`} />
                <span className="trapkid-analyzer-orb-mark">TK</span>
            </button>
            {expanded && (
                <div className="trapkid-analyzer-panel">
                    <div className="trapkid-analyzer-header">
                        <div>
                            <div className="trapkid-analyzer-title">TRAPKID ANALYZER</div>
                            <div className="trapkid-analyzer-subtitle">
                                <span className={`trapkid-analyzer-dot small ${connected ? 'connected' : 'disconnected'}`} />
                                {connected ? 'CONNECTED' : 'DISCONNECTED'}
                            </div>
                        </div>
                        <button className="trapkid-analyzer-close" onClick={() => setExpanded(false)}>×</button>
                    </div>
                    <div className="trapkid-analyzer-grid">
                        <div><span>MARKET</span><strong>{status.symbol}</strong></div>
                        <div><span>STATE</span><strong>{status.state}</strong></div>
                        <div><span>CURRENT</span><strong className="digit-current">{status.currentDigit ?? '—'}</strong></div>
                        <div><span>HOT DIGIT</span><strong className="digit-hot">{status.hotDigit ?? '—'}</strong></div>
                        <div><span>ENTRY</span><strong>{signal?.entryDigit ?? '—'}</strong></div>
                        <div><span>EXIT</span><strong>{status.exitDigit ?? signal?.exitDigit ?? 'WAITING'}</strong></div>
                    </div>
                    <div className="trapkid-analyzer-footer">
                        <span>TTL <b>{ttl}</b></span>
                        <span>SIGNAL <b>{signal?.signalId || 'NONE'}</b></span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyzerBridgeWidget;
