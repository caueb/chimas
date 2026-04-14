import React, { useMemo } from 'react';
import { GPOReport } from '../utils/GPOParser';
import type { BloodHoundData } from '../types/BloodHound';
import { getBloodHoundSummary, resolveGPOAssets, normalizeAdGuid } from '../utils/bloodhoundParser';
import { detectMisconfigurations } from '../utils/misconfigDetection';
import { SEVERITY_COLORS } from '../utils/constants';

interface GPODashboardProps {
	report: GPOReport;
	bloodHoundData: BloodHoundData | null;
	onLoadBloodHound: () => void;
}

export const GPODashboard: React.FC<GPODashboardProps> = ({ report, bloodHoundData, onLoadBloodHound }) => {
	const summary = useMemo(() => {
		const totalGpos = report.gpos.length;
		let totalSettings = 0;
		let linkedGpos = 0;
		let notLinkedGpos = 0;
		const findingCounts: Record<string, number> = {};

		const severityRank = (t?: string) => {
			switch ((t || '').toLowerCase()) {
				case 'black': return 4;
				case 'red': return 3;
				case 'yellow': return 2;
				case 'green': return 1;
				default: return 0;
			}
		};

		const gposWithFindings = report.gpos.map(gpo => {
			const findingsCount = gpo.settings.reduce((total, setting) => {
				return total + (setting.findings ? setting.findings.length : 0);
			}, 0);
			return { name: gpo.header.gpo || gpo.startedAtRaw || 'GPO', findingsCount };
		}).sort((a, b) => b.findingsCount - a.findingsCount).slice(0, 10);

		const gposBySeverity = report.gpos.map(gpo => {
			let totalSeverityScore = 0;
			const severityCounts: Record<string, number> = {};
			gpo.settings.forEach(setting => {
				(setting.findings || []).forEach(finding => {
					const findingType = finding.type || 'Unknown';
					severityCounts[findingType] = (severityCounts[findingType] || 0) + 1;
				});
			});
			Object.entries(severityCounts).forEach(([findingType, count]) => {
				totalSeverityScore += severityRank(findingType) * count;
			});
			return {
				name: gpo.header.gpo || gpo.startedAtRaw || 'GPO',
				severityScore: totalSeverityScore,
				severityCounts,
			};
		}).sort((a, b) => b.severityScore - a.severityScore).slice(0, 10);

		report.gpos.forEach(gpo => {
			totalSettings += gpo.settings.length;
			const hasLinks = gpo.header.links && gpo.header.links.length > 0;
			const hasOldLink = gpo.header.Link && (Array.isArray(gpo.header.Link) ? gpo.header.Link.length > 0 : gpo.header.Link.trim() !== '');
			if (hasLinks || hasOldLink) linkedGpos++;
			else notLinkedGpos++;

			gpo.settings.forEach(s => {
				(s.findings || []).forEach(f => {
					const key = (f.type || 'Unknown').toString();
					findingCounts[key] = (findingCounts[key] || 0) + 1;
				});
			});
		});

		const ratingOrder = ['Red', 'Yellow', 'Green', 'Black', 'Unknown'];
		const findingsList = ratingOrder
			.filter(k => findingCounts[k])
			.map(k => ({ type: k, count: findingCounts[k] }));

		return { totalGpos, totalSettings, linkedGpos, notLinkedGpos, findingsList, gposWithFindings, gposBySeverity };
	}, [report]);

	const bhSummary = useMemo(() => {
		if (!bloodHoundData) return null;
		const stats = getBloodHoundSummary(bloodHoundData);

		const gpoCoverage = report.gpos
			.filter(gpo => gpo.header.gpoId)
			.map(gpo => {
				const assets = resolveGPOAssets(bloodHoundData, gpo.header.gpoId!, gpo.header.links);
				return {
					name: gpo.header.gpo || 'Unknown GPO',
					computers: assets.totalComputers,
					users: assets.totalUsers,
					groups: assets.totalGroups,
					isDomainWide: assets.isDomainWide,
				};
			})
			.sort((a, b) => (b.computers + b.users) - (a.computers + a.users));

		const allComputers = new Set<string>();
		const allUsers = new Set<string>();
		report.gpos.forEach(gpo => {
			if (!gpo.header.gpoId) return;
			const assets = resolveGPOAssets(bloodHoundData, gpo.header.gpoId, gpo.header.links);
			assets.computers.forEach(c => allComputers.add(c.name));
			assets.users.forEach(u => allUsers.add(u.name));
		});

		const correlatedCount = report.gpos.filter(gpo => {
			if (!gpo.header.gpoId) return false;
			return bloodHoundData.adGuidToBhId.has(normalizeAdGuid(gpo.header.gpoId));
		}).length;

		return {
			...stats,
			gpoCoverage,
			uniqueComputers: allComputers.size,
			uniqueUsers: allUsers.size,
			correlatedCount,
		};
	}, [bloodHoundData, report]);

	const totalFindings = summary.findingsList.reduce((a, b) => a + b.count, 0);

	// Misconfigurations summary
	const misconfigSummary = useMemo(() => {
		const misconfigs = detectMisconfigurations(report);
		const bySeverity: Record<string, number> = {};
		misconfigs.forEach(m => {
			bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
		});

		// Top misconfigs sorted by severity, then pick top 4
		const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
		const topItems = [...misconfigs]
			.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5))
			.slice(0, 4)
			.map(m => {
				// If BH is loaded, compute affected assets for this misconfig
				let affectedComputers = 0;
				let affectedUsers = 0;
				if (bloodHoundData && m.gpoCount === 0) {
					// Default = all domain assets
					affectedComputers = bloodHoundData.computers.size;
					affectedUsers = bloodHoundData.users.size;
				} else if (bloodHoundData && m.gpoCount > 0) {
					const computers = new Set<string>();
					const users = new Set<string>();
					for (const gpoNames of Object.values(m.gposByValue)) {
						for (const gpoName of gpoNames) {
							const gpo = report.gpos.find(g => g.header.gpo === gpoName);
							if (gpo?.header.gpoId) {
								const assets = resolveGPOAssets(bloodHoundData, gpo.header.gpoId, gpo.header.links);
								assets.computers.forEach(c => computers.add(c.name));
								assets.users.forEach(u => users.add(u.name));
							}
						}
					}
					affectedComputers = computers.size;
					affectedUsers = users.size;
				}
				return {
					name: m.name,
					severity: m.severity,
					gpoCount: m.gpoCount,
					affectedComputers,
					affectedUsers,
				};
			});

		return {
			total: misconfigs.length,
			bySeverity,
			topItems,
		};
	}, [report, bloodHoundData]);

	return (
		<div className="gpo-dashboard">
			{/* ── Summary Strip ── */}
			<div className="gpo-dash-row">
				<div className="gpo-dash-summary">
					<div className="gpo-dash-summary-item">
						<span className="gpo-dash-summary-num">{summary.totalGpos}</span>
						<span className="gpo-dash-summary-label">GPOs</span>
						<span className="gpo-dash-summary-sub">
							<span className="policy-status enabled">{summary.linkedGpos} linked</span>
							{summary.notLinkedGpos > 0 && (
								<span className="policy-status disabled">{summary.notLinkedGpos} unlinked</span>
							)}
						</span>
					</div>
					<div className="gpo-dash-summary-sep"></div>
					<div className="gpo-dash-summary-item">
						<span className="gpo-dash-summary-num">{summary.totalSettings}</span>
						<span className="gpo-dash-summary-label">Settings</span>
					</div>
					<div className="gpo-dash-summary-sep"></div>
					<div className="gpo-dash-summary-item">
						<span className={`gpo-dash-summary-num ${totalFindings === 0 ? 'muted' : ''}`}>{totalFindings}</span>
						<span className="gpo-dash-summary-label">Findings</span>
						{summary.findingsList.length > 0 && (
							<span className="gpo-dash-summary-sub">
								{summary.findingsList.map((f, i) => (
									<span key={i} className={`policy-status rating-${f.type.toLowerCase()}`}>
										{f.count} {f.type}
									</span>
								))}
							</span>
						)}
					</div>
				</div>
			</div>

			{/* ── Row 2: GPO Lists (side by side, scrollable) ── */}
			<div className="gpo-dash-row gpo-dash-columns">
				<div className="gpo-dash-panel">
					<h3 className="gpo-dash-panel-title">Top GPOs by Findings</h3>
					<div className="gpo-dash-list gpo-dash-list-scroll">
						{summary.gposWithFindings.slice(0, 10).map((gpo, idx) => (
							<div key={idx} className="gpo-dash-list-item">
								<span className="gpo-dash-list-rank">#{idx + 1}</span>
								<span className="gpo-dash-list-name">{gpo.name}</span>
								<span className="gpo-dash-list-value">{gpo.findingsCount}</span>
							</div>
						))}
					</div>
				</div>
				<div className="gpo-dash-panel">
					<h3 className="gpo-dash-panel-title">Top GPOs by Severity</h3>
					<div className="gpo-dash-list gpo-dash-list-scroll">
						{summary.gposBySeverity.slice(0, 10).map((gpo, idx) => (
							<div key={idx} className="gpo-dash-list-item">
								<span className="gpo-dash-list-rank">#{idx + 1}</span>
								<span className="gpo-dash-list-name">{gpo.name}</span>
								<span className="gpo-dash-list-value">
									{Object.entries(gpo.severityCounts).length > 0 ? (
										Object.entries(gpo.severityCounts)
											.sort(([a], [b]) => {
												const sa = a === 'Black' ? 4 : a === 'Red' ? 3 : a === 'Yellow' ? 2 : a === 'Green' ? 1 : 0;
												const sb = b === 'Black' ? 4 : b === 'Red' ? 3 : b === 'Yellow' ? 2 : b === 'Green' ? 1 : 0;
												return sb - sa;
											})
											.map(([type, count]) => (
												<span key={type} className={`gpo-dash-severity-chip rating-${type.toLowerCase()}`}>
													{count} {type}
												</span>
											))
									) : (
										<span className="gpo-dash-severity-chip muted">Score: {gpo.severityScore}</span>
									)}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* ── Row 3: Misconfigurations ── */}
			{misconfigSummary.total > 0 && (
				<div className="gpo-dash-row">
					<div className="gpo-dash-misconfig">
						<div className="gpo-dash-misconfig-header">
							<h3 className="gpo-dash-section-title">
								<i className="fas fa-exclamation-triangle"></i> Security Misconfigurations
							</h3>
							<div className="gpo-dash-misconfig-badges">
								{(['critical', 'high', 'medium', 'low'] as const).map(sev => {
									const count = misconfigSummary.bySeverity[sev];
									if (!count) return null;
									return (
										<span
											key={sev}
											className="gpo-dash-misconfig-badge"
											style={{
												backgroundColor: SEVERITY_COLORS[sev]?.badge ?? 'var(--bg-overlay)',
												color: SEVERITY_COLORS[sev]?.text ?? 'var(--text)',
											}}
										>
											{count} {sev}
										</span>
									);
								})}
								<span className="gpo-dash-misconfig-total">{misconfigSummary.total} total</span>
							</div>
						</div>
						<div className="gpo-dash-list">
							{misconfigSummary.topItems.map((item, idx) => (
								<div key={idx} className="gpo-dash-list-item">
									<span
										className="gpo-dash-misconfig-sev"
										style={{
											backgroundColor: SEVERITY_COLORS[item.severity]?.badge ?? 'var(--bg-overlay)',
											color: SEVERITY_COLORS[item.severity]?.text ?? 'var(--text)',
										}}
									>
										{item.severity.toUpperCase()}
									</span>
									<span className="gpo-dash-list-name">{item.name}</span>
									<span className="gpo-dash-list-value">
										{item.gpoCount === 0 ? (
											<span className="gpo-dash-misconfig-default">default</span>
										) : (
											<span>{item.gpoCount} GPO{item.gpoCount !== 1 ? 's' : ''}</span>
										)}
										{bloodHoundData && (item.affectedComputers > 0 || item.affectedUsers > 0) && (
											<span className="gpo-dash-asset-counts">
												<span><i className="fas fa-desktop"></i> {item.affectedComputers}</span>
												<span><i className="fas fa-user"></i> {item.affectedUsers}</span>
											</span>
										)}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			)}

			{/* ── Row 4: BloodHound ── */}
			{!bhSummary ? (
				<div className="gpo-dash-row">
					<div className="gpo-dash-bh-prompt" onClick={onLoadBloodHound}>
						<i className="fas fa-project-diagram"></i>
						<div>
							<strong>Load BloodHound Data</strong>
							<p>See which computers, users, and groups are affected by each GPO.</p>
						</div>
						<i className="fas fa-chevron-right gpo-dash-bh-arrow"></i>
					</div>
				</div>
			) : (
				<>
					<div className="gpo-dash-row">
						<h3 className="gpo-dash-section-title">
							<i className="fas fa-project-diagram"></i> BloodHound Coverage
						</h3>
						<div className="gpo-dash-stats">
							<div className="gpo-dash-stat">
								<div className="gpo-dash-stat-number">{bhSummary.correlatedCount}/{summary.totalGpos}</div>
								<div className="gpo-dash-stat-label">GPOs Matched</div>
							</div>
							<div className="gpo-dash-stat">
								<div className="gpo-dash-stat-number">{bhSummary.uniqueComputers}</div>
								<div className="gpo-dash-stat-label">Computers</div>
							</div>
							<div className="gpo-dash-stat">
								<div className="gpo-dash-stat-number">{bhSummary.uniqueUsers}</div>
								<div className="gpo-dash-stat-label">Users</div>
							</div>
						</div>
					</div>

					{bhSummary.gpoCoverage.length > 0 && (
						<div className="gpo-dash-row">
							<div className="gpo-dash-panel">
								<h3 className="gpo-dash-panel-title">GPO Asset Coverage</h3>
								<div className="gpo-dash-list gpo-dash-list-scroll-lg">
									{bhSummary.gpoCoverage.slice(0, 10).map((gpo, idx) => (
										<div key={idx} className="gpo-dash-list-item">
											<span className="gpo-dash-list-rank">#{idx + 1}</span>
											<span className="gpo-dash-list-name">
												{gpo.name}
												{gpo.isDomainWide && <span className="bh-domain-badge">Domain-wide</span>}
											</span>
											<span className="gpo-dash-list-value gpo-dash-asset-counts">
												<span><i className="fas fa-desktop"></i> {gpo.computers}</span>
												<span><i className="fas fa-user"></i> {gpo.users}</span>
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
};
