import React, { useMemo } from 'react';
import { GPOReport } from '../utils/GPOParser';

interface GPODashboardProps {
	report: GPOReport;
}

export const GPODashboard: React.FC<GPODashboardProps> = ({ report }) => {
	const summary = useMemo(() => {
		const totalGpos = report.gpos.length;
		let totalSettings = 0;
		const findingCounts: Record<string, number> = {};
		const topGpos = report.gpos.slice(0, 10).map(g => g.header.gpo || g.startedAtRaw || 'GPO');

		report.gpos.forEach(gpo => {
			totalSettings += gpo.settings.length;
			gpo.settings.forEach(s => {
				(s.findings || []).forEach(f => {
					const key = (f.type || 'Unknown').toString();
					findingCounts[key] = (findingCounts[key] || 0) + 1;
				});
			});
		});

		// Normalize rating keys for styling
		const ratingOrder = ['Red', 'Yellow', 'Green', 'Black', 'Unknown'];
		const findingsList = ratingOrder
			.filter(k => findingCounts[k])
			.map(k => ({ type: k, count: findingCounts[k] }));

		return { totalGpos, totalSettings, findingsList, topGpos };
	}, [report]);

	return (
		<div>
			<div className="dashboard">
				<div className="insights-section">
					<h2>GPO Summary</h2>
					<div className="stats">
						<div className="stat-card">
							<span className="stat-number">{summary.totalGpos}</span>
							<span className="stat-label"> GPOs</span>
						</div>
						<div className="stat-card">
							<span className="stat-number">{summary.findingsList.reduce((a, b) => a + b.count, 0)}</span>
							<span className="stat-label"> Findings</span>
							<span> & </span>
							<span className="stat-number">{summary.totalSettings}</span>
							<span className="stat-label"> Settings</span>
						</div>
					</div>
				</div>

				<div className="insights-section">
					<h2>Findings by Severity</h2>
					<div className="insights-card compact">
						{summary.findingsList.length === 0 ? (
							<div className="no-data">No findings detected</div>
						) : (
							<div className="insights-list compact">
								{summary.findingsList.map((f, idx) => (
									<div key={idx} className="insight-item compact">
										<div className={`insight-rank compact rating-${f.type.toLowerCase()}`}>#{idx + 1}</div>
										<div className="insight-content">
											<div className="insight-primary compact">{f.type}</div>
											<div className="insight-secondary compact">{f.count} findings</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<div className="insights-section" style={{ paddingTop: '16px' }}>
					<h2>Top GPOs</h2>
					<div className="insights-card compact">
						{summary.topGpos.length === 0 ? (
							<div className="no-data">No GPOs found</div>
						) : (
							<div className="insights-list compact">
								{summary.topGpos.map((name, idx) => (
									<div key={idx} className="insight-item compact">
										<div className="insight-rank compact">#{idx + 1}</div>
										<div className="insight-content">
											<div className="insight-primary compact">{name}</div>
											<div className="insight-secondary compact">GPO</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};


