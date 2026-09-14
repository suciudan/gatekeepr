export const BLOCKING_THREATS = new Set([
	"domain_missing",
	"domain_invalid",
	"domain_unregistered",
	"domain_expired",
	"domain_mx_disposable_infra",
	"ip_tor_exit_node",
	"ip_blocklist_spamhaus_drop",
	"ip_blocklist_net_ua",
	"email_disposable",
	"email_local_sep_abuse",
	"email_local_double_sep",
	"email_local_sep_high_count",
	"email_local_sep_high_density"
])
