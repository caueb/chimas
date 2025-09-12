import React, { useMemo } from 'react';
import { GPOReport } from '../utils/GPOParser';

interface GPODashboardProps {
	report: GPOReport;
}

export const GPODashboard: React.FC<GPODashboardProps> = ({ report }) => {
	const summary = useMemo(() => {
		const totalGpos = report.gpos.length;
		let totalSettings = 0;
		let linkedGpos = 0;
		let notLinkedGpos = 0;
		const findingCounts: Record<string, number> = {};
		
		// Severity ranking function (same as in GPOResults)
		const severityRank = (t?: string) => {
			switch ((t || '').toLowerCase()) {
				case 'black': return 4;
				case 'red': return 3;
				case 'yellow': return 2;
				case 'green': return 1;
				default: return 0;
			}
		};
		
		// Calculate findings per GPO and sort by findings count
		const gposWithFindings = report.gpos.map(gpo => {
			const findingsCount = gpo.settings.reduce((total, setting) => {
				return total + (setting.findings ? setting.findings.length : 0);
			}, 0);
			return {
				name: gpo.header.gpo || gpo.startedAtRaw || 'GPO',
				findingsCount
			};
		}).sort((a, b) => b.findingsCount - a.findingsCount).slice(0, 10);
		
		// Calculate weighted severity score per GPO and sort by risk
		const gposBySeverity = report.gpos.map(gpo => {
			let totalSeverityScore = 0;
			let highestSeverity = 0;
			let highestSeverityType = 'Unknown';
			const severityCounts: Record<string, number> = {};
			
			gpo.settings.forEach(setting => {
				(setting.findings || []).forEach(finding => {
					const findingType = finding.type || 'Unknown';
					
					// Count findings by type
					severityCounts[findingType] = (severityCounts[findingType] || 0) + 1;
				});
			});
			
			// Calculate weighted score: severity * count for each type
			Object.entries(severityCounts).forEach(([findingType, count]) => {
				const severity = severityRank(findingType);
				totalSeverityScore += severity * count;
				
				// Track highest severity for display
				if (severity > highestSeverity) {
					highestSeverity = severity;
					highestSeverityType = findingType;
				}
			});
			
			// Calculate total findings count
			const totalFindings = Object.values(severityCounts).reduce((sum, count) => sum + count, 0);
			
			return {
				name: gpo.header.gpo || gpo.startedAtRaw || 'GPO',
				severityScore: totalSeverityScore,
				highestSeverity: highestSeverity,
				highestSeverityType: highestSeverityType,
				totalFindings: totalFindings,
				severityCounts: severityCounts
			};
		}).sort((a, b) => b.severityScore - a.severityScore).slice(0, 10);

		report.gpos.forEach(gpo => {
			totalSettings += gpo.settings.length;
			
			// Check if GPO is linked
			const hasLinks = gpo.header.links && gpo.header.links.length > 0;
			const hasOldLink = gpo.header.Link && (Array.isArray(gpo.header.Link) ? gpo.header.Link.length > 0 : gpo.header.Link.trim() !== '');
			if (hasLinks || hasOldLink) {
				linkedGpos++;
			} else {
				notLinkedGpos++;
			}
			
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

		return { totalGpos, totalSettings, linkedGpos, notLinkedGpos, findingsList, gposWithFindings, gposBySeverity };
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
							<div className="stat-details">
								<span className="policy-status enabled">Linked: {summary.linkedGpos}</span>
								<span className="policy-status disabled">Not linked: {summary.notLinkedGpos}</span>
							</div>
						</div>
						<div className="stat-card">
							<span className="stat-number">{summary.findingsList.reduce((a, b) => a + b.count, 0)}</span>
							<span className="stat-label"> Findings</span>
							<div className="stat-details">
								{summary.findingsList.map((finding, idx) => (
									<span key={idx} className={`policy-status rating-${finding.type.toLowerCase()}`}>
										{finding.type}: {finding.count}
									</span>
								))}
							</div>
						</div>
						<div className="stat-card">
							<span className="stat-number">{summary.totalSettings}</span>
							<span className="stat-label"> Settings</span>
						</div>
					</div>
				</div>

				<div className="insights-section insights-section-expanded">
					<div className="insights-grid">
						<div className="insights-column">
							<h2>Top GPOs by Findings</h2>
							<div className="insights-card compact">
								{summary.gposWithFindings.length === 0 ? (
									<div className="no-data">No GPOs found</div>
								) : (
									<div className="insights-list compact">
										{summary.gposWithFindings.map((gpo, idx) => (
											<div key={idx} className="insight-item compact">
												<div className="insight-rank compact">#{idx + 1}</div>
												<div className="insight-content">
													<div className="insight-primary compact">{gpo.name}</div>
													<div className="insight-secondary compact">{gpo.findingsCount} findings</div>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
						
						<div className="insights-column">
							<h2>Top GPOs by Severity</h2>
							<div className="insights-card compact">
								{summary.gposBySeverity.length === 0 ? (
									<div className="no-data">No GPOs found</div>
								) : (
									<div className="insights-list compact">
										{summary.gposBySeverity.map((gpo, idx) => (
											<div key={idx} className="insight-item compact">
												<div className="insight-rank compact">#{idx + 1}</div>
												<div className="insight-content">
													<div className="insight-primary compact">{gpo.name}</div>
													<div className="insight-secondary compact">
														<span className="severity-breakdown">
															{Object.entries(gpo.severityCounts)
																.sort(([a], [b]) => {
																	const severityA = a === 'Black' ? 4 : a === 'Red' ? 3 : a === 'Yellow' ? 2 : a === 'Green' ? 1 : 0;
																	const severityB = b === 'Black' ? 4 : b === 'Red' ? 3 : b === 'Yellow' ? 2 : b === 'Green' ? 1 : 0;
																	return severityB - severityA;
																})
																.map(([type, count]) => `${count} ${type}`)
																.join(' - ')}
														</span>
														<span className="severity-score">Score: {gpo.severityScore}</span>
													</div>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};


