import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GPOReport } from '../utils/GPOParser';

interface GPOResultsProps {
	report: GPOReport;
}

const GPOResults: React.FC<GPOResultsProps> = ({ report }) => {
	const [search, setSearch] = useState('');
	const [scopeFilter, setScopeFilter] = useState<string>('all');
	const [categoryFilter, setCategoryFilter] = useState<string>('all');
	const [isLeftPanelMinimized, setIsLeftPanelMinimized] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(100);
	const [sortField, setSortField] = useState<'gpo' | 'scope' | 'category' | 'entries' | 'findings' | 'severity'>('severity');
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	// Panel sizing and persistence
	const [leftPanelWidthPx, setLeftPanelWidthPx] = useState<number>(300);
	const [rightPanelWidthPx, setRightPanelWidthPx] = useState<number>(400);
	const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(null);
	const previousLeftWidthRef = useRef<number>(300);
	const windowWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
	const leftResizerRef = useRef<HTMLDivElement>(null);
	const rightResizerRef = useRef<HTMLDivElement>(null);

	const showRightPanel = selectedIndex !== null;

	const getStoredPct = (key: string, fallback: number) => {
		try {
			const raw = localStorage.getItem(key);
			if (!raw) return fallback;
			const num = parseFloat(raw);
			return isNaN(num) ? fallback : num;
		} catch {
			return fallback;
		}
	};

	const setStoredPct = (key: string, value: number) => {
		try {
			localStorage.setItem(key, String(value));
		} catch {}
	};

	// Initialize from storage
	useEffect(() => {
		const ww = window.innerWidth;
		windowWidthRef.current = ww;
		const storedLeftPct = getStoredPct('layout:gpo:leftPct', 300 / ww);
		const storedRightPct = getStoredPct('layout:gpo:rightPct', 400 / ww);
		const MIN_LEFT = 180;
		const MIN_RIGHT = 280;
		const MIN_CENTER = 480;
		const computedRight = Math.round(storedRightPct * ww);
		const maxLeft = Math.max(MIN_LEFT, ww - (showRightPanel ? computedRight : 0) - MIN_CENTER);
		const newLeft = Math.max(MIN_LEFT, Math.min(Math.round(storedLeftPct * ww), maxLeft));
		const maxRight = Math.max(MIN_RIGHT, ww - newLeft - MIN_CENTER);
		const newRight = Math.max(MIN_RIGHT, Math.min(computedRight, maxRight));
		setLeftPanelWidthPx(newLeft);
		setRightPanelWidthPx(newRight);
		previousLeftWidthRef.current = Math.max(MIN_LEFT, Math.round(storedLeftPct * ww));
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Recompute on window resize
	useEffect(() => {
		const onResize = () => {
			const ww = window.innerWidth;
			const leftPct = leftPanelWidthPx / windowWidthRef.current;
			const rightPct = rightPanelWidthPx / windowWidthRef.current;
			windowWidthRef.current = ww;
			const MIN_LEFT = 180;
			const MIN_RIGHT = 280;
			const MIN_CENTER = 480;
			const computedLeft = Math.round(leftPct * ww);
			const computedRight = Math.round(rightPct * ww);
			const maxLeft = Math.max(MIN_LEFT, ww - (showRightPanel ? computedRight : 0) - MIN_CENTER);
			setLeftPanelWidthPx(Math.max(MIN_LEFT, Math.min(computedLeft, maxLeft)));
			if (showRightPanel) {
				const maxRight = Math.max(MIN_RIGHT, ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER);
				setRightPanelWidthPx(Math.max(MIN_RIGHT, Math.min(computedRight, maxRight)));
			}
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [leftPanelWidthPx, rightPanelWidthPx, showRightPanel, isLeftPanelMinimized]);

	// Persist proportions
	useEffect(() => {
		const ww = windowWidthRef.current || window.innerWidth;
		if (ww > 0) setStoredPct('layout:gpo:leftPct', leftPanelWidthPx / ww);
	}, [leftPanelWidthPx]);
	useEffect(() => {
		const ww = windowWidthRef.current || window.innerWidth;
		if (ww > 0) setStoredPct('layout:gpo:rightPct', rightPanelWidthPx / ww);
	}, [rightPanelWidthPx]);

	// Drag handling
	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (!draggingSide) return;
			const ww = window.innerWidth;
			const MIN_LEFT = 180;
			const MIN_RIGHT = 280;
			const MIN_CENTER = 480;
			if (draggingSide === 'left') {
				if (isLeftPanelMinimized) return;
				let newLeft = e.clientX;
				const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
				newLeft = Math.max(MIN_LEFT, Math.min(newLeft, maxLeft));
				setLeftPanelWidthPx(newLeft);
				previousLeftWidthRef.current = newLeft;
			} else if (draggingSide === 'right') {
				if (!showRightPanel) return;
				let newRight = ww - e.clientX;
				const maxRight = ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER;
				newRight = Math.max(MIN_RIGHT, Math.min(newRight, maxRight));
				setRightPanelWidthPx(newRight);
			}
		};
		const onMouseUp = () => { if (draggingSide) setDraggingSide(null); };
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		return () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};
	}, [draggingSide, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx, showRightPanel]);

	// Clamp when right panel visibility changes
	useEffect(() => {
		const ww = window.innerWidth;
		const MIN_LEFT = 180;
		const MIN_RIGHT = 280;
		const MIN_CENTER = 480;
		if (showRightPanel) {
			const maxLeft = Math.max(MIN_LEFT, ww - rightPanelWidthPx - MIN_CENTER);
			setLeftPanelWidthPx(prev => Math.max(MIN_LEFT, Math.min(prev, maxLeft)));
			const maxRight = Math.max(MIN_RIGHT, ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER);
			setRightPanelWidthPx(prev => Math.max(MIN_RIGHT, Math.min(prev, maxRight)));
		} else {
			const maxLeft = Math.max(MIN_LEFT, ww - MIN_CENTER);
			setLeftPanelWidthPx(prev => Math.max(MIN_LEFT, Math.min(prev, maxLeft)));
		}
	}, [showRightPanel, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx]);

	const handleToggleLeftPanel = () => {
		setIsLeftPanelMinimized(prev => {
			const next = !prev;
			if (next) {
				previousLeftWidthRef.current = leftPanelWidthPx;
				setLeftPanelWidthPx(50);
			} else {
				const ww = window.innerWidth;
				const MIN_LEFT = 180;
				const MIN_CENTER = 480;
				const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
				const restored = Math.max(MIN_LEFT, Math.min(previousLeftWidthRef.current || 300, maxLeft));
				setLeftPanelWidthPx(restored);
			}
			return next;
		});
	};

	const { scopes, categories } = useMemo(() => {
		const scopeSet = new Set<string>();
		const categorySet = new Set<string>();
		report.gpos.forEach(gpo => {
			gpo.settings.forEach(s => {
				if (s.scope) scopeSet.add(s.scope);
				if (s.category) categorySet.add(s.category);
			});
		});
		return { scopes: Array.from(scopeSet).sort(), categories: Array.from(categorySet).sort() };
	}, [report]);

	// Flatten settings into table rows to mirror File Results layout
	const flattened = useMemo(() => {
		const q = search.trim().toLowerCase();
		const items: Array<{
			index: number;
			gpoTitle: string;
			pathInSysvol?: string;
			scope?: string;
			category?: string;
			entries: Record<string, string>;
			findings: Array<{ type?: string; reason?: string }>;
		}> = [];
		let idx = 0;
		report.gpos.forEach(gpo => {
			const title = gpo.header.gpo || gpo.startedAtRaw || 'GPO';
			gpo.settings.forEach(s => {
				// Filters
				if (scopeFilter !== 'all' && (s.scope || '').toLowerCase() !== scopeFilter.toLowerCase()) return;
				if (categoryFilter !== 'all' && (s.category || '').toLowerCase() !== categoryFilter.toLowerCase()) return;
				// Search
				if (q) {
					const entriesText = Object.entries(s.entries).map(([k, v]) => `${k} ${v}`).join(' ').toLowerCase();
					const findingsText = (s.findings || []).map(f => `${f.type || ''} ${f.reason || ''}`).join(' ').toLowerCase();
					const match = (
						title.toLowerCase().includes(q) ||
						(s.scope || '').toLowerCase().includes(q) ||
						(s.category || '').toLowerCase().includes(q) ||
						entriesText.includes(q) ||
						findingsText.includes(q)
					);
					if (!match) return;
				}
				items.push({
					index: idx++,
					gpoTitle: title,
					pathInSysvol: gpo.header.pathInSysvol,
					scope: s.scope,
					category: s.category,
					entries: s.entries,
					findings: s.findings || []
				});
			});
		});
		return items;
	}, [report, search, scopeFilter, categoryFilter]);

	const severityRank = (t?: string) => {
		switch ((t || '').toLowerCase()) {
			case 'black': return 4;
			case 'red': return 3;
			case 'yellow': return 2;
			case 'green': return 1;
			default: return 0;
		}
	};

	const sorted = useMemo(() => {
		const data = [...flattened];
		data.sort((a, b) => {
			let av: any = '';
			let bv: any = '';
			switch (sortField) {
				case 'gpo':
					av = a.gpoTitle.toLowerCase();
					bv = b.gpoTitle.toLowerCase();
					break;
				case 'scope':
					av = (a.scope || '').toLowerCase();
					bv = (b.scope || '').toLowerCase();
					break;
				case 'category':
					av = (a.category || '').toLowerCase();
					bv = (b.category || '').toLowerCase();
					break;
				case 'entries':
					av = Object.keys(a.entries).length;
					bv = Object.keys(b.entries).length;
					break;
				case 'findings':
					av = a.findings.length;
					bv = b.findings.length;
					break;
				case 'severity':
					av = Math.max(0, ...a.findings.map(f => severityRank(f.type)));
					bv = Math.max(0, ...b.findings.map(f => severityRank(f.type)));
					break;
			}
			if (av === bv) {
				return a.gpoTitle.toLowerCase() < b.gpoTitle.toLowerCase() ? -1 : 1;
			}
			return sortDirection === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
		});
		return data;
	}, [flattened, sortField, sortDirection]);

	const totalSettings = flattened.length;
	const totalPages = Math.ceil(sorted.length / pageSize) || 1;
	const pageStart = (currentPage - 1) * pageSize;
	const currentPageData = sorted.slice(pageStart, pageStart + pageSize);

	const handleSort = (field: typeof sortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortField(field);
			setSortDirection('desc');
		}
	};

	const getSortIcon = (field: typeof sortField) => {
		if (sortField !== field) return 'sortable';
		return `sortable ${sortDirection}`;
	};

	return (
		<div className={`main-content`}>
			<div 
				className={`left-panel ${isLeftPanelMinimized ? 'minimized' : ''}`}
				style={{ width: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
			>
				<div className="panel-header">
					<span>Filters</span>
					<button className="minimize-button" onClick={handleToggleLeftPanel}>
						<i className={`fas fa-chevron-${isLeftPanelMinimized ? 'right' : 'left'}`}></i>
					</button>
				</div>
				<div className="panel-content">
					<div className="filter-section">
						<label>Scope</label>
						<select value={scopeFilter} onChange={(e) => { setScopeFilter(e.target.value); setCurrentPage(1); }}>
							<option value="all">All</option>
							{scopes.map(s => (
								<option key={s} value={s}>{s}</option>
							))}
						</select>
					</div>
					<div className="filter-section">
						<label>Category</label>
						<select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}>
							<option value="all">All</option>
							{categories.map(c => (
								<option key={c} value={c}>{c}</option>
							))}
						</select>
					</div>
				</div>
			</div>

			<div 
				className={`center-panel ${isLeftPanelMinimized ? 'expanded' : ''} ${selectedIndex !== null ? 'with-right-panel' : ''}`}
				style={{ left: isLeftPanelMinimized ? 50 : leftPanelWidthPx, right: showRightPanel ? rightPanelWidthPx : 0 }}
			>
				<div className="table-container">
					<div className="table-header">
						<div className="table-header-content">
							<div className="search-container">
								<div className="search-input-wrapper">
									<input
										id="gpo-search"
										type="text"
										placeholder="Search GPO name, scope, category, entries, findings..."
										value={search}
										onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
									/>
									{search && (
										<button
											className="search-clear-button"
											onClick={() => setSearch('')}
											type="button"
										>
											×
										</button>
									)}
								</div>
							</div>
							<div className="table-controls">
								<div className="results-count">
									Showing {sorted.length} of {totalSettings} settings
								</div>
							</div>
						</div>
					</div>

					<div className="table-wrapper">
						<table>
							<thead>
								<tr>
									<th className={getSortIcon('severity')} onClick={() => handleSort('severity')}>Severity</th>
									<th className={getSortIcon('gpo')} onClick={() => handleSort('gpo')}>GPO</th>
									<th className={getSortIcon('scope')} onClick={() => handleSort('scope')}>Scope</th>
									<th className={getSortIcon('category')} onClick={() => handleSort('category')}>Category</th>
									<th className={getSortIcon('entries')} onClick={() => handleSort('entries')}>Entries</th>
									<th className={getSortIcon('findings')} onClick={() => handleSort('findings')}>Findings</th>
								</tr>
							</thead>
							<tbody>
								{currentPageData.length === 0 ? (
									<tr>
										<td colSpan={6}>
											<div className="no-data">No matching settings found</div>
										</td>
									</tr>
								) : (
									<>
										{currentPageData.map((item) => {
											const maxType = item.findings.reduce<string | undefined>((acc, f) => {
												return severityRank(f.type) > severityRank(acc) ? (f.type || acc) : acc;
											}, undefined);
											const displaySeverity = maxType || 'INFO';
											return (
												<tr key={item.index} className={selectedIndex === item.index ? 'selected' : ''} onClick={() => setSelectedIndex(item.index)}>
													<td className="rating-cell"><span className={`rating ${String(displaySeverity).toLowerCase()}`}>{displaySeverity}</span></td>
													<td className="path-cell"><div className="path">{item.gpoTitle}</div></td>
													<td className="path-cell">{item.scope || '-'}</td>
													<td className="path-cell">{item.category || '-'}</td>
													<td>{Object.keys(item.entries).length}</td>
													<td>{item.findings.length}</td>
												</tr>
											);
										})}
									</>
								)}
							</tbody>
						</table>
					</div>

					<div className="pagination-controls">
						<div className="pagination-info">Page {currentPage} of {totalPages}</div>
						<div className="pagination-controls-right">
							<div className="page-size-selector">
								<label>Rows per page:</label>
								<select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }}>
									<option value={50}>50</option>
									<option value={100}>100</option>
									<option value={200}>200</option>
								</select>
							</div>
							<div className="pagination-buttons">
								<button className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`} disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>{'<<'}</button>
								<button className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`} disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>{'<'}</button>
								<button className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`} disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>{'>'}</button>
								<button className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`} disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>{'>>'}</button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div 
				className={`right-panel ${selectedIndex === null ? 'hidden' : ''}`}
				style={{ width: rightPanelWidthPx }}
			>
				<div className="panel-header">
					<span>Details</span>
					<button className="close-button" onClick={() => setSelectedIndex(null)}>×</button>
				</div>
				<div className="panel-content">
					{selectedIndex !== null ? (() => {
						const item = sorted.find(i => i.index === selectedIndex);
						if (!item) return null;
						const maxType = item.findings.reduce<string | undefined>((acc, f) => severityRank(f.type) > severityRank(acc) ? (f.type || acc) : acc, undefined);
						const displaySeverity = maxType || 'INFO';
						return (
							<div className="detail-panel">
								<div className="detail-section horizontal">
									<div className="detail-label">GPO</div>
									<div className="detail-value">{item.gpoTitle}</div>
								</div>
								<div className="detail-section horizontal">
									<div className="detail-label">Scope</div>
									<div className="detail-value">{item.scope || '-'}</div>
								</div>
								<div className="detail-section horizontal">
									<div className="detail-label">Category</div>
									<div className="detail-value">{item.category || '-'}</div>
								</div>
								{item.pathInSysvol && (
									<div className="detail-section horizontal">
										<div className="detail-label">SYSVOL Path</div>
										<div className="detail-value">{item.pathInSysvol}</div>
									</div>
								)}
								<div className="detail-section">
									<div className="detail-label">Entries</div>
									<div className="detail-value">
										{Object.keys(item.entries).length === 0 ? (
											<span>-</span>
										) : (
											<ul>
												{Object.entries(item.entries).map(([k, v]) => (
													<li key={k}><strong>{k}:</strong> {v}</li>
												))}
											</ul>
										)}
									</div>
								</div>
								<div className="detail-section">
									<div className="detail-label">Findings</div>
									<div className="detail-value">
										{item.findings.length === 0 ? (
											<span>-</span>
										) : (
											<ul>
												{item.findings.map((f, i) => (
													<li key={i}>{f.type ? (<span className={`rating ${String(f.type).toLowerCase()}`}>{f.type}</span>) : null} {f.reason || ''}</li>
												))}
											</ul>
										)}
									</div>
								</div>
								{item.findings.length > 1 && (
									<div className="detail-section horizontal">
										<div className="detail-label">Max Severity</div>
										<div className="detail-value"><span className={`rating ${String(displaySeverity).toLowerCase()}`}>{displaySeverity}</span></div>
									</div>
								)}
							</div>
						);
					})() : null}
				</div>
			</div>

			{/* Resizers */}
			<div 
				ref={leftResizerRef}
				className={`resizer resizer-left ${isLeftPanelMinimized ? 'hidden' : ''} ${draggingSide === 'left' ? 'dragging' : ''}`}
				style={{ left: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
				onMouseDown={(e) => { e.preventDefault(); setDraggingSide('left'); }}
			/>
			<div 
				ref={rightResizerRef}
				className={`resizer resizer-right ${showRightPanel ? '' : 'hidden'} ${draggingSide === 'right' ? 'dragging' : ''}`}
				style={{ right: rightPanelWidthPx }}
				onMouseDown={(e) => { e.preventDefault(); setDraggingSide('right'); }}
			/>
		</div>
	);
};

export default GPOResults;


